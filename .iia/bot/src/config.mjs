import { botId, homeDir, iiaRoot, workspaceDir } from './paths.mjs';

export function readConfig(env = process.env) {
  const adminId = Number(env.ADMIN_ID || env.OWNER_USER_ID || '0');
  return {
    botToken: (env.BOT_TOKEN || '').trim(),
    adminId: Number.isFinite(adminId) && adminId > 0 ? adminId : 0,
    botId: botId(env),
    home: homeDir(env),
    iiaRoot: iiaRoot(env),
    workspace: workspaceDir(env),
    timezone: env.IIA_TIMEZONE || 'Europe/Moscow',
    version: env.BOT_VERSION || 'open-0.1.0',
    openCore: true,
  };
}

export function assertRuntimeConfig(cfg) {
  if (!cfg.botToken) {
    throw new Error('BOT_TOKEN не задан — бот не сможет опрашивать Telegram');
  }
  if (!cfg.adminId) {
    console.error('[iia/open] WARNING: ADMIN_ID не задан — доступ открыт только после настройки');
  }
}
