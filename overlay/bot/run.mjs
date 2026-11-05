#!/usr/bin/env node
/**
 * Точка входа бота с расширением провайдеров (Cursor / Codex / Qwen).
 * Бандл index.js не меняем: PATH-shim + патч Bot.prototype до загрузки.
 *
 * systemd: ExecStart=/usr/bin/node /home/client/.iia/bot/run.mjs
 * (drop-in: bot/systemd/60-ext-entry.conf)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepare } from './ext/install.mjs';
import { enrichPath } from './ext/ensure-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shimBin = path.join(__dirname, 'ext', 'shim', 'bin');
const MARK = '[iia/ext]';

function findRealClaude() {
  if (process.env.IIA_REAL_CLAUDE && fs.existsSync(process.env.IIA_REAL_CLAUDE)) {
    return process.env.IIA_REAL_CLAUDE;
  }
  const hardcoded = [
    '/usr/bin/claude',
    '/usr/local/bin/claude',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
  ];
  for (const c of hardcoded) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* continue */
    }
  }
  const r = spawnSync('bash', ['-lc', 'type -P claude || true'], { encoding: 'utf8' });
  const found = (r.stdout || '').trim().split('\n').filter(Boolean)[0];
  if (found && !found.includes('/ext/shim/bin/')) return found;
  return null;
}

const real = findRealClaude();
if (real) {
  process.env.IIA_REAL_CLAUDE = real;
  console.error(`${MARK} real claude → ${real}`);
} else {
  console.error(`${MARK} WARNING: real claude not found — Claude provider will fail until installed`);
}

process.env.PATH = `${shimBin}${path.delimiter}${enrichPath(process.env, os.homedir())}`;
console.error(`${MARK} PATH shim → ${shimBin}`);

await prepare();

const indexUrl = pathToFileURL(path.join(__dirname, 'index.js')).href;
await import(indexUrl);
