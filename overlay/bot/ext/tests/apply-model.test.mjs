import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyProviderModel } from '../apply-model.mjs';
import { getSelectedModel } from '../store.mjs';

test('applyProviderModel writes codex config.toml and store', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-ext-model-'));
  const env = { MSB_BOT_ID: 'default' };
  await fs.mkdir(path.join(home, '.codex'), { recursive: true });
  await fs.writeFile(path.join(home, '.codex', 'config.toml'), 'approval_policy = "never"\n');

  const r = await applyProviderModel('codex', 'gpt-6.1-sol', env, home);
  assert.equal(r.ok, true);
  assert.equal(await getSelectedModel('codex', env, home), 'gpt-6.1-sol');
  const toml = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
  assert.match(toml, /model = "gpt-6.1-sol"/);
  assert.match(toml, /approval_policy = "never"/);
});

test('MAX is selectable, persists at TOML root and reaches new/resumed CLI calls', async (t) => {
  const { applyProviderEffort } = await import('../apply-model.mjs');
  const { getSelectedEffort } = await import('../store.mjs');
  const { buildCodexExecArgs } = await import('../adapters/codex.mjs');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-ext-max-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { MSB_BOT_ID: 'default' };
  const file = path.join(home, '.codex/config.toml');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const table = '[profiles.test]\nmodel_reasoning_effort = "low"\n';
  await fs.writeFile(file, 'approval_policy = "never"\n' + table);
  assert.equal((await applyProviderEffort('codex', 'max', env, home)).ok, true);
  assert.equal(await getSelectedEffort('codex', env, home), 'max');
  const config = await fs.readFile(file, 'utf8');
  assert.match(config.split('[profiles.test]')[0], /model_reasoning_effort = "max"/);
  assert.ok(config.endsWith(table));
  for (const resumeId of [undefined, '0199a213-81c0-7800-8aa1-bbab2a035a53']) {
    const args = buildCodexExecArgs({ model: 'gpt-6.1-terra', effort: await getSelectedEffort('codex', env, home), resumeId });
    assert.ok(args.includes('model_reasoning_effort="max"'));
    assert.ok(args.includes('approval_policy="never"'));
  }
});
