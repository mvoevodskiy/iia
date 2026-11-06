import profile from '../../../shared/profile.cjs';
/**
 * Автономка: задачи, история, таймеры и сохранённые права.
 * Навигация: [Telegram](../README.md).
 */
import { InlineKeyboard } from 'grammy';
import { listTasks } from '../../autonomy/store.mjs';
import { loadState } from '../../state.mjs';
import { escapeHtml } from '../edit.mjs';
import { BLANK } from './shared.mjs';

export async function autonomyHomeScreen() {
  const tasks = await listTasks();
  const active = tasks.filter((t) => t.enabled !== false).length;
  const kb = new InlineKeyboard()
    .text('📋 Задачи', 'auto:tasks')
    .text('📡 Мониторинг', 'auto:monitor')
    .row()
    .text('🕓 История', 'auto:history')
    .text('⏳ Таймеры', 'auto:timers')
    .row()
    .text('❔ Что это', 'auto:what')
    .row()
    .text('🔓 Права', 'auto:rights')
    .row()
    .text('« Назад', 'menu:back');
  return {
    text: `<b>🥷 Автономка</b>\n\nАктивных задач: ${active}\nПоддерживаются интервалы: «каждые 6 часов проверяй диск».\n${BLANK}`,
    keyboard: kb,
  };
}

export function autonomyWhatScreen() {
  return {
    text: `🥷 <b>Что такое автономка</b>

Обычно я жду твоего сообщения и отвечаю. Автономка это когда я работаю сам, без твоей команды: в нужное время беру задачу, делаю её и присылаю результат.

<b>Как завести</b>
Скажи словами, что делать и когда. Например: <i>«каждое утро в 9 смотри, что нового у конкурентов»</i> или <i>«раз в час проверяй сервер и пиши, только если сломалось»</i>. Штатный парсер сейчас поддерживает интервалы вида «каждые 6 часов …».

<b>Что можно</b>
Список задач работает. Карточки, пауза, удаление и просмотр истории через меню пока не подключены.

<b>Про права</b>
Настройка прав сохраняется, но отдельные границы задач в open-core пока не реализованы. Используются права и сессия выбранного CLI.

<b>Чем это отличается от таймеров</b>
Интервальные задачи выполняются планировщиком. Разовые таймеры и их управление через меню пока не подключены.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'auto:home'),
  };
}

export async function autonomyTasksScreen() {
  const tasks = await listTasks();
  const kb = new InlineKeyboard();
  let text;
  if (!tasks.length) {
    text = `📋 <b>Задачи</b>

Пока пусто. Скажи словами расписание, например:
<i>«каждые 6 часов проверяй диск и пиши итог»</i>
${BLANK}`;
  } else {
    const lines = tasks.map((t, i) => {
      const mark = t.enabled === false ? '⏸' : '▶️';
      return `${mark} <b>${i + 1}.</b> ${escapeHtml(t.title || t.prompt?.slice(0, 60) || t.id)}`;
    });
    text = `📋 <b>Задачи</b> (${tasks.length})\n\n${lines.join('\n')}\n${BLANK}`;
    for (const t of tasks) {
      kb.text(`${t.enabled === false ? '⏸' : '▶️'} ${(t.title || t.id).slice(0, 28)}`, `auto:task:${t.id}`).row();
    }
  }
  kb.text('« Назад', 'auto:home');
  return { text, keyboard: kb };
}

export function autonomyTimersScreen() {
  return {
    text: `⏳ <b>Таймеры</b>

Просмотр и управление разовыми таймерами в open-core пока не подключены.

Скажи агенту:
<i>«каждый день в 9 проверяй новости по AI»</i>
<i>«через 30 минут напомни проверить почту»</i>
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'auto:home'),
  };
}

export function autonomyHistoryScreen() {
  return {
    text: `🕓 <b>История</b>

Просмотр журнала через меню пока не подключён. Прогоны сохраняются в <code>~/${profile.resolveProfile().rootLeaf}/autonomy/runs.jsonl</code>.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'auto:home'),
  };
}

export async function autonomyRightsScreen() {
  const { state } = await loadState();
  const on = state.autonomyRights === true;
  return {
    text: `<b>🔓 Права фоновых задач</b>

Сохранённая настройка: <b>${on ? 'включены' : 'выключены'}</b>

В open-core эта настройка пока не применяется исполнителем. Фоновые задачи используют права и сессию выбранного CLI.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text(on ? '🔒 Выключить права' : '🔓 Включить права', 'auto:rights-toggle')
      .row()
      .text('« Назад', 'auto:home'),
  };
}
