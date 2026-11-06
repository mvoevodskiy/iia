import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSessionContext, formatContextUsage } from '../src/agent/context.mjs';

const id = '0199a213-81c0-7800-8aa1-bbab2a035a53';
const sessionId = `ext:codex:${id}`;

test('native context uses latest request including cache, survives rate-only updates and resets on compaction', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-context-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { HOME: home };
  const folder = path.join(home, '.codex/sessions/2026/11/05');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, `rollout-2026-11-05T10-00-00-${id}.jsonl`);
  const count = (used, limit = 475000) => JSON.stringify({ type: 'event_msg', payload: {
    type: 'token_count', info: { total_token_usage: { total_tokens: 1800000 },
      last_token_usage: { total_tokens: used, cached_input_tokens: used - 100 }, model_context_window: limit },
  } });
  await fs.writeFile(file, JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-6.1-terra' } }) + '\n' +
    count(50000) + '\n' + count(71142) + '\n' +
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: null } }) + '\n{partial');
  const value = await readSessionContext(sessionId, env);
  assert.equal(value.contextTokens, 71142);
  assert.equal(value.contextWindow, 475000);
  assert.equal(value.model, 'gpt-6.1-terra');
  assert.match(formatContextUsage(value), /Контекст: 15%/);
  assert.equal(await readSessionContext(undefined, env), null);
  assert.equal(await readSessionContext('ext:codex:../../auth', env), null);
  await fs.appendFile(file, '\n' + JSON.stringify({ type: 'compacted', payload: {} }) + '\n');
  assert.equal(await readSessionContext(sessionId, env), null);
  await fs.appendFile(file, count(12000, 258400) + '\n');
  assert.equal((await readSessionContext(sessionId, env)).contextTokens, 12000);
  await fs.appendFile(file, count(15000, null) + '\n');
  assert.equal(await readSessionContext(sessionId, env), null);
});
