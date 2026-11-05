/**
 * Применение выбранной модели к store + native-конфигам провайдера.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setSelectedModel, setSelectedEffort } from './store.mjs';
import { codexConfigPath } from './codex-native.mjs';
import { wireQwenAuth } from './auth-wire.mjs';
import { readEnvKey } from './env.mjs';

export async function upsertTomlScalar(file, key, value) {
  let text = '';
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  const line = `${key} = ${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}\\s*=\\s*.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else {
    const body = text.trimEnd();
    text = body ? `${body}\n\n${line}\n` : `${line}\n`;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, text, { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function upsertQwenModel(modelId, env, home) {
  const key =
    (await readEnvKey('QWEN_API_KEY', env, home)) ||
    (await readEnvKey('DASHSCOPE_API_KEY', env, home));
  if (key) {
    await wireQwenAuth(key, home);
  }
  const settingsPath = path.join(home, '.qwen', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  if (!settings.model || typeof settings.model !== 'object') settings.model = {};
  settings.model.name = modelId;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

/**
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function applyProviderModel(providerId, modelId, env = process.env, home = os.homedir()) {
  const id = String(modelId || '').trim();
  if (!id) return { ok: false, error: 'пустой id модели' };

  await setSelectedModel(providerId, id, env, home);

  try {
    if (providerId === 'codex') {
      await upsertTomlScalar(codexConfigPath(home), 'model', id);
    } else if (providerId === 'qwen') {
      await upsertQwenModel(id, env, home);
    }
    // Cursor: достаточно store + --model в адаптере
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) };
  }
  return { ok: true };
}

const CODEX_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

/**
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function applyProviderEffort(providerId, effort, env = process.env, home = os.homedir()) {
  const id = String(effort || '').trim();
  if (providerId !== 'codex') {
    return { ok: false, error: 'глубина настраивается только у Codex' };
  }
  if (!CODEX_EFFORTS.has(id)) return { ok: false, error: `неизвестный уровень: ${id}` };
  await setSelectedEffort(providerId, id, env, home);
  try {
    await upsertTomlScalar(codexConfigPath(home), 'model_reasoning_effort', id);
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) };
  }
  return { ok: true };
}
