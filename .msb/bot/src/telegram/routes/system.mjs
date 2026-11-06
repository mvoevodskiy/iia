/**
 * Системные настройки и перезапуск.
 * Навигация: [Telegram](../README.md).
 */
import { spawn } from 'node:child_process';
import { extrasScreen, restartConfirmScreen, sshUnavailableScreen, updatesScreen } from '../screens.mjs';
import { UNHANDLED } from './shared.mjs';

export async function handleSystemRoute({ data, show, chatId, bot }) {
  // —— settings tree ——
  if (data === 'settings:extras') return show(extrasScreen());
  if (data === 'settings:restart') return show(restartConfirmScreen());
  if (data === 'settings:restart:do') {
    await bot.api.sendMessage(chatId, 'Запускаю перезапуск бота…');
    setTimeout(() => restartSelf(() => bot.api.sendMessage(chatId, 'Не удалось запустить перезапуск. Служба осталась в прежнем состоянии.').catch(() => {})), 400);
    return;
  }
  if (data === 'settings:ssh') return show(sshUnavailableScreen());
  if (data === 'settings:updates') return show(await updatesScreen());
  return UNHANDLED;
}

function restartSelf(onError) {
  try {
    const child = spawn('sudo', ['-n', 'bot-ctl.sh', 'restart', process.env.MSB_BOT_ID || 'default'], {
      detached: true, stdio: 'ignore',
    });
    child.once('error', onError);
    child.once('exit', (code) => { if (code) onError(); });
    child.unref();
  } catch { onError(); }
}
