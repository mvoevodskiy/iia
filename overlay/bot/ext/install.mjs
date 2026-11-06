/**
 * Совместимый вход интеграции overlay с grammy; prepare() вызывается до импорта ядра.
 * Навигация: [Обвязка](./README.md).
 */
export { prepare } from './integration/startup.mjs';
export { installUpdateHook } from './integration/update-hook.mjs';
