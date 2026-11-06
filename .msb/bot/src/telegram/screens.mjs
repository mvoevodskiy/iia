/**
 * Экраны Telegram 1:1 с закрытым ядром (тексты + callback_data).
 * Источник: vendor/UI-SCREENS.md / CONTRACT-*.md (эталон бывшего закрытого UI).
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
  const modelLabel = resolveModel(state).replace(/^claude-/, '');
  const effort = state.ccEffort || state.effort;
  const effortLabel = effort ? effortLabels[effort] || effort : null;
  const perm = permLabels[state.permissionMode || state.permMode || 'auto'] || 'без спроса';
  const engine = state.engine === 'oc' ? 'OpenClaw' : '👾 Claude Code';

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
  const ccOnly = (env.MSB_CC_ONLY || env.JARVIS_CC_ONLY) === '1';
  if (ccOnly && state.engine === 'oc') {
    return {
      text: CC_ONLY_OC_BLOCK,
      keyboard: new InlineKeyboard()
        .text('👾 Claude Code', 'settings:conn:set:cc')
        .row()
        .text('« Назад', 'menu:agent'),
    };
  }

  const text = connected
    ? `<b>🔌 Подключение</b>\n\nClaude Code работает, подписка подключена ✔\n\nЕсли токен перестал работать, пришли новый: «🔑 Новый токен».\n${BLANK}`
    : `<b>🔌 Подключение</b>\n\nClaude Code ждёт подписку Anthropic.\n\nПришли токен подписки: «🔑 Новый токен». Как его получить — в инструкции.\n${BLANK}`;

  const kb = new InlineKeyboard();
  if (connected) {
    kb.text('👾 Claude Code ✓ включен', 'settings:conn:noop').row();
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
🎤 <b>Расшифровка голоса</b> — Deepgram (облако, $200 в подарок).
🖥 <b>Пульт</b> — веб-панель ботов, задач и сервера (выкл по умолчанию).
📦 <b>Обновления</b> — свой канал (не vendor создателя).
💾 <b>Хранилище мониторинга</b> — в Мониторинг → ⚙️ Настройки.`,
    keyboard: new InlineKeyboard()
      .text('🌐 SSH доступ к серверу', 'settings:ssh')
      .row()
      .text('♻️ Перезапустить бота', 'settings:restart')
      .row()
      .text('🎤 Расшифровка голоса: Deepgram', 'settings:stt')
      .row()
      .text('🖥 Пульт', 'settings:pult')
      .row()
      .text('📦 Обновления', 'settings:updates')
      .row()
      .text('« Назад', 'settings:back'),
  };
}

/**
 * Раздел настроек Пульта: пароль, вкл/выкл, IP прослушивания, опц. бот тревог.
 * @param {object|null} pultSnap — блок pult из msb-engine
 * @param {object} cfg — { password, host, tgToken, publicUrl }
 * @param {string} note
 */
