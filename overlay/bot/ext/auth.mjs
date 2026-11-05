/** Ожидание следующего сообщения с ключом провайдера. */

const pending = new Map(); // userId -> { providerId, at, chatId }

const TTL_MS = 10 * 60 * 1000;

export function setPendingAuth(userId, providerId, chatId) {
  pending.set(Number(userId), { providerId, chatId: Number(chatId), at: Date.now() });
}

export function clearPendingAuth(userId) {
  pending.delete(Number(userId));
}

export function getPendingAuth(userId) {
  const row = pending.get(Number(userId));
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    pending.delete(Number(userId));
    return null;
  }
  return row;
}
