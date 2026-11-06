/** User-facing turn journal consumed by Pult; never reads native conversations. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { botRoot } from '../paths.mjs';

export function historyPreview(value) {
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/-----BEGIN [^-]*(?:PRIVATE KEY)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/g, '[скрыто]')
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, '[скрыто]')
    .replace(/\b(?:sk-|dg_)[A-Za-z0-9_-]{16,}\b/g, '[скрыто]')
    .replace(/(\b(?:password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[скрыто]')
    .replace(/([?&](?:token|key|tg|code|secret)=)[^&#\s]+/gi, '$1[скрыто]')
    .slice(0, 1000);
}

/** Append errors are deliberately isolated from the Telegram response/stop lifecycle. */
export async function beginTurnHistory({ input, env = process.env, now = Date.now, io = fs, log = console.error } = {}) {
  const root = botRoot(env);
  const started = now();
  const turnId = randomUUID();
  const query = historyPreview(input);
  let providerId = null;
  let completed = false;
  const append = async (relative, row) => {
    try {
      const file = path.join(root, relative);
      await io.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await io.appendFile(file, JSON.stringify(row) + '\n', { mode: 0o600 });
    } catch { try { log('[msb/history] journal write failed'); } catch {} }
  };
  const transcript = (at, row) => append(`transcripts/${at.slice(0, 10)}.jsonl`, { ts: at, turnId, providerId, ...row });
  await transcript(new Date(started).toISOString(), { role: 'user', text: query });
  return {
    provider(value) { if (['claude', 'codex', 'cursor', 'qwen'].includes(value)) providerId = value; },
    async finish({ status = 'error', text = '', delivered = false, result } = {}) {
      if (completed) return;
      completed = true;
      if (['claude', 'codex', 'cursor', 'qwen'].includes(result?.providerId)) providerId = result.providerId;
      const ended = now();
      const ts = new Date(ended).toISOString();
      const meta = { ts, turnId, providerId, status };
      const trace = { ...meta, query, elapsedMs: Math.max(0, ended - started) };
      // Alternate adapters do not yet report real tool counts. Unknown is not zero.
      if (providerId === 'claude' && Number.isSafeInteger(result?.toolCount) && result.toolCount >= 0) trace.toolCalls = result.toolCount;
      await append(`traces/${ts.slice(0, 10)}.jsonl`, trace);
      await transcript(ts, { role: 'assistant', status, text: delivered ? historyPreview(text) : '' });
      if (delivered && text) await append('chat-diary.jsonl', { ...meta, kind: 'agent_reply', summary: historyPreview(text) });
    },
  };
}
