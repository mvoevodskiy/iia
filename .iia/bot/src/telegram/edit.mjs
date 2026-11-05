import { GrammyError } from 'grammy';

export async function editOrReply(api, chatId, messageId, text, keyboard, parseMode = 'HTML') {
  const opts = { parse_mode: parseMode, reply_markup: keyboard };
  if (messageId) {
    try {
      await api.editMessageText(chatId, messageId, text, opts);
      return;
    } catch (err) {
      if (err instanceof GrammyError && /not modified/i.test(err.description || '')) return;
    }
  }
  await api.sendMessage(chatId, text, opts);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
