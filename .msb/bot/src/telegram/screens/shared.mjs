/**
 * Общее оформление и экран для неподключённых разделов.
 * Навигация: [Telegram](../README.md).
 */
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../edit.mjs';
export const BLANK = '⠀';

export function placeholder(title, back, message = 'Этот раздел пока не реализован в Telegram. Настройки не изменены.') {
  return {
    text: `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}\n${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', back),
  };
}
