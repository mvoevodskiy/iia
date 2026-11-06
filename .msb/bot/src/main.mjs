/**
 * MSB open-core — точка входа открытого ядра.
 * Совместима с systemd ExecStart=node …/bot/index.js и overlay run.mjs.
 */
import { assertRuntimeConfig, readConfig } from './config.mjs';
import { startHeartbeat } from './heartbeat.mjs';
import { startScheduler } from './autonomy/scheduler.mjs';
import { startMonitorScheduler } from './monitor/scheduler.mjs';
import { createBot, runPolling } from './telegram/bot.mjs';
import { ensureDir, botRoot, sessionDir, autonomyDir } from './paths.mjs';
import { monitorDir } from './monitor/config.mjs';

export async function main() {
  const cfg = readConfig();
  console.error(`[msb/open] boot version=${cfg.version} botId=${cfg.botId}`);
  assertRuntimeConfig(cfg);

  ensureDir(botRoot());
  ensureDir(sessionDir());
  ensureDir(autonomyDir());
  ensureDir(monitorDir());

  const heartbeat = startHeartbeat();
  const bot = createBot(cfg);
  const scheduler = startScheduler({
    api: bot.api,
    adminId: cfg.adminId,
  });
  const monitor = startMonitorScheduler({
    api: bot.api,
    adminId: cfg.adminId,
  });

  let shuttingDown = false;
  const shutdown = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    scheduler.stop();
    monitor.stop();
    console.error(`[msb/open] ${sig} — shutting down`);
    try {
      await bot.stop();
    } catch {
      /* ignore */
    }
    heartbeat.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await runPolling(bot);
}
