/**
 * Действия автономки.
 * Навигация: [Telegram](../README.md).
 */
import { loadState, updateState } from '../../state.mjs';
import { autonomyHistoryScreen, autonomyRightsScreen, autonomyTasksScreen, autonomyTimersScreen, autonomyWhatScreen, placeholder } from '../screens.mjs';
import { UNHANDLED } from './shared.mjs';

export async function handleAutonomyRoute({ data, show, bot, chatId }) {
  // —— autonomy ——
  if (data === 'auto:what') return show(autonomyWhatScreen());
  if (data === 'auto:tasks') return show(await autonomyTasksScreen());
  if (data === 'auto:timers') return show(autonomyTimersScreen());
  if (data === 'auto:history') {
    const view = await autonomyHistoryScreen();
    if (view.pages.length === 1) return show(view);
    await show({ text: view.pages[0] });
    for (let i = 1; i < view.pages.length; i++) {
      await bot.api.sendMessage(chatId, view.pages[i], {
        parse_mode: 'HTML',
        ...(i === view.pages.length - 1 ? { reply_markup: view.keyboard } : {}),
      });
    }
    return;
  }
  if (data === 'auto:rights') return show(await autonomyRightsScreen());
  if (data === 'auto:rights-toggle') {
    await updateState((s) => {
      s.autonomyRights = !s.autonomyRights;
      return s;
    });
    console.error(
      `[msb/autonomy] права фоновых задач ${(await loadState()).state.autonomyRights ? 'включены' : 'выключены'} владельцем`,
    );
    return show(await autonomyRightsScreen());
  }
  if (data.startsWith('auto:task:')) {
    const id = data.slice('auto:task:'.length);
    return show(placeholder(`Задача ${id.slice(0, 8)}`, 'auto:tasks'));
  }
  if (data.startsWith('auto:task-toggle:') || data.startsWith('auto:task-delete:')) {
    return show(await autonomyTasksScreen());
  }

  return UNHANDLED;
}
