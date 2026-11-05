import { InlineKeyboard } from 'grammy';

export function startKeyboard() {
  return new InlineKeyboard()
    .text('🧠 Агент', 'menu:agent')
    .text('🥷 Автономка', 'menu:autonomy')
    .row()
    .text('⚙️ Настройки', 'menu:settings')
    .text('ℹ️ О ядре', 'menu:about');
}

export function settingsKeyboard() {
  return new InlineKeyboard()
    .text('🔌 Подключения', 'settings:conn')
    .text('🧠 Модель', 'settings:model')
    .row()
    .text('💭 Глубина', 'settings:effort')
    .text('🔐 Режим', 'settings:permmode')
    .row()
    .text('🔄 Перезапуск', 'settings:restart')
    .text('« Назад', 'menu:back');
}

export function agentKeyboard(state = {}) {
  const model = state.ccModel || state.model || 'opus';
  const effort = state.ccEffort || state.effort || 'default';
  return new InlineKeyboard()
    .text(`🧠 Модель · ${shortModel(model)}`, 'settings:model')
    .row()
    .text(`💭 Глубина · ${effort}`, 'settings:effort')
    .row()
    .text(`🔐 Режим · ${state.permissionMode || state.permMode || 'auto'}`, 'settings:permmode')
    .row()
    .text('« Назад', 'menu:back');
}

export function modelKeyboard() {
  return new InlineKeyboard()
    .text('🧠 Opus', 'settings:model:set:opus')
    .text('🚀 Sonnet', 'settings:model:set:sonnet')
    .row()
    .text('⚡ Haiku', 'settings:model:set:haiku')
    .text('🔮 Fable', 'settings:model:fable:ask')
    .row()
    .text('« Назад', 'menu:agent');
}

export function effortKeyboard() {
  return new InlineKeyboard()
    .text('off', 'settings:effort:set:off')
    .text('low', 'settings:effort:set:low')
    .text('medium', 'settings:effort:set:medium')
    .row()
    .text('high', 'settings:effort:set:high')
    .text('max', 'settings:effort:set:max')
    .row()
    .text('« Назад', 'menu:agent');
}

export function permModeKeyboard() {
  return new InlineKeyboard()
    .text('auto', 'settings:permmode:set:auto')
    .text('smart', 'settings:permmode:set:smart')
    .row()
    .text('plan', 'settings:permmode:set:plan')
    .text('control', 'settings:permmode:set:control')
    .row()
    .text('bypass', 'settings:permmode:set:bypassPermissions')
    .row()
    .text('« Назад', 'menu:agent');
}

export function connKeyboard(hasAuth) {
  return new InlineKeyboard()
    .text(hasAuth ? '✅ Claude подключён' : '🔑 Токен Claude', 'settings:auth')
    .row()
    .text('« Назад', 'menu:settings');
}

export function autonomyKeyboard() {
  return new InlineKeyboard()
    .text('📋 Задачи', 'auto:tasks')
    .text('ℹ️ Что это', 'auto:what')
    .row()
    .text('« Назад', 'menu:back');
}

export function restartKeyboard() {
  return new InlineKeyboard()
    .text('✅ Перезапустить', 'settings:restart:do')
    .text('Отмена', 'menu:settings');
}

function shortModel(model) {
  const m = String(model);
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  if (m.includes('fable')) return 'Fable';
  return m.slice(0, 18);
}

export const MODEL_MAP = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  fable: 'claude-fable-5',
};