export function pultScreen(pultSnap = null, cfg = {}, note = '') {
  const p = pultSnap || {};
  const installed = p.installed === true;
  const on = p.enabled === true;
  const active = p.active === true;
  let status;
  if (!installed) status = 'код не найден (~/.msb/pult) — переустанови ядро';
  else if (on && active) status = 'включён, службы работают';
  else if (on) status = 'включён, но службы не active — journalctl -u pult-web';
  else status = 'выключен';

  const password = cfg.password ? 'задан' : 'не задан';
  const host = cfg.host || '127.0.0.1';
  const hostLabel =
    host === '0.0.0.0' || host === '::'
      ? 'все интерфейсы (0.0.0.0)'
      : host === '127.0.0.1' || host === '::1'
        ? 'только localhost'
        : host;
  const tg = cfg.tgToken ? 'задан' : 'нет (необязателен)';
  const url = cfg.publicUrl || process.env.PULT_PUBLIC_URL || 'http://127.0.0.1:8791';
  const sessionHours = Number(cfg.sessionHours) > 0 ? Number(cfg.sessionHours) : 4;

  const kb = new InlineKeyboard();
  if (installed) {
    if (on) kb.text('⏸ Выключить', 'settings:pult:off').row();
    else kb.text('▶️ Включить', 'settings:pult:on').row();
  }
  kb.text('🔑 Пароль', 'settings:pult:password').row();
  kb.text('🌐 Адрес прослушивания', 'settings:pult:listen').row();
  kb.text(`⏱ Сессия: ${sessionHours} ч`, 'settings:pult:session').row();
  kb.text('🤖 Бот тревог (опц.)', 'settings:pult:tg-token').row();
  kb.text('🔗 Публичный URL', 'settings:pult:url').row();
  kb.text('🔄 Обновить', 'settings:pult').row();
  kb.text('« Назад', 'settings:extras');

  return {
    text: `<b>🖥 Пульт</b>

Веб-панель ботов, задач и сервера. Открывается командой <code>/pult</code> из любого бота.
Mini App — вход по подписи Telegram; веб-ссылка — одноразовая (билет сгорает при любом переходе).

Статус: <b>${escapeHtml(status)}</b>
Пароль: <b>${escapeHtml(password)}</b>
Слушает: <b>${escapeHtml(hostLabel)}</b> (<code>${escapeHtml(host)}</code>)
Сессия браузера: <b>${sessionHours} ч</b>
Бот тревог/сводки: <b>${escapeHtml(tg)}</b>
Публичный URL: <code>${escapeHtml(url)}</code>
${note ? `\n${note}` : ''}
${BLANK}`,
    keyboard: kb,
  };
}

