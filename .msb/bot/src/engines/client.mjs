/**
 * Клиент IPC к msb-engine: заявка в ~/.msb/engine/request, результат в /run/msb-engine/state.json
 * (compat: /run/jarvis-engine/state.json).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { msbRoot } from '../paths.mjs';

const RUN_CANDIDATES = [
  '/run/msb-engine/state.json',
  '/run/jarvis-engine/state.json',
];

export function engineDir(env = process.env) {
  return path.join(msbRoot(env), 'engine');
}

export function requestPath(env = process.env) {
  return path.join(engineDir(env), 'request');
}

export async function readEngineState() {
  for (const p of RUN_CANDIDATES) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      const st = JSON.parse(raw);
      if (st && typeof st === 'object') return { path: p, state: st };
    } catch {
      /* next */
    }
  }
  return { path: null, state: null };
}

export function newRequestId() {
  return randomBytes(12).toString('hex');
}

/**
 * Атомарно записать заявку. Path-unit подхватит файл.
 * @returns {{ id: string, path: string }}
 */
export async function submitRequest(action, params = {}, env = process.env) {
  const dir = engineDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const id = newRequestId();
  const body = {
    v: 1,
    id,
    action,
    ...params,
  };
  const dest = requestPath(env);
  const tmp = path.join(dir, `.request.${id}.tmp`);
  await fs.writeFile(tmp, `${JSON.stringify(body)}\n`, { mode: 0o600 });
  await fs.rename(tmp, dest);
  return { id, path: dest };
}

/**
 * Дождаться результата заявки в state.requests[id] / state.last.
 */
export async function waitRequestResult(id, { timeoutMs = 60_000, pollMs = 400 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { state } = await readEngineState();
    if (state) {
      const byId = state.requests?.[id];
      if (byId && byId.result && byId.result !== 'running') return byId;
      if (state.last?.id === id && state.last.result && state.last.result !== 'running') {
        return state.last;
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

export async function engineStatusSnapshot() {
  const { state, path: p } = await readEngineState();
  if (!state) {
    return {
      helper: null,
      path: p,
      jarvis: null,
      openclaw: null,
      actions: [],
      last: null,
      error: 'NO_STATE',
    };
  }
  return {
    helper: state.helper || state.helper_version || null,
    path: p,
    jarvis: state.jarvis || null,
    openclaw: state.openclaw || null,
    actions: state.actions?.client || [],
    last: state.last || null,
    host_ready: state.host_ready,
    at: state.at,
  };
}
