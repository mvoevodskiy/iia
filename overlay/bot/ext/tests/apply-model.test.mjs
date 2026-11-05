import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyProviderModel } from '../apply-model.mjs';
import { getSelectedModel } from '../store.mjs';

test('applyProviderModel writes codex config.toml and store', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'iia-ext-model-'));
  const env = { IIA_BOT_ID: 'default' };
  await fs.mkdir(path.join(home, '.codex'), { recursive: true });
  await fs.writeFile(path.join(home, '.codex', 'config.toml'), 'approval_policy = "never"\n');

  const r = await applyProviderModel('codex', 'gpt-6.1-sol', env, home);
  assert.equal(r.ok, true);
  assert.equal(await getSelectedModel('codex', env, home), 'gpt-6.1-sol');
  const toml = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
  assert.match(toml, /model = "gpt-6.1-sol"/);
  assert.match(toml, /approval_policy = "never"/);
});
