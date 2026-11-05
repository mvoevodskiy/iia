import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { wireQwenAuth, wireCodexAuth, codexLoginStatus } from '../auth-wire.mjs';

test('wireQwenAuth writes settings.json and .env for sk-sp token plan', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-qwen-'));
  const key = 'sk-sp-testkey1234567890';
  const r = await wireQwenAuth(key, home);
  assert.match(r.baseUrl, /token-plan/);
  const settings = JSON.parse(await fs.readFile(path.join(home, '.qwen', 'settings.json'), 'utf8'));
  assert.equal(settings.security.auth.selectedType, 'openai');
  assert.equal(settings.model.name, 'qwen3-coder-plus');
  const envText = await fs.readFile(path.join(home, '.qwen', '.env'), 'utf8');
  assert.match(envText, /DASHSCOPE_API_KEY=sk-sp-testkey1234567890/);
});

test('wireQwenAuth uses dashscope for plain sk-', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-qwen-'));
  const r = await wireQwenAuth('sk-plainkey1234567890', home);
  assert.match(r.baseUrl, /dashscope/);
});

test('wireCodexAuth fails closed when CLI missing (не объявляет успех)', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-codex-wire-'));
  const r = await wireCodexAuth(
    { apiKey: 'sk-test-key-1234567890' },
    { PATH: '/nonexistent/bin' },
    home,
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /не установлен|failed|codex/i);
});

test('codexLoginStatus ok when auth.json present', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'msb-codex-st-'));
  await fs.mkdir(path.join(home, '.codex'), { recursive: true });
  await fs.writeFile(
    path.join(home, '.codex', 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 't', refresh_token: 'r' } }),
    { mode: 0o600 },
  );
  const st = await codexLoginStatus({ PATH: '/nonexistent' }, home);
  assert.equal(st.ok, true);
  assert.equal(st.mode, 'native-auth.json');
});