export function pultListenScreen(currentHost = '127.0.0.1') {
  return {
    text: `<b>🌐 Адрес прослушивания Пульта</b>

Сейчас: <code>${escapeHtml(currentHost)}</code>

• <b>localhost</b> — только с этой машины
• <b>все интерфейсы</b> — LAN / nginx на том же хосте
• <b>свой IP</b> — конкретный адрес сетевого интерфейса
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🔒 localhost', 'settings:pult:listen:set:127.0.0.1')
      .row()
      .text('🌐 Все (0.0.0.0)', 'settings:pult:listen:set:0.0.0.0')
      .row()
      .text('✏️ Свой IP', 'settings:pult:listen:custom')
      .row()
      .text('« Назад', 'settings:pult'),
  };
}

export async function updatesScreen() {
  const st = await checkOwnUpdates();
  return {
    text: `<b>📦 Обновления</b>

Vendor-канал создателя закрытого ядра <b>отключён</b>.

Свой сервис: <code>MSB_OWN_UPDATES_URL</code>
Статус: ${escapeHtml(st.message)}
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
    'Несколько ботов на Claude Code на одном сервере: у каждого свой чат, свои настройки и характер.',
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
    `В <code>.env</code> бота сейчас ключей: ${entries.length}`,
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
    text: `<b>💰 Лимит API</b>\n\nСейчас: ${lim > 0 ? `$${lim}/день` : 'без ограничений'}.\nПришли число (USD) или 0 для снятия лимита.\n${BLANK}`,
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

export function enginesScreen(state, engineSnap = null) {
  const eng = state.engine === 'oc' ? 'OpenClaw' : 'Claude Code';
  const j = (engineSnap?.msb || engineSnap?.jarvis);
  const o = engineSnap?.openclaw;
  const helper = engineSnap?.helper ? String(engineSnap.helper) : '—';
  const jLine = j
    ? `MSB-бот: <b>${escapeHtml(j.state)}</b>${j.bots?.length ? ` (${j.bots.length})` : ''}`
    : 'MSB-бот: нет данных helper';
  const oLine = o
    ? `OpenClaw: <b>${o.installed ? (o.enabled ? o.gateway || 'on' : 'off') : 'не установлен'}</b>`
    : 'OpenClaw: нет данных';
  const err = engineSnap?.error === 'NO_STATE'
    ? '\n\n⚠️ Нет /run/msb-engine/state.json — проверь msb-engine.path'
    : '';
  return {
    text: `<b>⚙️ Движки</b>

Сейчас отвечает: <b>${escapeHtml(eng)}</b>
Helper: <code>${escapeHtml(helper)}</code>

${jLine}
${oLine}${err}

Установка OpenClaw из меню — в v1.1. Сейчас: статус / вкл-выкл, если OC уже на боксе.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('👾 Claude Code', 'settings:engine:set:cc')
      .row()
      .text('🔄 Статус helper', 'eng:status')
      .row()
      .text('▶️ OC', 'eng:oc:on')
      .text('⏸ OC', 'eng:oc:off')
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
    text: `<b>🥷 Автономка</b>\n\nАктивных задач: ${active}\nСкажи словами, что делать и когда — заведу задачу.\n${BLANK}`,
    keyboard: kb,
  };
}

export function autonomyWhatScreen() {
  return {
    text: `🥷 <b>Что такое автономка</b>

Обычно я жду твоего сообщения и отвечаю. Автономка это когда я работаю сам, без твоей команды: в нужное время беру задачу, делаю её и присылаю результат.

<b>Как завести</b>
Скажи словами, что делать и когда. Например: <i>«каждое утро в 9 смотри, что нового у конкурентов»</i> или <i>«раз в час проверяй сервер и пиши, только если сломалось»</i>. Я заведу задачу и покажу, что ей разрешено.

<b>Что можно</b>
Посмотреть список задач и открыть любую, поставить на паузу или удалить, посмотреть историю: сколько раз задача ходила, что сделала, во что обошлась.

<b>Про права</b>
У каждой задачи свои границы, и они настоящие, а не на словах. Если задаче позволено только читать, инструментов записи у неё просто нет.

<b>Чем это отличается от таймеров</b>
Таймер повторяет текст в назначенный срок, и всё. Задача умеет больше: у неё есть права, отчёт о работе и история прогонов.
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

Нет активных таймеров.

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

Пока нет прогонов. Они появятся в <code>~/.msb/autonomy/runs.jsonl</code> после первых задач.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'auto:home'),
  };
}

export async function autonomyRightsScreen() {
  const { state } = await loadState();
  const on = state.autonomyRights === true;
  return {
    text: `<b>🔓 Права фоновых задач</b>

Сейчас: <b>${on ? 'включены' : 'выключены'}</b>

По умолчанию фоновые задачи без прав администратора сервера. Включённые права получат только задачи, которым можно читать, сохранять файлы и запускать команды.
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
  const on = cfg.digest?.enabled !== false;
  return {
    text: `<b>📨 Дайджест</b>

Сейчас: <b>${on ? 'включён' : 'выключен'}</b>
Время: <b>${cfg.digest?.hour ?? 9}:00</b> (${process.env.MSB_TIMEZONE || 'Europe/Moscow'})
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

Хранилище по умолчанию — jsonl в <code>~/.msb/monitor/</code>.
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
      .text('📁 workspace (0)', 'mcp:folder:workspace')
      .row()
      .text('« Назад', 'menu:back'),
  };
}

export function mcpWorkspaceScreen() {
  return {
    text: `<b>📁 workspace</b>

Доступны агенту во всех проектах.

<i>Нет серверов</i>
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

Быстрая установка или свой конфиг.
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

Навыки из <code>~/workspace/.claude/skills/</code>. Пока список пуст или читается с диска при следующем обновлении open-core.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'menu:back'),
  };
}

export function sessionsScreen() {
  return {
    text: `<b>💬 Сессии</b>

Текущая сессия Claude Code хранится в state. Новая сессия — кнопка ниже или /newtask.
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

Проекты живут в <code>~/projects/</code>. Создай словами или кнопкой.
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

Нужна подписка Claude (Max) или ключ API.
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

Ничего не отключено.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:back'),
  };
}

export function sttScreen() {
  return {
    text: `<b>🎤 Расшифровка голоса</b>

Провайдер: Deepgram. Ключ — в «Переменные окружения».
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:extras'),
  };
}

export function placeholder(title, back) {
  return {
    text: `<b>${title}</b>\n\nЭкран как в штатном ядре. Логика этого шага ещё переносится в open-core.\n${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', back),
  };
}
