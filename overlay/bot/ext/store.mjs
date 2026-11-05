import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROVIDER, isProviderId } from './providers.mjs';

const STORE_NAME = 'ext-providers.json';

function botId(env = process.env) {
  const id = (env.MSB_BOT_ID || 'default').trim();
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id) ? id : 'default';
}

export function storePath(env = process.env, home = os.homedir()) {
  return path.join(home, '.msb', 'bots', botId(env), STORE_NAME);
}

function emptyStore() {
  return {
    version: 1,
    active: DEFAULT_PROVIDER,
    sessions: {},
    models: {},
    efforts: {},
    updatedAt: null,
  };
}

export async function loadStore(env = process.env, home = os.homedir()) {
  const file = storePath(env, home);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyStore();
    const active = isProviderId(data.active) ? data.active : DEFAULT_PROVIDER;
    return {
      version: 1,
      active,
      sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
      models: data.models && typeof data.models === 'object' ? data.models : {},
      efforts: data.efforts && typeof data.efforts === 'object' ? data.efforts : {},
      updatedAt: data.updatedAt ?? null,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyStore();
    throw err;
  }
}

export async function saveStore(store, env = process.env, home = os.homedir()) {
  const file = storePath(env, home);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const next = {
    version: 1,
    active: isProviderId(store.active) ? store.active : DEFAULT_PROVIDER,
    sessions: store.sessions && typeof store.sessions === 'object' ? store.sessions : {},
    models: store.models && typeof store.models === 'object' ? store.models : {},
    efforts: store.efforts && typeof store.efforts === 'object' ? store.efforts : {},
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
  return next;
}

export async function setActive(providerId, env = process.env, home = os.homedir()) {
  if (!isProviderId(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const store = await loadStore(env, home);
  store.active = providerId;
  return saveStore(store, env, home);
}

export async function setSession(providerId, sessionId, env = process.env, home = os.homedir()) {
  if (!isProviderId(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const store = await loadStore(env, home);
  if (!sessionId) delete store.sessions[providerId];
  else store.sessions[providerId] = String(sessionId);
  return saveStore(store, env, home);
}

export async function getSelectedModel(providerId, env = process.env, home = os.homedir()) {
  const store = await loadStore(env, home);
  const id = store.models?.[providerId];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function setSelectedModel(providerId, modelId, env = process.env, home = os.homedir()) {
  if (!isProviderId(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const store = await loadStore(env, home);
  if (!store.models || typeof store.models !== 'object') store.models = {};
  if (!modelId) delete store.models[providerId];
  else store.models[providerId] = String(modelId).trim();
  return saveStore(store, env, home);
}

export async function getSelectedEffort(providerId, env = process.env, home = os.homedir()) {
  const store = await loadStore(env, home);
  const id = store.efforts?.[providerId];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function setSelectedEffort(providerId, effort, env = process.env, home = os.homedir()) {
  if (!isProviderId(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const store = await loadStore(env, home);
  if (!store.efforts || typeof store.efforts !== 'object') store.efforts = {};
  if (!effort) delete store.efforts[providerId];
  else store.efforts[providerId] = String(effort).trim();
  return saveStore(store, env, home);
}

export function encodeExtSession(providerId, nativeId) {
  return `ext:${providerId}:${nativeId || cryptoRandom()}`;
}

export function decodeExtSession(sessionId) {
  if (typeof sessionId !== 'string') return null;
  const m = /^ext:([a-z]+):(.+)$/.exec(sessionId);
  if (!m) return null;
  if (!isProviderId(m[1])) return null;
  return { providerId: m[1], nativeId: m[2] };
}

function cryptoRandom() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
