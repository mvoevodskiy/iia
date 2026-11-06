#!/usr/bin/env node
/**
 * Точка входа MSB — открытое ядро (src/main.mjs).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { main } = await import(pathToFileURL(path.join(__dirname, 'src', 'main.mjs')).href);
await main();
