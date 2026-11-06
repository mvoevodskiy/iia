/**
 * Общие операции интеграции: состояние маршрута и edit/send.
 * Навигация: [Обвязка](../README.md).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import { botStatePath } from '../paths.mjs';

export const EXT_MARKER = '[msb/ext]';

export function ccOnly() {
  return process.env.JARVIS_CC_ONLY === '1';
}

export async function readEngine(home = os.homedir()) {
  try {
    const raw = await fs.readFile(botStatePath(process.env, home), 'utf8');
    const st = JSON.parse(raw);
    return st?.engine === 'oc' ? 'oc' : 'cc';
  } catch {
    return 'cc';
  }
}

export async function editOrReply(bot, chatId, messageId, text, keyboard) {
  const opts = { parse_mode: 'HTML', reply_markup: keyboard };
  if (messageId) {
    try {
      await bot.api.editMessageText(chatId, messageId, text, opts);
      return;
    } catch {
      /* fall through */
    }
  }
  await bot.api.sendMessage(chatId, text, opts);
}
