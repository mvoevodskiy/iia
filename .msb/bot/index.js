#!/usr/bin/env node
/**
 * Точка входа MSB.
 *
 * По умолчанию — открытое ядро (src/main.mjs).
 * Откат к закрытому бандлу: MSB_USE_CLOSED_CORE=1
 *   (файл vendor/index.closed.js).
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
