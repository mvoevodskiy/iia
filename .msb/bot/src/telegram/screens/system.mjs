import profile from '../../../shared/profile.cjs';
/**
 * Системные экраны: обновления, перезапуск, SSH и STT.
 * Навигация: [Telegram](../README.md).
 */
import { InlineKeyboard } from 'grammy';
import { checkOwnUpdates } from '../../updates/client.mjs';
import { escapeHtml } from '../edit.mjs';
import { BLANK } from './shared.mjs';

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

Свой сервис: <code>${profile.profileEnvKey('MSB_OWN_UPDATES_URL')}</code>
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

export function sttScreen() {
  return {
    text: `<b>🎤 Расшифровка голоса</b>

Провайдер: Deepgram. Ключ — в «Переменные окружения». Обработчик голоса в open-core пока не подключён.
${BLANK}`,
    keyboard: new InlineKeyboard().text('« Назад', 'settings:extras'),
  };
}
