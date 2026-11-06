import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { invalidateFirstSession } from '../shared/session-starts.mjs';
import { runAgentTurn } from '../src/agent/turn.mjs';
import { saveState, loadState, updateState } from '../src/state.mjs';
const id = '0199a213-81c0-7800-8aa1-bbab2a035a53';
const sessionId = `ext:codex:${id}`;

test('real core spawn persists measured context, preserves failures and honors reset during first turn', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-turn-'));
  const prior = { ...process.env };
  t.after(async () => {
    for (const key of ['PATH', 'MSB_WORKSPACE_DIR', 'FIXTURE_CORE_MODE', 'FIXTURE_CORE_HOME']) {
      if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    }
    await fs.rm(home, { recursive: true, force: true });
  });
  const env = { HOME: home };
  await fs.mkdir(path.join(home, 'bin'));
  const sessions = path.join(home, '.codex/sessions/2026/11/05');
  await fs.mkdir(sessions, { recursive: true });
  await fs.writeFile(path.join(sessions, `rollout-test-${id}.jsonl`), JSON.stringify({ type: 'event_msg', payload: {
    type: 'token_count', info: { last_token_usage: { total_tokens: 71142 }, total_token_usage: { total_tokens: 1800000 }, model_context_window: 475000 },
  } }) + '\n');
  await fs.writeFile(path.join(home, 'bin/claude'), `#!${process.execPath}
const fs = require('node:fs');
const emit=(x)=>console.log(JSON.stringify(x));
process.stdin.resume();
process.stdin.on('end', async () => {
 const fail=process.env.FIXTURE_CORE_MODE==='fail';
 const sid=fail?'ext:codex:norestart':'${sessionId}';
 emit({type:'system',subtype:'init',provider_id:'codex',apiKeySource:'ext',session_id:sid,model:'gpt-6.1-terra'});
 if(process.env.FIXTURE_CORE_MODE==='reset') {
  for(let i=0;i<100&&!fs.existsSync(process.env.FIXTURE_CORE_HOME+'/release');i++) await new Promise(r=>setTimeout(r,10));
 }
 emit({type:'result',subtype:fail?'error':'success',session_id:sid,is_error:fail,result:'fixture',usage:{input_tokens:1000,cache_read_input_tokens:1799000,output_tokens:5}});
});
`, { mode: 0o755 });
  process.env.PATH = path.join(home, 'bin') + ':' + prior.PATH;
  process.env.MSB_WORKSPACE_DIR = home;
  process.env.FIXTURE_CORE_HOME = home;
  await saveState({ extAuthBypass: 'codex' }, env);
  process.env.FIXTURE_CORE_MODE = 'reset';
  let reset;
  const resetResult = await runAgentTurn({ prompt: 'fixture', env, onStatus(ev) {
    if (ev.kind === 'init') reset = updateState((s) => { invalidateFirstSession(s); delete s.ccSessionId; s.sessionEpoch = 1; return s; }, env)
      .then(() => fs.writeFile(path.join(home, 'release'), 'ready'));
  } });
  await reset;
  assert.equal(resetResult.result.context, null);
  assert.equal((await loadState(env)).state.ccSessionId, undefined);
  process.env.FIXTURE_CORE_MODE = 'success';
  const result = await runAgentTurn({ prompt: 'fixture', env });
  assert.equal(result.ok, true);
  assert.equal(result.result.usage.inputTokens + result.result.usage.cacheReadTokens, 1800000);
  assert.equal(result.result.context.contextTokens, 71142);
  const state = (await loadState(env)).state;
  assert.equal(state.ccSessionId, sessionId);
  assert.equal(state.lastCcUsage.contextTokens, 71142);
  assert.equal(state.lastCcUsage.contextWindow, 475000);
  process.env.FIXTURE_CORE_MODE = 'fail';
  assert.equal((await runAgentTurn({ prompt: 'fixture', env })).ok, false);
  assert.deepEqual((await loadState(env)).state, state);
});
