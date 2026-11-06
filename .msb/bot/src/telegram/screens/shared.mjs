/**
 * Общее оформление и экран для неподключённых разделов.
 * Навигация: [Telegram](../README.md).
 */
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../edit.mjs';
export const BLANK = '⠀';

/** Describe the saved value without inventing a default. */
export function describeSpendLimit(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 'не задан';
  return n > 0 ? `$${n}/день` : 'без ограничений';
}

export function placeholder(title, back, message = 'Этот раздел пока не реализован в Telegram. Настройки не изменены.') {
  return {
    text: `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}\n${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', back),
  };
}
