import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autonomyHomeScreen,
  extrasScreen,
  hubScreen,
  monitorScreen,
  settingsScreen,
} from '../src/telegram/screens.mjs';
import { BOT_COMMANDS } from '../src/telegram/commands.mjs';

test('hub copy', () => {
  const h = hubScreen();
  assert.match(h.text, /Готов\. Пиши задачу/);
});

test('settings buttons', () => {
  const s = settingsScreen({ dailySpendLimit: 10 });
  const data = s.keyboard.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(data.includes('settings:auth'));
  assert.ok(data.includes('settings:bots'));
  assert.ok(data.includes('settings:extras'));
  assert.ok(data.includes('settings:limit'));
});

test('extras + monitor + autonomy callbacks', async () => {
  const e = extrasScreen();
  assert.ok(e.keyboard.inline_keyboard.flat().some((b) => b.callback_data === 'settings:ssh'));
  const m = monitorScreen();
  assert.ok(m.keyboard.inline_keyboard.flat().some((b) => b.callback_data === 'mon:sources'));
  const a = await autonomyHomeScreen();
  assert.ok(a.keyboard.inline_keyboard.flat().some((b) => b.callback_data === 'auto:tasks'));
});

test('slash commands include core set', () => {
  const names = BOT_COMMANDS.map((c) => c.command);
  for (const c of ['start', 'help', 'settings', 'monitor', 'newtask', 'stop', 'claude']) {
    assert.ok(names.includes(c), c);
  }
});
