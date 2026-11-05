import os from 'node:os';
import { findBin, runCli } from './run-cli.mjs';
import { readEnvKey } from '../env.mjs';
import { decodeExtSession, getSelectedModel, getSelectedEffort } from '../store.mjs';
import { enrichPath, ensureProviderCli } from '../ensure-cli.mjs';
import {
  hasNativeCodexAuth,
  readCodexNativeConfig,
  resolveCodexModel,
  resolveCodexEffort,
  isValidCodexThreadId,
  isCodexSessionSentinel,
} from '../codex-native.mjs';
import {
  ensureCodexStableTransport,
  codexHttpProviderOverrides,
} from '../codex-transport.mjs';

export function isCodexStreamCutMessage(text) {
  return /stream disconnected|websocket closed|Reconnecting\.\.\.\s*\d+\/\d+|Falling back from WebSockets/i.test(
    String(text || ''),
  );
}

export function parseCodexStdout(stdout) {
  const lines = String(stdout || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let last = '';
  let threadId = null;
  let usage = null;
  let turnCompleted = false;
  let turnFailed = null;
  let streamCutSeen = false;
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'thread.started' && ev.thread_id) threadId = ev.thread_id;
      if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
        last = ev.item.text;
        if (isCodexStreamCutMessage(last)) streamCutSeen = true;
      }
      if (ev.type === 'turn.completed') {
        turnCompleted = true;
        // Успешное завершение важнее промежуточных Reconnecting… в agent_message.
        turnFailed = null;
        if (ev.usage && typeof ev.usage === 'object') usage = ev.usage;
        if (typeof ev.result === 'string' && ev.result.trim()) last = ev.result;
      }
      if (ev.type === 'turn.failed') {
        turnFailed = ev.error?.message || ev.message || 'turn.failed';
        if (isCodexStreamCutMessage(turnFailed)) streamCutSeen = true;
      }
      if (ev.type === 'error' && (ev.message || ev.error)) {
        turnFailed = String(ev.message || ev.error);
        if (isCodexStreamCutMessage(turnFailed)) streamCutSeen = true;
      }
    } catch {
      /* JSONL only */
    }
  }
  // Обрыв WS — ошибка только если ход так и не завершился (иначе HTTP-fallback успел).
  if (!turnCompleted && streamCutSeen && !turnFailed) {
    turnFailed = last || 'stream disconnected before completion (websocket)';
  }
  return {
    text: last,
    threadId,
    usage,
    turnCompleted,
    turnFailed,
    streamCut: streamCutSeen && !turnCompleted,
  };
}

export function buildCodexExecArgs({ model, effort, resumeId, forceHttp = true }) {
  const args = [
    'exec',
    '--json',
    '--sandbox',
    'danger-full-access',
    '--skip-git-repo-check',
    '-c',
    'approval_policy="never"',
    ...codexHttpProviderOverrides(forceHttp),
  ];
  if (model) {
    args.push('-m', model);
    args.push('-c', `model=${JSON.stringify(model)}`);
  }
  if (effort) {
    args.push('-c', `model_reasoning_effort=${JSON.stringify(effort)}`);
  }
  if (resumeId) {
    args.push('resume', resumeId);
  }
  args.push('-');
  return args;
}

function resolveResumeId(parsed) {
  const decoded = parsed?.resume ? decodeExtSession(parsed.resume) : null;
  if (decoded?.providerId === 'codex') {
    if (isValidCodexThreadId(decoded.nativeId)) {
      return { resumeId: decoded.nativeId, dropped: null };
    }
    console.error(
      `[msb/ext/codex] drop bad resume id (${decoded.nativeId || 'empty'}${
        isCodexSessionSentinel(decoded.nativeId) ? ', sentinel' : ''
      }) → new thread`,
    );
    return { resumeId: null, dropped: decoded.nativeId || 'invalid' };
  }
  if (parsed?.resume && !decoded) {
    console.error(`[msb/ext/codex] ignore non-ext resume → new thread`);
    return { resumeId: null, dropped: 'non-ext' };
  }
  return { resumeId: null, dropped: null };
}

function streamCutUserText(raw, partial) {
  const bits = [
    'Codex: связь с моделью оборвалась (websocket). Если повтор не помог — напиши ещё раз.',
  ];
  if (partial) bits.push('', 'Черновик до обрыва:', partial);
  if (raw && raw !== partial) bits.push('', String(raw).slice(0, 500));
  return bits.join('\n');
}

async function execOnce({
  bin,
  prompt,
  cwd,
  childEnv,
  model,
  effort,
  resumeId,
  forceHttp,
}) {
  const args = buildCodexExecArgs({ model, effort, resumeId, forceHttp });
  const res = await runCli(bin, args, {
    cwd,
    env: childEnv,
    input: prompt,
    forwardStderr: false,
  });
  const parsedOut = parseCodexStdout(res.stdout);
  // Иногда reconnect пишет только в stderr
  const errTail = String(res.stderr || '').trim();
  if (!parsedOut.turnCompleted && isCodexStreamCutMessage(errTail)) {
    parsedOut.streamCut = true;
    parsedOut.turnFailed = parsedOut.turnFailed || errTail.slice(-500);
  }
  if (res.timedOut) {
    return {
      ok: false,
      text: `Codex: таймаут ожидания ответа${parsedOut.text ? `\n\nЧерновик:\n${parsedOut.text}` : ''}`,
      model: model || undefined,
      streamCut: true,
      nativeSessionId: isValidCodexThreadId(parsedOut.threadId) ? parsedOut.threadId : undefined,
    };
  }
  return { res, parsedOut, model };
}

