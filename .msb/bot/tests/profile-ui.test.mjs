import test from 'node:test';
import assert from 'node:assert/strict';
import { autonomyHistoryScreen, updatesScreen } from '../src/telegram/screens.mjs';
import { buildLocalSshMenu, localSshPrompt } from '../../../overlay/bot/ext/menu.mjs';

test('runtime profile preserves existing JAR1 variable names, paths and LAN examples in UI', async t => {
  const previous = { ...process.env };
  t.after(() => { for (const k of Object.keys(process.env)) if (!(k in previous)) delete process.env[k]; Object.assign(process.env, previous); });
  for (const [id, root, prefix, example] of [['jar1', '.iia', 'IIA_', '192.168.33.203'], ['msb', '.msb', 'MSB_', '192.168.1.10']]) {
    process.env.MSB_RUNTIME_PROFILE = id;
    process.env.MSB_OWN_UPDATES_URL = '';
    assert.ok((await autonomyHistoryScreen()).text.includes(`~/${root}/autonomy/runs.jsonl`));
    assert.ok((await updatesScreen()).text.includes(`${prefix}OWN_UPDATES_URL`));
    const env = { MSB_RUNTIME_PROFILE: id };
    const menu = await buildLocalSshMenu(env);
    assert.ok(menu.text.includes(`${prefix}LOCAL_SSH_HOST`));
    assert.ok(menu.text.includes(example));
    assert.ok(localSshPrompt(env).text.includes(example));
  }
});
