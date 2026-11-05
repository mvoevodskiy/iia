import { hasClaudeAuth, loadState, updateState } from '../state.mjs';
import { listTasks } from '../autonomy/store.mjs';
import {
  MODEL_MAP,
  agentKeyboard,
  autonomyKeyboard,
  connKeyboard,
  effortKeyboard,
  modelKeyboard,
  permModeKeyboard,
  restartKeyboard,
  settingsKeyboard,
  startKeyboard,
} from './keyboards.mjs';

export async function renderStart(cfg) {
  const { state } = await loadState();
  const auth = hasClaudeAuth(process.env, state);
  const text = [
    `<b>IIA open-core</b> · ${cfg.version}`,
    `Бот: <code>${cfg.botId}</code>`,
    auth ? 'Статус: AI подключён' : 'Статус: нужна подписка Claude / ключ',
    '',
    'Открытое ядро вместо закрытого бандла. Обвязка Cursor/Codex/Qwen работает как раньше.',
  ].join('\n');
  return { text, keyboard: startKeyboard() };
}

export async function renderSettings() {
  const { state } = await loadState();
  const text = [
    '<b>⚙️ Настройки</b>',
    `Движок: ${state.engine === 'oc' ? 'OpenClaw' : 'Claude Code'}`,
    `Модель: <code>${state.ccModel || state.model || 'opus'}</code>`,
    `Глубина: <code>${state.ccEffort || state.effort || 'default'}</code>`,
    `Режим: <code>${state.permissionMode || state.permMode || 'auto'}</code>`,
  ].join('\n');
  return { text, keyboard: settingsKeyboard() };
}

export async function renderAgent() {
  const { state } = await loadState();
  return {
    text: [
      '<b>🧠 Агент</b>',
      `Модель: <code>${state.ccModel || state.model || 'opus'}</code>`,
      `Глубина: <code>${state.ccEffort || state.effort || 'default'}</code>`,
      `Режим прав: <code>${state.permissionMode || state.permMode || 'auto'}</code>`,
    ].join('\n'),
    keyboard: agentKeyboard(state),
  };
}

export async function renderConn() {
  const { state } = await loadState();
  const auth = hasClaudeAuth(process.env, state);
  return {
    text: [
      '<b>🔌 Подключения</b>',
      auth
        ? 'Claude Code: подключено (OAuth / ключ / bypass обвязки).'
        : 'Claude Code: нет токена.\nПришли следующим сообщением вывод <code>claude setup-token</code> или ключ <code>sk-ant-…</code>.',
      '',
      'Cursor / Codex / Qwen — через обвязку <code>run.mjs</code> (те же кнопки после install overlay).',
    ].join('\n'),
    keyboard: connKeyboard(auth),
  };
}

export function renderModel() {
  return {
    text: '<b>🧠 Модель</b>\nВыбери семейство. Конкретные версии можно позже закрепить в state.model.',
    keyboard: modelKeyboard(),
  };
}

export function renderEffort() {
  return {
    text: '<b>💭 Глубина мыслей</b>\nПередаётся в Claude Code как <code>--effort</code>.',
    keyboard: effortKeyboard(),
  };
}

export function renderPermMode() {
  return {
    text: '<b>🔐 Режим прав</b>\n<code>--permission-mode</code> для Claude Code.',
    keyboard: permModeKeyboard(),
  };
}

export function renderRestart() {
  return {
    text: 'Перезапустить процесс бота? Активный ход будет прерван.',
    keyboard: restartKeyboard(),
  };
}

export async function renderAutonomy() {
  const tasks = await listTasks();
  return {
    text: [
      '<b>🥷 Автономка</b>',
      `Активных задач: ${tasks.filter((t) => t.enabled !== false).length}`,
      '',
      'Задачи лежат в <code>~/.iia/autonomy/tasks.json</code>.',
      'Создать: напиши в чате «каждые N часов …» или открой список.',
    ].join('\n'),
    keyboard: autonomyKeyboard(),
  };
}

export async function renderTasks() {
  const tasks = await listTasks();
  if (!tasks.length) {
    return {
      text: 'Задач пока нет. Опиши расписание обычным сообщением — open-core сохранит черновик задачи.',
      keyboard: autonomyKeyboard(),
    };
  }
  const lines = tasks.map((t, i) => {
    const mark = t.enabled === false ? '⏸' : '▶️';
    return `${mark} <b>${i + 1}.</b> ${escapeHtml(t.title || t.prompt?.slice(0, 60) || t.id)}`;
  });
  return {
    text: `<b>📋 Задачи</b>\n\n${lines.join('\n')}`,
    keyboard: autonomyKeyboard(),
  };
}

export function renderAbout(cfg) {
  return {
    text: [
      '<b>IIA open-core</b>',
      `Версия: <code>${cfg.version}</code>`,
      'Исходники: <code>.iia/bot/src/</code>',
      'Закрытый бандл сохранён в <code>.iia/bot/vendor/</code> как эталон контрактов.',
      'Vendor sync/puller отключены по умолчанию (нет телеметрии создателя).',
    ].join('\n'),
    keyboard: startKeyboard(),
  };
}

export async function applyModelFamily(family) {
  const model = MODEL_MAP[family];
  if (!model) return null;
  await updateState((s) => {
    s.ccModel = family;
    s.model = model;
    delete s.ccSessionId; // смена модели — новая сессия, как в бандле
    return s;
  });
  return model;
}

export async function applyEffort(value) {
  await updateState((s) => {
    if (value === 'off') {
      delete s.ccEffort;
      delete s.effort;
    } else {
      s.ccEffort = value;
      s.effort = value;
    }
    return s;
  });
}

export async function applyPermMode(value) {
  await updateState((s) => {
    s.permissionMode = value;
    s.permMode = value;
    delete s.ccSessionId;
    return s;
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
