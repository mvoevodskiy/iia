#!/usr/bin/env node
import './shared/preload.mjs';
/**
 * Вход open-core после shared profile preload → src/main.mjs.
 * Навигация: [Ядро](./OPEN-CORE.md), [main](./src/main.mjs).
 * Исторический closed flag сохранён; vendor не входит в runtime поддерживаемого release.
 * Откат выпуска восстанавливает предыдущий код из release backup.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.MSB_USE_CLOSED_CORE === '1') {
  console.error('[msb] MSB_USE_CLOSED_CORE=1 → vendor/index.closed.js');
  await import(pathToFileURL(path.join(__dirname, 'vendor', 'index.closed.js')).href);
} else {
  const { main } = await import(pathToFileURL(path.join(__dirname, 'src', 'main.mjs')).href);
  await main();
}
