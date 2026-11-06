#!/usr/bin/env node
import '../../shared/preload.mjs';
/**
 * Точка входа shim `claude`: либо настоящий Claude Code, либо адаптер Cursor/Codex/Qwen
 * с эмуляцией stream-json для парсера бандла.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, encodeExtSession, setSession, decodeExtSession } from '../store.mjs';
import { parseClaudeArgv, readStdin, buildPrompt } from '../adapters/parse-args.mjs';
import { emitInit, emitAssistantText, emitResult, emitError } from '../adapters/stream.mjs';
import { runCursorTurn, isCursorSessionId } from '../adapters/cursor.mjs';
import { runCodexTurn } from '../adapters/codex.mjs';
import { runQwenTurn } from '../adapters/qwen.mjs';
import { isValidCodexThreadId } from '../codex-native.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRealClaude(env = process.env) {
  if (env.MSB_REAL_CLAUDE && fs.existsSync(env.MSB_REAL_CLAUDE)) return env.MSB_REAL_CLAUDE;
  const candidates = [
    '/usr/bin/claude',
    '/usr/local/bin/claude',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
  ];
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* continue */
    }
  }
  // PATH без нашего shim/bin
  const shimBin = path.resolve(__dirname, 'bin');
  for (const dir of (env.PATH || '').split(':')) {
    if (!dir || path.resolve(dir) === shimBin) continue;
    const c = path.join(dir, 'claude');
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* continue */
    }
  }
  return null;
}

function stripForeignResume(argv) {
  // При возврате на Claude чужой ext session id не должен уходить в его CLI.
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resume') {
      const id = argv[i + 1];
      if (id && decodeExtSession(id)) {
        i += 1;
        continue;
      }
    }
    out.push(argv[i]);
  }
  return out;
}

function passthroughClaude(realBin, argv) {
  const safeArgv = stripForeignResume(argv);
  const isJs = realBin.endsWith('.js') || realBin.endsWith('.mjs') || realBin.endsWith('.cjs');
  const cmd = isJs ? process.execPath : realBin;
  const args = isJs ? [realBin, ...safeArgv] : safeArgv;
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

function acceptNativeSession(providerId, nativeId) {
  if (!nativeId || typeof nativeId !== 'string') return null;
  if (providerId === 'codex') return isValidCodexThreadId(nativeId) ? nativeId : null;
  if (providerId === 'cursor') return isCursorSessionId(nativeId) ? nativeId.trim() : null;
  // Qwen: не сохраняем фиктивные timestamp id / маркеры ошибок
  if (/^[cxq]\d{10,}$/i.test(nativeId)) return null;
  if (nativeId === 'failed' || nativeId === 'error' || nativeId === 'unknown') return null;
  return nativeId;
}

async function runAlternate(providerId, argv) {
  const parsed = parseClaudeArgv(argv);
  const userText = await readStdin();
  const prompt = await buildPrompt(parsed, userText, { providerId });
  console.error(`[msb/ext/shim] turn via ${providerId} (prompt=${prompt.length}ch)`);

  const ctx = {
    prompt,
    parsed,
    cwd: process.cwd(),
    env: process.env,
  };

  let result;
  try {
    if (providerId === 'cursor') result = await runCursorTurn(ctx);
    else if (providerId === 'codex') result = await runCodexTurn(ctx);
    else if (providerId === 'qwen') result = await runQwenTurn(ctx);
    else {
      const fallbackId = encodeExtSession(providerId, 'unknown');
      emitError(`Неизвестный провайдер: ${providerId}`, fallbackId);
      process.exit(1);
      return;
    }
  } catch (err) {
    const msg = err?.code === 'ENOENT'
      ? `CLI провайдера «${providerId}» не найден в PATH`
      : String(err.message || err);
    const fallbackId = encodeExtSession(providerId, 'error');
    emitError(msg, fallbackId);
    process.exit(1);
    return;
  }

  let nativeId = acceptNativeSession(providerId, result.nativeSessionId);
  const modelLabel = result.model || `ext/${providerId}`;

  // Сначала отдаём ответ в поток бота; служебное сохранение session не должно его съесть.
  // Важно: не писать session_id вида ext:cursor:failed — бандл делает --resume и CLI падает с кодом 1.
  // Sentinel norestart адаптеры должны игнорировать (новый тред), а не отвечать «повреждённый ID».
  if (!result.ok) {
    if (providerId === 'codex') {
      // A transport/model error does not invalidate an existing conversation.
      const errId = parsed.resume || '';
      emitInit({ sessionId: errId, model: modelLabel, providerId });
      emitError(result.text || 'ход не завершён', errId, { model: modelLabel });
      process.exit(1);
      return;
    }
    try {
      await setSession(providerId, null);
    } catch {
      /* non-fatal */
    }
    const errId = encodeExtSession(providerId, 'norestart');
    emitInit({ sessionId: errId, model: modelLabel, providerId });
    emitError(result.text || 'ход не завершён', errId, { model: modelLabel });
    process.exit(1);
    return;
  }

  if (!nativeId) {
    // Текст есть, нативный id нет — всё равно отдаём ход; resume на следующем ходе не взлетит.
    nativeId = `norestart-${Date.now().toString(36)}`;
  }

  const finalSession = encodeExtSession(providerId, nativeId);
  emitInit({ sessionId: finalSession, model: modelLabel, providerId });
  emitAssistantText(result.text, finalSession, { model: modelLabel, usage: result.usage, providerId });
  emitResult({
    sessionId: finalSession,
    text: result.text,
    isError: false,
    model: modelLabel,
    usage: result.usage,
    providerId,
  });

  if (!String(nativeId).startsWith('norestart-')) {
    try {
      await setSession(providerId, nativeId);
    } catch (err) {
      console.error('[msb/ext/shim] setSession failed (ответ уже отдан):', err?.message || err);
    }
  }

  process.exit(0);
}

async function main() {
  const argv = process.argv.slice(2);
  let active = 'claude';
  try {
    active = (await loadStore()).active || 'claude';
  } catch (err) {
    console.error('[msb/ext/shim] store load failed:', err.message);
  }

  if (active === 'claude' || process.env.JARVIS_CC_ONLY === '1') {
    const real = resolveRealClaude();
    if (!real) {
      console.error('[msb/ext/shim] настоящий claude не найден (MSB_REAL_CLAUDE / PATH)');
      process.exit(127);
    }
    passthroughClaude(real, argv);
    return;
  }

  await runAlternate(active, argv);
}

main().catch((err) => {
  console.error('[msb/ext/shim] fatal:', err);
  process.exit(1);
});