function finalizeParsed({ res, parsedOut, model, resumeRequested }) {
  if (parsedOut.turnFailed) {
    const raw = String(parsedOut.turnFailed);
    const streamCut = parsedOut.streamCut || isCodexStreamCutMessage(raw);
    const partial = (parsedOut.text || '').trim();
    const draft = partial && !isCodexStreamCutMessage(partial) ? partial : '';
    return {
      ok: false,
      text: streamCut ? streamCutUserText(raw, draft) : `Codex: ${raw}`,
      model: model || undefined,
      streamCut,
      partialText: draft || undefined,
    };
  }

  const text = (parsedOut.text || '').trim();
  let threadId = parsedOut.threadId;

  if (resumeRequested && !threadId) {
    if (!(res.code === 0 && parsedOut.turnCompleted && text)) {
      return {
        ok: false,
        text: 'Codex resume не вернул native session id. Напиши ещё раз — начну новый тред.',
        model: model || undefined,
      };
    }
  } else if (resumeRequested && threadId && threadId !== resumeRequested) {
    console.error(
      `[msb/ext/codex] resume thread changed ${resumeRequested} → ${threadId} (accept if turn ok)`,
    );
  }

  const ok =
    res.code === 0 &&
    parsedOut.turnCompleted &&
    !!text &&
    !isCodexStreamCutMessage(text) &&
    isValidCodexThreadId(threadId);

  if (!ok) {
    const why = [];
    if (res.code !== 0) why.push(`код ${res.code}`);
    if (!parsedOut.turnCompleted) why.push('нет turn.completed');
    if (!text) why.push('пустой ответ');
    if (!isValidCodexThreadId(threadId)) why.push('нет валидной native session');
    const streamCut = parsedOut.streamCut || isCodexStreamCutMessage(text);
    return {
      ok: false,
      text: streamCut
        ? streamCutUserText(text, '')
        : text || `Codex не завершил ход (${why.join(', ')})`,
      model: model || undefined,
      usage: parsedOut.usage || undefined,
      streamCut,
    };
  }

  return {
    ok: true,
    text,
    nativeSessionId: threadId,
    model: model || undefined,
    usage: parsedOut.usage || undefined,
  };
}

export async function runCodexTurn({ prompt, parsed, cwd, env, home = os.homedir() }) {
  const envPath = { ...env, PATH: enrichPath(env, home) };
  let bin = findBin('codex', envPath);
  if (!bin) {
    const ensured = await ensureProviderCli('codex', { env: envPath, home });
    if (!ensured.ok) return { ok: false, text: ensured.error || 'Codex CLI не установлен' };
    bin = ensured.bin;
  }

  const access = await readEnvKey('CODEX_ACCESS_TOKEN', env, home);
  const apiKey = await readEnvKey('OPENAI_API_KEY', env, home);
  const nativeOk = await hasNativeCodexAuth(home);
  if (!nativeOk && !access && !apiKey) {
    return {
      ok: false,
      text:
        'Нет нативной авторизации Codex (~/.codex/auth.json). Подключи ChatGPT через «🔌 Подключение» → Codex → «Войти».',
    };
  }

  // HTTP-only provider — до первого хода, иначе 5× reconnect на WS.
  try {
    const tr = await ensureCodexStableTransport(home);
    if (tr.changed) {
      console.error(
        `[msb/ext/codex] transport → ${tr.providerId}${tr.baseUrl ? ` (${tr.baseUrl})` : ''}`,
      );
    }
  } catch (err) {
    console.error('[msb/ext/codex] ensure transport failed:', err?.message || err);
  }

  const nativeConfig = await readCodexNativeConfig(home);
  const preferred = await getSelectedModel('codex', env, home);
  const preferredEffort = await getSelectedEffort('codex', env, home);
  const model = resolveCodexModel(parsed?.model, nativeConfig, preferred);
  const effort = preferredEffort || resolveCodexEffort(nativeConfig);

  const childEnv = { ...envPath };
  if (!nativeOk && access) childEnv.CODEX_ACCESS_TOKEN = access;
  if (!nativeOk && apiKey) childEnv.OPENAI_API_KEY = apiKey;

  const { resumeId: resumeRequested } = resolveResumeId(parsed);

  const run = (resumeId) =>
    execOnce({
      bin,
      prompt,
      cwd,
      childEnv,
      model,
      effort,
      resumeId,
      forceHttp: true,
    });

  let raw = await run(resumeRequested);
  if (raw.ok === false) return raw; // timedOut / early fail
  let result = finalizeParsed({ ...raw, resumeRequested });

  // Один автоматический повтор после обрыва WS: новый тред, уже на HTTP provider.
  if (!result.ok && result.streamCut) {
    console.error('[msb/ext/codex] stream cut → retry once without resume');
    try {
      await ensureCodexStableTransport(home);
    } catch {
      /* ignore */
    }
    raw = await run(null);
    if (raw.ok === false) return raw;
    result = finalizeParsed({ ...raw, resumeRequested: null });
    if (result.ok) {
      result.text = `${result.text}\n\n_(повтор после обрыва websocket)_`;
    }
  }

  return result;
}
