import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compactSession } from '../src/agent/compact.mjs';
import { trySessionOperation } from '../src/agent/session-operation.mjs';

test('Claude requires a compact boundary in the original session', async () => {
  const state = { engine: 'cc', ccSessionId: 'claude-fixture', ccModel: 'sonnet', ccEffort: 'high' };
  let options;
  const runClaude = async (input) => {
    options = input;
    input.onEvent({ type: 'system', subtype: 'compact_boundary' });
    return { sessionId: state.ccSessionId, isError: false };
  };
  assert.deepEqual(await compactSession(state, { runClaude }), { ok: true });
  assert.equal(options.prompt, '/compact');
  assert.equal(options.providerId, 'claude');
  assert.equal(options.sessionId, state.ccSessionId);
  assert.equal(options.maxTurns, 1);
  assert.ok(options.disallowedTools.includes('Write'));
  assert.equal((await compactSession(state, { runClaude: async () => ({ sessionId: state.ccSessionId, isError: false }) })).ok, false);
  assert.equal((await compactSession(state, { runClaude: async (input) => {
    input.onEvent({ type: 'system', subtype: 'compact_boundary' });
    return { sessionId: 'other-session', isError: false };
  } })).ok, false);
});

test('only Codex is sent to its extension; unsupported providers and mismatched sessions are untouched', async () => {
  let calls = 0;
  const compactProvider = async (state) => { calls++; assert.equal(state.extAuthBypass, 'codex'); return { ok: true }; };
  const session = 'ext:codex:0199a213-81c0-7800-8aa1-bbab2a035a53';
  assert.equal((await compactSession({ engine: 'cc', extAuthBypass: 'codex', ccSessionId: session }, { compactProvider })).ok, true);
  assert.equal((await compactSession({ engine: 'cc', extAuthBypass: 'cursor', ccSessionId: 'ext:cursor:fixture' }, { compactProvider })).ok, false);
  assert.equal((await compactSession({ engine: 'oc', ccSessionId: session }, { compactProvider })).ok, false);
  assert.equal((await compactSession({ engine: 'cc', ccSessionId: session }, { compactProvider })).ok, false);
  assert.equal(calls, 1);
});

test('a stale session never starts Claude and a guard is scoped to one bot', async (t) => {
  let called = false;
  const result = await compactSession({ ccSessionId: 'claude-fixture' }, { isCurrent: async () => false, runClaude: async () => { called = true; } });
  assert.equal(result.aborted, true);
  assert.equal(called, false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-operation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = { MSB_RUNTIME_ROOT: root, MSB_BOT_ID: 'first' };
  const other = { MSB_RUNTIME_ROOT: root, MSB_BOT_ID: 'other' };
  const release = trySessionOperation(first);
  assert.equal(typeof release, 'function');
  assert.equal(trySessionOperation(first), null);
  const releaseOther = trySessionOperation(other);
  assert.equal(typeof releaseOther, 'function');
  release(); releaseOther();
  const again = trySessionOperation(first);
  assert.equal(typeof again, 'function');
  again();
});
