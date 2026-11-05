import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export function updatesStatePath(home = os.homedir()) {
  return path.join(home, '.msb', 'updates', 'state.json');
}

export async function readUpdatesState(home = os.homedir()) {
  try {
    return JSON.parse(await fsp.readFile(updatesStatePath(home), 'utf8'));
  } catch {
    return { applied_core_version: null, applied_ext_version: null };
  }
}

export async function writeUpdatesState(patch, home = os.homedir()) {
  const file = updatesStatePath(home);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const cur = await readUpdatesState(home);
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fsp.rename(tmp, file);
  return next;
}

export async function detectCoreVersion(home = os.homedir()) {
  const state = await readUpdatesState(home);
  if (state.applied_core_version) return state.applied_core_version;
  const puller = path.join(home, '.msb', '.puller-state.json');
  try {
    const j = JSON.parse(await fsp.readFile(puller, 'utf8'));
    if (j.applied_platform_version) return j.applied_platform_version;
  } catch { /* ignore */ }
  const indexJs = path.join(home, '.msb', 'bot', 'index.js');
  try {
    const buf = await fsp.readFile(indexJs);
    return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
  } catch {
    return null;
  }
}
