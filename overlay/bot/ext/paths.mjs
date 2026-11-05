import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function botId(env = process.env) {
  const id = (env.IIA_BOT_ID || 'default').trim();
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id) ? id : 'default';
}

export function iiaRoot(home = os.homedir()) {
  return path.join(home, '.iia');
}

export function botDir(env = process.env, home = os.homedir()) {
  return path.join(iiaRoot(home), 'bots', botId(env));
}

export function botStatePath(env = process.env, home = os.homedir()) {
  return path.join(botDir(env, home), 'state.json');
}

/** Локальный префикс npm для Codex/Qwen — без sudo. */
export function extToolsPrefix(home = os.homedir()) {
  return path.join(iiaRoot(home), 'ext-tools');
}

export function extToolsBin(home = os.homedir()) {
  return path.join(extToolsPrefix(home), 'bin');
}

export function botPackageRoot() {
  return path.resolve(__dirname, '..');
}
