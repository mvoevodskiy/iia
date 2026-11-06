import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addSourceFromInput } from '../src/monitor/config.mjs';
import { maybeSendDigest } from '../src/monitor/digest.mjs';
import { pollAllSources } from '../src/monitor/poll.mjs';
import { appendItems, loadMeta } from '../src/monitor/store.mjs';
import { saveState } from '../src/state.mjs';

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'monitor-race-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { MSB_RUNTIME_ROOT: root };
  const OriginalDate = globalThis.Date;
  const now = OriginalDate.parse('2026-11-06T06:00:00Z');
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  t.after(() => { globalThis.Date = OriginalDate; });
  await saveState({ timezone: 'Europe/Moscow' }, env);
  await appendItems([{ id: 'fixture', title: 'fixture', publishedAt: new Date().toISOString() }], env);
  return env;
}

test('a poll started before delivery cannot erase its digest marker', async (t) => {
  const env = await fixture(t);
  const url = 'https://example.invalid/feed.xml';
  await addSourceFromInput(url, env);
  const entered = gate();
  const finishPoll = gate();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (target) => {
    assert.equal(target, url);
    entered.release();
    await finishPoll.promise;
    return { ok: true, text: async () => '<rss><channel></channel></rss>' };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const polling = pollAllSources(env, { log() {} });
  await entered.promise;
  let sent = 0;
  const send = () => maybeSendDigest({ api: { sendMessage: async () => { sent++; } }, adminId: 42, env, log() {} });
  assert.equal((await send()).sent, true);
  finishPoll.release();
  await polling;
  const meta = await loadMeta(env);
  assert.equal(meta.lastDigestAt, '2026-11-06T06:00:00.000Z');
  assert.equal(meta.lastPollAt[`rss:${url}`], '2026-11-06T06:00:00.000Z');
  assert.equal((await send()).reason, 'already');
  assert.equal(sent, 1);
});

test('concurrent scheduled deliveries send only once', async (t) => {
  const env = await fixture(t);
  const entered = gate();
  const finish = gate();
  let sent = 0;
  const api = { sendMessage: async () => { sent++; entered.release(); await finish.promise; } };
  const first = maybeSendDigest({ api, adminId: 42, env, log() {} });
  await entered.promise;
  const second = maybeSendDigest({ api, adminId: 42, env, log() {} });
  finish.release();
  assert.equal((await first).sent, true);
  assert.equal((await second).reason, 'already');
  assert.equal(sent, 1);
});

test('a failed delivery does not mark the digest sent and releases the queue', async (t) => {
  const env = await fixture(t);
  await assert.rejects(maybeSendDigest({ api: { sendMessage: async () => { throw Error('delivery failed'); } }, adminId: 42, env, log() {} }), /delivery failed/);
  assert.equal((await loadMeta(env)).lastDigestAt, null);
  assert.equal((await maybeSendDigest({ api: { sendMessage: async () => {} }, adminId: 42, env, log() {} })).sent, true);
});
