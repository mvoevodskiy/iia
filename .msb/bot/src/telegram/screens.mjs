/**
 * Экраны Telegram: адаптация прежнего поведения и навигации к открытому ядру.
 * Источник: vendor/deobfuscated.js (Ph, Ky, mK, mE, autonomy, monitor, mcp…).
 */
import { InlineKeyboard } from 'grammy';
import { hasClaudeAuth, loadState, resolveModel } from '../state.mjs';
import { listTasks } from '../autonomy/store.mjs';
import { listSourcesFlat, loadMonitorConfig } from '../monitor/config.mjs';
import { loadMeta } from '../monitor/store.mjs';
import { listBots } from '../bots/manage.mjs';
import { QUICK_KEYS, listEnvEntries } from '../env/store.mjs';
import { checkOwnUpdates } from '../updates/client.mjs';
import { escapeHtml } from './edit.mjs';
import { CC_ONLY_OC_BLOCK } from './commands.mjs';
import { agentDisplay } from '../agent/display.mjs';
import { readSessionContext, formatContextUsage } from '../agent/context.mjs';

const BLANK = '⠀';

export function hubKeyboard() {
  return new InlineKeyboard()
    .text('🆕 Новая сессия', 'menu:newtask')
    .text('📁 Проекты', 'menu:projects')
    .row()
    .text('💬 Сессии', 'menu:sessions')
    .text('🧩 Навыки', 'menu:skills')
    .row()
    .text('🧠 Агент', 'menu:agent')
    .text('🔌 MCP', 'menu:mcp')
    .row()
    .text('⚙️ Настройки', 'menu:settings')
    .text('🥷 Автономка', 'menu:autonomy');
}

export function hubScreen() {
  return {
    text: `Готов. Пиши задачу или выбери действие.\n${BLANK}`,
    keyboard: hubKeyboard(),
  };
}

export async function agentScreen(state) {
  const permLabels = {
    auto: 'без спроса',
    smart: 'auto',
    control: 'с подтверждением',
    plan: 'сначала план',
    bypassPermissions: 'bypass',
    acceptEdits: 'acceptEdits',
  };
  const effortLabels = {
    off: 'выкл',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  };
  const display = await agentDisplay(state);
  const modelLabel = display.model.replace(/^claude-/, '');
  const effort = display.effort;
  const effortLabel = effort ? effortLabels[effort] || effort : null;
  const perm = display.engine === 'Codex' ? 'полный доступ, без подтверждений' : permLabels[state.permissionMode || state.permMode || 'auto'] || 'без спроса';
  const engine = display.engine;

  const lines = [
    `Модель: <b>${escapeHtml(modelLabel)}</b>`,
    ...(effortLabel !== null ? [`Глубина: <b>${escapeHtml(effortLabel)}</b>`] : []),
    `Режим: <b>${escapeHtml(perm)}</b>`,
    `Подключение: <b>${escapeHtml(engine)}</b>`,
  ];

  const kb = new InlineKeyboard();
  if (effortLabel !== null) {
    kb.text('🧠 Модель', 'settings:model').text('💭 Глубина', 'settings:effort').row();
    kb.text('🔐 Режим', 'settings:permmode').text('🔌 Подключение', 'settings:conn').row();
  } else {
    kb.text('🧠 Модель', 'settings:model').text('🔐 Режим', 'settings:permmode').row();
    kb.text('🔌 Подключение', 'settings:conn').row();
  }
  kb.text('« Назад', 'menu:back');

  return {
    text: `<b>🧠 Агент</b>\n\n${lines.join('\n')}\n${BLANK}`,
    keyboard: kb,
  };
}

