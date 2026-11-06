/**
 * Переменные окружения, timezone, лимиты и сведения.
 * Навигация: [Telegram](../README.md).
 */
import { loadState, updateState } from '../../state.mjs';
import { envScreen, limitScreen, notificationsScreen, serverStatusScreen, sttScreen, tzScreen } from '../screens.mjs';
import { deleteEnvKey } from '../../env/store.mjs';
import { UNHANDLED } from './shared.mjs';

export async function handleSettingsRoute({ data, state, show, pending, chatId, bot, cfg }) {
  if (data === 'settings:env') return show(await envScreen());
  if (data === 'settings:env:add') {
    pending.set(chatId, 'env-key-name');
    return show({
      text: 'Пришли имя ключа (например <code>MY_API_KEY</code>).',
      keyboard: (await envScreen()).keyboard,
    });
  }
  if (data.startsWith('settings:env:quick:')) {
    const key = data.slice('settings:env:quick:'.length);
    pending.set(chatId, `env:${key}`);
    return show({
      text: `Пришли значение для <code>${key}</code>.`,
      keyboard: (await envScreen()).keyboard,
    });
  }
  if (data.startsWith('settings:env:delete:')) {
    const key = data.slice('settings:env:delete:'.length);
    try {
      await deleteEnvKey(key);
      await bot.api.sendMessage(chatId, `Удалил <code>${key}</code>.`, { parse_mode: 'HTML' });
    } catch (err) {
      await bot.api.sendMessage(chatId, err.message);
    }
    return show(await envScreen());
  }
  if (data.startsWith('settings:env:confirm-delete:')) {
    return show(await envScreen());
  }
  if (data === 'settings:tz') {
    pending.set(chatId, 'timezone');
    return show(tzScreen(state));
  }
  if (data === 'settings:limit') return show(limitScreen(state));
  if (data.startsWith('settings:limit:set:')) {
    const n = Number(data.split(':').pop());
    await updateState((s) => {
      s.dailySpendLimit = Number.isFinite(n) ? n : 0;
      if (n === 0) s.costPaused = false;
      return s;
    });
    return show(limitScreen((await loadState()).state));
  }
  if (data === 'settings:server-status') return show(serverStatusScreen(cfg));
  if (data === 'settings:stt') return show(sttScreen());
  if (data === 'nm:list') return show(notificationsScreen());
  return UNHANDLED;
}
