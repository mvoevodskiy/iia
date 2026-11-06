import {
  hasClaudeAuth,
  loadState,
  resolveEffort,
  resolveModel,
  resolvePermMode,
  updateState,
} from '../state.mjs';
import { runClaudeTurn } from './claude.mjs';
import { buildSystemPrompt } from './system-prompt.mjs';
import { readSessionContext } from './context.mjs';

/**
 * Один ход агента для чата или автономии.
 * Навигация: [Исполнение](./README.md) → [runner](./claude.mjs), [context](./context.mjs).
 */
export async function runAgentTurn({
  prompt,
  signal,
  onStatus,
  autonomy = false,
  env = process.env,
} = {}) {
  const aborted = () => ({ ok: false, error: 'aborted', text: 'Остановлено.' });
  if (signal?.aborted) return aborted();
  const { state } = await loadState(env);
  if (!hasClaudeAuth(env, state)) {
    return {
      ok: false,
      error: 'setup',
      text: 'AI ещё не подключён. Открой /start → «🔌 Подключение» или задай CLAUDE_CODE_OAUTH_TOKEN.',
    };
  }

  if (state.engine === 'oc') {
    return {
      ok: false,
      error: 'engine_oc',
      text: 'Движок OpenClaw в open-core пока не реализован. Переключись на Claude Code в настройках.',
    };
  }

  const model = resolveModel(state);
  const effort = resolveEffort(state);
  const permissionMode = resolvePermMode(state);
  const systemPrompt = await buildSystemPrompt();

  if (signal?.aborted) return aborted();

  let lastTool = '';
  const result = await runClaudeTurn({
    prompt,
    sessionId: state.ccSessionId || undefined,
    // Bind this turn to the provider observed with the session, even if the
    // menu changes the selected provider before the child process starts.
    providerId: state.extAuthBypass || 'claude',
    model,
    effort,
    permissionMode,
    systemPrompt,
    signal,
    autonomy,
    onEvent(ev) {
      if (ev.type === 'system' && ev.subtype === 'provider') {
        onStatus?.({ kind: 'provider', providerId: ev.provider_id });
      } else if (ev.type === 'assistant') {
        for (const part of ev.message?.content || []) {
          if (part.type === 'tool_use' && part.name) {
            lastTool = part.name;
            onStatus?.({ kind: 'tool', name: part.name, input: summarizeInput(part.input), rawInput: part.input });
          } else if (part.type === 'text' && part.text) {
            onStatus?.({ kind: 'text', preview: part.text.slice(0, 80) });
          } else if (part.type === 'thinking') {
            onStatus?.({ kind: 'thinking' });
          }
        }
      } else if (ev.type === 'system' && ev.subtype === 'init') {
        onStatus?.({ kind: 'init', model: ev.model, sessionId: ev.session_id });
      }
    },
  });

  result.context = await readSessionContext(result.sessionId, env);
  if (result.sessionId && !result.isError && !result.aborted && !signal?.aborted) {
    await updateState((s) => {
      // /newtask during a running turn must not resurrect the old session.
      if (signal?.aborted || s.ccSessionId !== state.ccSessionId || (s.sessionEpoch || 0) !== (state.sessionEpoch || 0) || s.extAuthBypass !== state.extAuthBypass) {
        result.context = null;
        return s;
      }
      s.ccSessionId = result.sessionId;
      s.lastCcUsage = { ...result.usage, ...result.context, model: result.model,
        sessionId: result.sessionId, updatedAt: new Date().toISOString() };
      return s;
    }, env);
  }

  if (signal?.aborted || result.aborted) {
    return { ok: false, error: 'aborted', text: 'Остановлено.', result };
  }

  const text =
    result.text ||
    (result.isError
      ? `Ход завершился с ошибкой${result.subtype ? ` (${result.subtype})` : ''}.${result.stderr ? `\n\n${result.stderr.slice(0, 500)}` : ''}`
      : lastTool
        ? `(ход без текста; последний инструмент: ${lastTool})`
        : '(пустой ответ)');

  return { ok: !result.isError, text, result };
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return '';
  const file = input.file_path || input.path || input.command || input.pattern || '';
  return String(file).slice(0, 60);
}
