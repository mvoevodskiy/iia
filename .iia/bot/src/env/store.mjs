/**
 * CRUD переменных окружения бота (~/.iia/bots/<id>/.env).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { botRoot, ensureDir } from '../paths.mjs';

/** Нельзя удалить базовые ключи юнита. */
export const PROTECTED_KEYS = new Set([
  'BOT_TOKEN',
  'IIA_BOT_ID',
  'IIA_SESSION_DIR',
  'IIA_TRANSCRIPT_DIR',
  'IIA_HOOKS_DIR',
  'IIA_TRACES_DIR',
  'ADMIN_ID',
  'OWNER_USER_ID',
]);

export const QUICK_KEYS = [
  { key: 'DEEPGRAM_API_KEY', label: 'Deepgram' },
  { key: 'GITHUB_TOKEN_FINE', label: 'GitHub Fine-grained' },
  { key: 'GITHUB_TOKEN_CLASSIC', label: 'GitHub Classic' },
  { key: 'GITHUB_TOKEN', label: 'GitHub token' },
  { key: 'X_BEARER_TOKEN', label: 'X / Twitter Bearer' },
  { key: 'OPENROUTER_API_KEY', label: 'OpenRouter' },
  { key: 'PROXYAPI_KEY', label: 'ProxyAPI' },
  { key: 'CLAUDE_CODE_OAUTH_TOKEN', label: 'Claude setup-token' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key' },
];

export function envFilePath(env = process.env) {
  return path.join(botRoot(env), '.env');
}

export async function readEnvMap(env = process.env) {
  const file = envFilePath(env);
  let raw = '';
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { file, map: new Map(), lines: [] };
    throw err;
  }
  const map = new Map();
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    map.set(line.slice(0, i), line.slice(i + 1));
  }
  return { file, map, lines };
}

export function maskValue(v) {
  const s = String(v || '');
  if (s.length <= 6) return '•••';
  return `${s.slice(0, 3)}…${s.slice(-3)} (${s.length} симв.)`;
}

export async function listEnvEntries(env = process.env) {
  const { map } = await readEnvMap(env);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      key,
      masked: maskValue(value),
      protected: PROTECTED_KEYS.has(key),
      set: Boolean(value),
    }));
}

export async function setEnvKey(key, value, env = process.env) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new Error('Ключ: только A-Z, цифры и _');
  }
  const { file, lines } = await readEnvMap(env);
  ensureDir(path.dirname(file));
  const kept = [];
  let replaced = false;
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      kept.push(`${key}=${value}`);
      replaced = true;
    } else {
      kept.push(line);
    }
  }
  if (!replaced) {
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    kept.push(`${key}=${value}`);
  }
  const body = `${kept.join('\n').replace(/\n*$/, '')}\n`;
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, body, { mode: 0o600 });
  await fs.rename(tmp, file);
  process.env[key] = value;
  return { file, key };
}

export async function deleteEnvKey(key, env = process.env) {
  if (PROTECTED_KEYS.has(key)) {
    throw new Error(`Ключ ${key} защищён — не удаляется из бота`);
  }
  const { file, lines } = await readEnvMap(env);
  const kept = lines.filter((l) => !l.startsWith(`${key}=`));
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${kept.join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
  delete process.env[key];
  return { file, key };
}