export function modelScreen() {
  return {
    text: `<b>🧠 Модель</b>\n\nВыбери семейство. Конкретные версии — в «📌 Версии».\n${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🧠 Opus', 'settings:model:set:opus')
      .text('🚀 Sonnet', 'settings:model:set:sonnet')
      .row()
      .text('⚡ Haiku', 'settings:model:set:haiku')
      .text('🔮 Fable', 'settings:model:fable:ask')
      .row()
      .text('📌 Версии', 'settings:model:ver')
      .row()
      .text('« Назад', 'menu:agent'),
  };
}

export function effortScreen() {
  return {
    text: `<b>💭 Глубина мыслей</b>\n\nПередаётся в Claude Code как <code>--effort</code>.\n${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('off', 'settings:effort:set:off')
      .text('low', 'settings:effort:set:low')
      .text('medium', 'settings:effort:set:medium')
      .row()
      .text('high', 'settings:effort:set:high')
      .text('xhigh', 'settings:effort:set:xhigh')
      .text('max', 'settings:effort:set:max')
      .row()
      .text('« Назад', 'menu:agent'),
  };
}

export function permModeScreen() {
  return {
    text: `<b>🔐 Режим прав</b>\n\nКак агент вносит правки.\n${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('без спроса (auto)', 'settings:permmode:set:auto')
      .row()
      .text('smart', 'settings:permmode:set:smart')
      .text('с подтверждением', 'settings:permmode:set:control')
      .row()
      .text('сначала план', 'settings:permmode:set:plan')
      .row()
      .text('bypass', 'settings:permmode:set:bypassPermissions')
      .row()
      .text('« Назад', 'menu:agent'),
  };
}

export async function connScreen(state, env = process.env) {
  const connected = hasClaudeAuth(env, state);
  const display = await agentDisplay(state, env);
  const ccOnly = env.JARVIS_CC_ONLY === '1';
  if (ccOnly && state.engine === 'oc') {
    return {
      text: CC_ONLY_OC_BLOCK,
      keyboard: new InlineKeyboard()
        .text('👾 Claude Code', 'settings:conn:set:cc')
        .row()
        .text('« Назад', 'menu:agent'),
    };
  }

  const text = display.engine !== 'Claude Code'
    ? `<b>🔌 Авторизация Claude</b>\n\nСейчас отвечает ${escapeHtml(display.engine)}. Здесь можно обновить токен Claude: «🔑 Новый токен».\n${BLANK}`
    : connected
    ? `<b>🔌 Подключение</b>\n\nClaude Code работает, подписка подключена ✔\n\nЕсли токен перестал работать, пришли новый: «🔑 Новый токен».\n${BLANK}`
    : `<b>🔌 Подключение</b>\n\nClaude Code ждёт подписку Anthropic.\n\nПришли токен подписки: «🔑 Новый токен». Как его получить — в инструкции.\n${BLANK}`;

  const kb = new InlineKeyboard();
  if (connected) {
    kb.text(display.engine === 'Claude Code' ? '👾 Claude Code ✓ включен' : '👾 Claude · настройка токена', 'settings:conn:noop').row();
    kb.text('🔑 Новый токен', 'settings:auth:switch-sub').row();
  } else {
    kb.text('🔑 Новый токен', 'settings:auth:switch-sub').row();
  }
  if (!ccOnly) {
    kb.text('⚙️ Движки', 'eng:home').row();
  }
  kb.text('« Назад', 'menu:agent');
  return { text, keyboard: kb };
}

export function settingsScreen(state, { showEngines = true } = {}) {
  const limit =
    state.dailySpendLimit > 0
      ? `💰 Лимит API: $${state.dailySpendLimit}/день`
      : '💰 Лимит API: без ограничений';
  const kb = new InlineKeyboard();
  kb.text('🔑 Переменные окружения', 'settings:env').row();
  kb.text('🔌 Подключения', 'settings:auth').row();
  if (showEngines) kb.text('⚙️ Движки', 'eng:home').row();
  kb.text('🤖 Мои боты', 'settings:bots').row();
  kb.text('🕐 Часовой пояс', 'settings:tz').row();
  kb.text('🔕 Отключённые уведомления', 'nm:list').row();
  kb.text(limit, 'settings:limit').row();
  kb.text('🖥️ Состояние сервера', 'settings:server-status').row();
  kb.text('🔧 Системные', 'settings:extras').row();
  kb.text('« Назад', 'menu:back');
  return {
    text: `<b>⚙️ Настройки</b>\n\nПодключения, лимиты, сервер и системные опции.\n${BLANK}`,
    keyboard: kb,
  };
}

export function extrasScreen() {
  return {
    text: `<b>🔧 Системные</b>

🌐 <b>SSH доступ к серверу</b> — ключи, файрвол, прямое подключение.
♻️ <b>Перезапустить бота</b> — нужен после обновления кода.
🎤 <b>Расшифровка голоса</b> — Deepgram; обработчик голоса в open-core пока не подключён.
📦 <b>Обновления</b> — свой канал (не vendor создателя).
💾 <b>Хранилище мониторинга</b> — в Мониторинг → ⚙️ Настройки.`,
    keyboard: new InlineKeyboard()
      .text('🌐 SSH доступ к серверу', 'settings:ssh')
      .row()
      .text('♻️ Перезапустить бота', 'settings:restart')
      .row()
      .text('🎤 Расшифровка голоса: Deepgram', 'settings:stt')
      .row()
      .text('📦 Обновления', 'settings:updates')
      .row()
      .text('« Назад', 'settings:back'),
  };
}

export async function updatesScreen() {
  const st = await checkOwnUpdates();
  return {
    text: `<b>📦 Обновления</b>

Vendor-канал создателя закрытого ядра <b>отключён</b>.

Свой сервис: <code>MSB_OWN_UPDATES_URL</code>
Статус: ${escapeHtml(st.message)}
Установка обновлений через меню пока не реализована.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🔄 Проверить', 'settings:updates')
      .row()
      .text('« Назад', 'settings:extras'),
  };
}

export function restartConfirmScreen() {
  return {
    text: 'Перезапустить процесс бота? Активный ход будет прерван.',
    keyboard: new InlineKeyboard()
      .text('✅ Перезапустить', 'settings:restart:do')
      .text('Отмена', 'settings:extras'),
  };
}

export function sshUnavailableScreen() {
  return {
    text: `<b>🔐 SSH доступ к серверу</b>

⚠️ Не удалось получить статус (constructor API недоступен в open-core без хаба).

На боксе с обвязкой открой тот же экран через overlay — локальный SSH IP там уже есть.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🔄 Обновить', 'settings:ssh')
      .row()
      .text('« Назад', 'settings:extras'),
  };
}

export async function botsScreen() {
  const bots = await listBots();
  const lines = [
    '<b>🤖 Мои боты</b>',
    '',
    'Несколько ботов на одном сервере: у каждого свой чат, свои настройки и характер.',
    '',
  ];
  for (const b of bots) {
    const mark = b.active === true ? '🟢' : b.active === false ? '🔴' : '⚪';
    lines.push(`${mark} <b>${escapeHtml(b.botId)}</b>${b.here ? ' — ты здесь' : ''}`);
  }
  lines.push(BLANK);
  const kb = new InlineKeyboard();
  for (const b of bots) {
    kb.text(b.botId, `settings:bots:bot:${b.botId}`).row();
  }
  kb.text('+ Добавить бота', 'settings:bots:add').row();
  kb.text('🔄 Обновить', 'settings:bots:refresh').row();
  kb.text('« Назад', 'settings:back');
  return { text: lines.join('\n'), keyboard: kb };
}

export async function botDetailScreen(botId) {
  const bots = await listBots();
  const b = bots.find((x) => x.botId === botId);
  const kb = new InlineKeyboard();
  if (!b) {
    return {
      text: `<b>🤖 ${escapeHtml(botId)}</b>\n\nБот не найден на диске.`,
      keyboard: new InlineKeyboard().text('« Назад', 'settings:bots'),
    };
  }
  if (b.botId === 'default' || b.here) {
    kb.text('« Назад', 'settings:bots');
    return {
      text: `<b>🤖 ${escapeHtml(b.botId)}</b>\n\n${
        b.here ? 'Это текущий бот.' : 'Основной бот — его удалить нельзя.'
      }\nСтатус: ${b.active ? 'active' : 'stopped/unknown'}`,
      keyboard: kb,
    };
  }
  kb.text('🗑 Удалить', `settings:bots:delete:${b.botId}`).row();
  kb.text('« Назад', 'settings:bots');
  return {
    text: `<b>🤖 ${escapeHtml(b.botId)}</b>\n\nСтатус: ${
      b.active ? 'active' : 'stopped/unknown'
    }\nМожно удалить, если больше не нужен.`,
    keyboard: kb,
  };
}

export async function envScreen() {
  const entries = await listEnvEntries();
  const lines = [
    '<b>🔑 Переменные окружения</b>',
    '',
    `Записей в <code>.env</code> бота: ${entries.length}`,
    'Это параметры, включая служебные; вход Codex хранится отдельно.',
    '',
  ];
  for (const e of entries.slice(0, 25)) {
    lines.push(`• <code>${escapeHtml(e.key)}</code> — ${escapeHtml(e.masked)}${e.protected ? ' 🔒' : ''}`);
  }
  if (entries.length > 25) lines.push(`… и ещё ${entries.length - 25}`);
  lines.push(BLANK);
  const kb = new InlineKeyboard();
  for (const q of QUICK_KEYS.slice(0, 6)) {
    kb.text(`➕ ${q.label}`, `settings:env:quick:${q.key}`).row();
  }
  kb.text('➕ Свой ключ', 'settings:env:add').row();
  for (const e of entries.filter((x) => !x.protected).slice(0, 8)) {
    kb.text(`🗑 ${e.key}`, `settings:env:delete:${e.key}`).row();
  }
  kb.text('« Назад', 'settings:back');
  return { text: lines.join('\n'), keyboard: kb };
}

export function tzScreen(state) {
  const tz = state.timezone || process.env.MSB_TIMEZONE || 'Europe/Moscow';
  return {
    text: `<b>🕐 Часовой пояс</b>\n\nСейчас: <code>${escapeHtml(tz)}</code>\n\nПришли новое имя зоны (например <code>Europe/Moscow</code> или <code>Asia/Yekaterinburg</code>).\n${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:back'),
  };
}

export function limitScreen(state) {
  const lim = state.dailySpendLimit ?? 10;
  return {
    text: `<b>💰 Лимит API</b>\n\nСохранённый лимит: ${lim > 0 ? `$${lim}/день` : 'без ограничений'}.\nВыбери значение кнопкой. Проверка и применение лимита в open-core пока не подключены.\n${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('$10', 'settings:limit:set:10')
      .text('$25', 'settings:limit:set:25')
      .text('$50', 'settings:limit:set:50')
      .row()
      .text('Без лимита', 'settings:limit:set:0')
      .row()
      .text('« Назад', 'settings:back'),
  };
}

export function serverStatusScreen(cfg) {
  return {
    text: `<b>🖥️ Состояние сервера</b>

Бот: <code>${escapeHtml(cfg.botId)}</code>
Ядро: open-core <code>${escapeHtml(cfg.version)}</code>
Workspace: <code>${escapeHtml(cfg.workspace)}</code>
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:back'),
  };
}

export async function enginesScreen(state, env = process.env, providerView = null) {
  const eng = providerView?.activeTitle || (await agentDisplay(state, env)).engine;
  const keyboard = new InlineKeyboard().text('👾 Claude Code', 'settings:engine:set:cc').row();
  for (const choice of providerView?.choices || []) keyboard.text(choice.text, choice.callback_data).row();
  return {
    text: `<b>⚙️ Движки</b>

Сейчас отвечает: <b>${escapeHtml(eng)}</b>

OpenClaw в open-core ещё переносится. Текущее подключение можно сохранить.
${BLANK}`,
    keyboard: keyboard
      .text('➕ OpenClaw', 'eng:add')
      .row()
      .text('« Назад', 'menu:settings'),
  };
}

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

Просмотр журнала через меню пока не подключён. Прогоны сохраняются в <code>~/.msb/autonomy/runs.jsonl</code>.
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

export async function monitorScreen(back = 'menu:back') {
  const cfg = await loadMonitorConfig();
  const meta = await loadMeta();
  const sources = listSourcesFlat(cfg);
  const broken = sources.filter((s) => {
    const bucket = cfg[s.type];
    const list =
      s.type === 'youtube'
        ? bucket.channels
        : s.type === 'twitter'
          ? bucket.accounts
          : s.type === 'github'
            ? bucket.repos
            : s.type === 'telegram'
              ? bucket.channels
              : bucket.feeds;
    const row = (list || []).find((x) => (x.url || x.username || x.channelId || x.handle || `${x.owner}/${x.repo}`) === s.id || x.name === s.name);
    return Boolean(row?.lastError);
  });
  const lines = ['<b>📡 Мониторинг</b>', ''];
  if (!sources.length) {
    lines.push('Статус: нет источников.');
    lines.push('');
    lines.push('Добавь YouTube, X, GitHub, Telegram или RSS — бот будет собирать и присылать дайджест.');
  } else if (broken.length) {
    lines.push(`Статус: ⚠️ ${broken.length} источник(а) с ошибками`);
    lines.push('Открой источники — там детали.');
  } else {
    lines.push(`Статус: ✔ ${sources.length} источник(ов)`);
    const last = Object.values(meta.lastPollAt || {}).sort().slice(-1)[0];
    if (last) lines.push(`Последний сбор: ${last.slice(0, 19).replace('T', ' ')}`);
    lines.push(
      `Дайджест: ${cfg.digest?.enabled ? `каждый день в ${cfg.digest.hour}:00` : 'выключен'} · top ${cfg.digest?.topN || 10}`,
    );
  }
  lines.push(BLANK);
  return {
    text: lines.join('\n'),
    keyboard: new InlineKeyboard()
      .text('🛰️ Источники', 'mon:sources')
      .text('📨 Дайджест', 'mon:digest')
      .row()
      .text('⚙️ Настройки', 'mon:settings')
      .text('❔ Что это', 'mon:help')
      .row()
      .text('« Назад', back),
  };
}

export async function monitorSourcesScreen() {
  const cfg = await loadMonitorConfig();
  const sources = listSourcesFlat(cfg);
  const kb = new InlineKeyboard();
  let text;
  if (!sources.length) {
    text = `<b>🛰️ Источники</b>\n\nПока пусто.\n\n+ Добавить источник — пришли ссылку или @ник.\n${BLANK}`;
  } else {
    const lines = sources.map((s) => `• <b>${escapeHtml(s.type)}</b> ${escapeHtml(s.name)}`);
    text = `<b>🛰️ Источники</b> (${sources.length})\n\n${lines.join('\n')}\n${BLANK}`;
    for (const s of sources.slice(0, 20)) {
      kb.text(`🗑 ${s.type}:${s.name}`.slice(0, 40), `mon:src-del:${s.type}:${encodeURIComponent(s.id)}`).row();
    }
  }
  kb.text('+ Добавить источник', 'mon:add-hint').row();
  kb.text('« Назад', 'mon:back');
  return { text, keyboard: kb };
}

export async function monitorDigestScreen() {
  const cfg = await loadMonitorConfig();
  const { state } = await loadState();
  const on = cfg.digest?.enabled !== false;
  return {
    text: `<b>📨 Дайджест</b>

Сейчас: <b>${on ? 'включён' : 'выключен'}</b>
Время: <b>${cfg.digest?.hour ?? 9}:00</b> (${escapeHtml(state.timezone || process.env.MSB_TIMEZONE || 'Europe/Moscow')})
Материалов: <b>${cfg.digest?.topN ?? 10}</b>
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text(on ? '⏸ Выключить' : '▶️ Включить', 'mon:digest-toggle')
      .row()
      .text('🕘 8:00', 'mon:digest:time:set:8')
      .text('🕘 9:00', 'mon:digest:time:set:9')
      .text('🕘 18:00', 'mon:digest:time:set:18')
      .row()
      .text('🔢 10', 'mon:digest:count:set:10')
      .text('🔢 15', 'mon:digest:count:set:15')
      .text('🔢 25', 'mon:digest:count:set:25')
      .row()
      .text('📨 Прислать сейчас', 'digest:now')
      .row()
      .text('« Назад', 'mon:back'),
  };
}

export function monitorHelpScreen() {
  return {
    text: `<b>❔ Что такое мониторинг</b>

Следит за названными источниками и собирает дайджест. Источники добавляются ссылкой или @ником.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'mon:back'),
  };
}

export function monitorSettingsScreen() {
  return {
    text: `<b>⚙️ Настройки мониторинга</b>

Выбор хранилища сохраняется. Текущий open-core записывает материалы в JSONL; backend SQLite пока не подключён.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('💾 jsonl', 'mon:storage:set:jsonl')
      .text('💾 sqlite', 'mon:storage:set:sqlite')
      .row()
      .text('⚡ Собрать всё сейчас', 'mon:poll:all')
      .row()
      .text('« Назад', 'mon:back'),
  };
}

export function mcpScreen() {
  return {
    text: `🔌 <b>MCP серверы</b>

Внешние сервисы — транскрипты, скрейпинг, базы данных и другие инструменты.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('📁 workspace', 'mcp:folder:workspace')
      .row()
      .text('« Назад', 'menu:back'),
  };
}

export function mcpWorkspaceScreen() {
  return {
    text: `<b>📁 workspace</b>

Доступны агенту во всех проектах.

<i>Список native MCP пока не читается этим экраном.</i>
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('➕ Добавить', 'mcp:add')
      .row()
      .text('« Назад', 'menu:mcp'),
  };
}

export function mcpAddScreen() {
  return {
    text: `<b>➕ MCP сервер</b>

Прежние пункты настройки. Их установка в open-core пока не подключена.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('Supadata', 'mcp:setup:supadata')
      .text('Apify', 'mcp:setup:apify')
      .row()
      .text('« Назад', 'mcp:folder:workspace'),
  };
}

export function skillsScreen() {
  return {
    text: `<b>🧩 Навыки</b>

Список навыков выбранного CLI пока не читается этим экраном.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'menu:back'),
  };
}

export async function sessionsScreen(state = {}, env = process.env) {
  const context = formatContextUsage(await readSessionContext(state.ccSessionId, env));
  return {
    text: `<b>💬 Сессии</b>

Текущая сессия: ${escapeHtml((await agentDisplay(state, env)).engine)}. Новая сессия — кнопка ниже или /newtask.
${context || 'Контекст: нет данных текущей сессии.'}
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🆕 Новая сессия', 'menu:newtask')
      .row()
      .text('« Назад', 'menu:back'),
  };
}

export function projectsScreen() {
  return {
    text: `<b>📁 Проекты</b>

Проекты живут в <code>~/projects/</code>. Кнопка создаёт папку и сохраняет выбранный проект. Переключение cwd в open-core пока не подключено.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('➕ Новый проект', 'menu:newproject')
      .row()
      .text('« Назад', 'menu:back'),
  };
}

export function setupScreen() {
  return {
    text: `Сначала подключи AI.

Для Claude нужен его токен. Codex и другие CLI подключаются через /settings → «Подключения».
Нажми «🔑 Новый токен» и пришли вывод <code>claude setup-token</code> или ключ <code>sk-ant-…</code>.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🔑 Новый токен', 'setup:subscription')
      .row()
      .text('❔ Инструкция', 'setup:help'),
  };
}

export function notificationsScreen() {
  return {
    text: `<b>🔕 Отключённые уведомления</b>

Этот экран пока не читает список отключённых уведомлений.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:back'),
  };
}

export function sttScreen() {
  return {
    text: `<b>🎤 Расшифровка голоса</b>

Провайдер: Deepgram. Ключ — в «Переменные окружения». Обработчик голоса в open-core пока не подключён.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:extras'),
  };
}

export function placeholder(title, back, message = 'Этот раздел пока не реализован в Telegram. Настройки не изменены.') {
  return {
    text: `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}\n${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', back),
  };
}


export async function statusScreen(state, cfg, env = process.env) {
  const agent = await agentDisplay(state, env);
  const context = formatContextUsage(await readSessionContext(state.ccSessionId, env));
  return {
    text: [
      '<b>Статус</b>',
      `Бот: <code>${escapeHtml(cfg.botId)}</code>`,
      `Движок: ${escapeHtml(agent.engine)}`,
      `Модель: <code>${escapeHtml(agent.model)}</code>`,
      ...(agent.effort ? [`Глубина: <code>${escapeHtml(agent.effort)}</code>`] : []),
      context || 'Контекст: нет данных текущей сессии.',
      `Workspace: <code>${escapeHtml(cfg.workspace)}</code>`,
      `Сессия: <code>${escapeHtml((state.ccSessionId || '—').slice(0, 24))}</code>`,
    ].join('\n'),
  };
}
