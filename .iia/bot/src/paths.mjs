import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function homeDir(env = process.env) {
  return env.HOME || os.homedir();
}

export function botId(env = process.env) {
  const id = (env.IIA_BOT_ID || 'default').trim();
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id) ? id : 'default';
}

export function iiaRoot(env = process.env) {
  return path.join(homeDir(env), '.iia');
}

export function botRoot(env = process.env) {
  return path.join(iiaRoot(env), 'bots', botId(env));
}

export function statePath(env = process.env) {
  return path.join(botRoot(env), 'state.json');
}

export function sessionDir(env = process.env) {
  return env.IIA_SESSION_DIR || path.join(botRoot(env), 'sessions');
}

export function workspaceDir(env = process.env) {
  if (env.IIA_WORKSPACE_DIR) return env.IIA_WORKSPACE_DIR;
  // cwd is bind-mount of workspace in production
  return process.cwd();
}

export function autonomyDir(env = process.env) {
  return env.AUTONOMY_DIR || path.join(iiaRoot(env), 'autonomy');
}

export function heartbeatPath(env = process.env) {
  return path.join(botRoot(env), '.heartbeat-ok');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
