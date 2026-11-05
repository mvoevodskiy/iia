/**
 * Ворота владельца: только ADMIN_ID (как в закрытом ядре).
 */
export function isAdmin(ctx, adminId) {
  const uid = ctx.from?.id;
  if (!adminId) return false;
  return Number(uid) === Number(adminId);
}

export function adminGuard(adminId) {
  return async (ctx, next) => {
    if (!adminId) {
      await ctx.reply('ADMIN_ID не задан в окружении бота. Добавь его в .env и перезапусти.');
      return;
    }
    if (!isAdmin(ctx, adminId)) {
      await ctx.reply('Этот бот личный.');
      return;
    }
    return next();
  };
}
