/**
 * IIA open-core — точка входа открытого ядра.
 * Совместима с systemd ExecStart=node …/bot/index.js и overlay run.mjs.
 */
import { assertRuntimeConfig, readConfig } from './config.mjs';
import { startHeartbeat } from './heartbeat.mjs';
import { startScheduler } from './autonomy/scheduler.mjs';
import { createBot, runPolling } from './telegram/bot.mjs';
import { ensureDir, botRoot, sessionDir, autonomyDir } from './paths.mjs';

export async function main() {
  const cfg = readConfig();
  console.error(`[iia/open] boot version=${cfg.version} botId=${cfg.botId}`);
  assertRuntimeConfig(cfg);

  ensureDir(botRoot());
  ensureDir(sessionDir());
  ensureDir(autonomyDir());

  const heartbeat = startHeartbeat();
  const bot = createBot(cfg);
  const scheduler = startScheduler({
    api: bot.api,
    adminId: cfg.adminId,
  });

  const shutdown = (sig) => {
    console.error(`[iia/open] ${sig} — shutting down`);
    try {
      bot.stop();
    } catch {
      /* ignore */
    }
    scheduler.stop();
    heartbeat.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await runPolling(bot);
}
