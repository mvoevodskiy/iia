/**
 * Экраны Telegram 1:1 с закрытым ядром (тексты + callback_data).
 * Источник: vendor/deobfuscated.js (Ph, Ky, mK, mE, autonomy, monitor, mcp…).
 */
import { InlineKeyboard } from 'grammy';
import { hasClaudeAuth, loadState, resolveModel } from '../state.mjs';
import { listTasks } from '../autonomy/store.mjs';
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
💾 <b>Хранилище мониторинга</b> — перенесено в меню Мониторинг → ⚙️ Настройки.`,
    keyboard: new InlineKeyboard()
      .text('🌐 SSH доступ к серверу', 'settings:ssh')
      .row()
      .text('♻️ Перезапустить бота', 'settings:restart')
      .row()
      .text('🎤 Расшифровка голоса: Deepgram', 'settings:stt')
      .row()
      .text('« Назад', 'settings:back'),
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

export function botsScreen() {
  return {
    text: `<b>🤖 Мои боты</b>

Несколько ботов на Claude Code на одном сервере: у каждого свой чат в Telegram, свои настройки и характер.

Список грузится с constructor API. В open-core без хаба список недоступен — используй <code>bot-ctl.sh</code> на сервере или iia-updates.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🔄 Попробовать ещё раз', 'settings:bots:refresh')
      .row()
      .text('+ Добавить бота', 'settings:bots:add')
      .row()
      .text('« Назад', 'settings:back'),
  };
}

export function envScreen() {
  return {
    text: `<b>🔑 Переменные окружения</b>

Быстрые ключи для тулзов агента. Секреты пишутся в <code>.env</code> бота.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('➕ Deepgram', 'settings:env:quick:DEEPGRAM_API_KEY')
      .row()
      .text('➕ GitHub Fine-grained', 'settings:env:quick:GITHUB_TOKEN_FINE')
      .row()
      .text('➕ GitHub Classic', 'settings:env:quick:GITHUB_TOKEN_CLASSIC')
      .row()
      .text('« Назад', 'settings:back'),
  };
}

export function tzScreen(state) {
  const tz = state.timezone || process.env.IIA_TIMEZONE || 'Europe/Moscow';
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

export function enginesScreen(state) {
  const eng = state.engine === 'oc' ? 'OpenClaw' : 'Claude Code';
  return {
    text: `<b>⚙️ Движки</b>

Сейчас отвечает: <b>${escapeHtml(eng)}</b>

OpenClaw в open-core ещё переносится. Можно оставить Claude Code.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('👾 Claude Code', 'settings:engine:set:cc')
      .row()
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

Пока нет прогонов. Они появятся в <code>~/.iia/autonomy/runs.jsonl</code> после первых задач.
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

export function monitorScreen(back = 'menu:back') {
  return {
    text: `<b>📡 Мониторинг</b>

Статус: нет источников.

Добавь YouTube, Twitter, GitHub, Telegram или RSS — бот будет собирать и присылать дайджест.
${BLANK}`,
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

export function monitorSourcesScreen() {
  return {
    text: `<b>🛰️ Источники</b>

Пока пусто.

+ Добавить источник — пришли ссылку или @ник.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('+ Добавить источник', 'mon:add-hint')
      .row()
      .text('« Назад', 'mon:back'),
  };
}

export function monitorDigestScreen() {
  return {
    text: `<b>📨 Дайджест</b>

Пока выключен. Включи и укажи время — когда источники появятся, сводка будет приходить сама.
${BLANK}`,
    keyboard: new InlineKeyboard()
      .text('🕘 Время', 'mon:digest:time')
      .text('🔢 Сколько материалов', 'mon:digest:count')
      .row()
      .text('📬 Куда присылать', 'mon:digest:target')
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
    text: `<b>⚙️ Настройки мониторинга</b>`,
    keyboard: new InlineKeyboard()
      .text('💾 Хранилище', 'mon:storage')
      .text('🤖 Модель скоринга', 'mon:model')
      .row()
      .text('🔔 Уведомления', 'mon:notif')
      .text('🎨 Вид отчёта', 'mon:reportstyle')
      .row()
      .text('🔄 Интервалы сбора', 'mon:collection')
      .row()
      .text('💰 Баланс и лимиты', 'mon:balance')
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
