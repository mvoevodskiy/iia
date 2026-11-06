import profile from '../shared/profile.cjs';
import { registerEngineProviderView } from './engine-menu.mjs';
/**
 * Хуки в grammy Bot без правки бандла index.js.
 * Вызывать prepare() ДО import('./index.js').
 *
 * Важно: Bot импортируем как ESM — тот же класс, что у бандла.
 */
import { Bot } from 'grammy';
import fs from 'node:fs/promises';
import os from 'node:os';
import { isProviderId, getProvider } from './providers.mjs';
import { setActive } from './store.mjs';
import { saveProviderSecret, providerConfigured } from './env.mjs';
import {
  buildConnMenu,
  buildModelMenu,
  buildAgentMenu,
  buildEffortMenu,
  buildPermModeMenu,
  authPrompt,
  switchedText,
  savedKeyText,
  codexLoginGuide,
  modelSwitchedText,
  writeBotPermissionMode,
} from './menu.mjs';
import { setPendingAuth, getPendingAuth, clearPendingAuth } from './auth.mjs';
import { ensureProviderCli, enrichPath } from './ensure-cli.mjs';
import {
  wireProviderAuth,
  startCodexDeviceLogin,
  waitCodexNativeAuth,
  codexLoginStatus,
} from './auth-wire.mjs';
import { botStatePath } from './paths.mjs';
import { updateBotState } from './state-update.mjs';
import { syncExtAuthGate } from './setup-bypass.mjs';
import { hasNativeCodexAuth } from './codex-native.mjs';
import { ensureCodexStableTransport } from './codex-transport.mjs';
import { applyProviderModel, applyProviderEffort } from './apply-model.mjs';
import { loadStore } from './store.mjs';

async function prepareCodexRuntime() {
  try {
    const tr = await ensureCodexStableTransport();
    if (tr.changed) {
      console.error(`${EXT_MARKER} codex transport → ${tr.providerId}`);
    }
  } catch (err) {
    console.error(`${EXT_MARKER} codex transport ensure failed:`, err?.message || err);
  }
}
import {
  hydrateLocalSshHost,
  installLocalSshFetchPatch,
  getLocalSshHost,
  setLocalSshHost,
  setPendingLocalIp,
  getPendingLocalIp,
  clearPendingLocalIp,
  isValidLocalSshHost,
  handleLocalConstructorRequest,
  constructorBaseUrl,
} from './local-ssh.mjs';
import { buildLocalSshMenu, localSshPrompt } from './menu.mjs';

const EXT_MARKER = '[msb/ext]';
let prepared = false;

function ccOnly() {
  return process.env.JARVIS_CC_ONLY === '1';
}

async function readEngine(home = os.homedir()) {
  try {
    const raw = await fs.readFile(botStatePath(process.env, home), 'utf8');
    const st = JSON.parse(raw);
    return st?.engine === 'oc' ? 'oc' : 'cc';
  } catch {
    return 'cc';
  }
}

async function editOrReply(bot, chatId, messageId, text, keyboard) {
  const opts = { parse_mode: 'HTML', reply_markup: keyboard };
  if (messageId) {
    try {
      await bot.api.editMessageText(chatId, messageId, text, opts);
      return;
    } catch {
      /* fall through */
    }
  }
  await bot.api.sendMessage(chatId, text, opts);
}

async function ensureAndReport(bot, chatId, messageId, providerId) {
  const p = getProvider(providerId);
  await editOrReply(
    bot,
    chatId,
    messageId,
    `⏳ Проверяю CLI для ${p?.title || providerId}…`,
    undefined,
  );
  process.env.PATH = enrichPath(process.env);
  const res = await ensureProviderCli(providerId, { env: process.env });
  if (!res.ok) {
    await editOrReply(
      bot,
      chatId,
      messageId,
      `❌ CLI для ${p?.title || providerId} не готов.\n\n${res.error || 'неизвестная ошибка'}\n\nМожно поставить вручную и снова выбрать провайдера в «🔌 Подключение».`,
      undefined,
    );
    return false;
  }
  if (res.installed) {
    await bot.api
      .sendMessage(chatId, `✔ CLI установлен: <code>${res.bin}</code>`, { parse_mode: 'HTML' })
      .catch(() => {});
  }
  return true;
}

/**
 * Codex: native ChatGPT login. Не просим секрет в Telegram.
 * Движок переключаем только после успешной авторизации.
 */
async function connectCodexNative(bot, chatId, messageId) {
  const okCli = await ensureAndReport(bot, chatId, messageId, 'codex');
  if (!okCli) return false;

  if (await hasNativeCodexAuth()) {
    const st = await codexLoginStatus();
    if (st.ok) {
      await prepareCodexRuntime();
      await setActive('codex');
      await syncExtAuthGate();
      const menu = await buildConnMenu();
      await editOrReply(
        bot,
        chatId,
        messageId,
        `${switchedText('codex')}\n\n${menu.text}`,
        menu.keyboard,
      );
      console.error(`${EXT_MARKER} active provider → codex (native auth)`);
      return true;
    }
  }

  await editOrReply(bot, chatId, messageId, '⏳ Запускаю штатный вход Codex (device code)…', undefined);

  const started = startCodexDeviceLogin(process.env);
  if (!started.ok) {
    await editOrReply(
      bot,
      chatId,
      null,
      `❌ Не удалось начать вход Codex.\n${started.error}\n\nДвижок не переключаю.`,
      undefined,
    );
    return false;
  }

  // Дать CLI напечатать URL/код; успех — только появление ~/.codex/auth.json.
  let guideSent = false;
  const guideTimer = setInterval(() => {
    const info = started.extract?.() || {};
    if (!guideSent && (info.url || info.code)) {
      guideSent = true;
      bot.api.sendMessage(chatId, codexLoginGuide(info), { parse_mode: 'HTML' }).catch(() => {});
    }
  }, 1000);
  await new Promise((r) => setTimeout(r, 1500));
  if (!guideSent) {
    guideSent = true;
    await bot.api
      .sendMessage(chatId, codexLoginGuide(started.extract?.() || {}), { parse_mode: 'HTML' })
      .catch(() => {});
  }

  const waited = await waitCodexNativeAuth({ timeoutMs: 300_000 });
  clearInterval(guideTimer);
  try {
    started.child?.kill('SIGTERM');
  } catch {
    /* ignore */
  }

  if (!waited.ok || !(await hasNativeCodexAuth())) {
    await bot.api
      .sendMessage(
        chatId,
        `❌ Вход Codex не подтверждён.\n${waited?.error || 'нет ~/.codex/auth.json'}\n\nДвижок не переключаю.`,
      )
      .catch(() => {});
    return false;
  }

  await prepareCodexRuntime();
  await setActive('codex');
  await syncExtAuthGate();
  const menu = await buildConnMenu();
  await bot.api
    .sendMessage(chatId, `${switchedText('codex')}\n\n${menu.text}`, {
      parse_mode: 'HTML',
      reply_markup: menu.keyboard,
    })
    .catch(() => {});
  console.error(`${EXT_MARKER} active provider → codex (device login ok)`);
  return true;
}

async function showLocalAwareSshHome(bot, chatId, messageId) {
  const host = getLocalSshHost();
  const base = constructorBaseUrl();
  let statusText = '';
  let ok = false;
  try {
    if (host) {
      const res = await handleLocalConstructorRequest(`${base || 'http://local'}/api/ssh/status`, { method: 'GET' });
      const data = await res.json();
      ok = !!data?.ok;
      if (ok) {
        statusText =
          `🖥 Сервер: <code>${data.vps_ip}</code> (локальный режим)\n` +
          `🔑 Ключей: ${data.keys_count}\n` +
          `🌐 Разрешённых IP: ${(data.allowed_ips || []).length}\n`;
        if ((data.allowed_ips || []).length) {
          statusText += '\n<b>Открытые IP:</b>\n';
          for (const ip of data.allowed_ips.slice(0, 10)) statusText += `  • <code>${ip}</code>\n`;
        }
        statusText += `\nПодключение: <code>ssh client@${data.vps_ip}</code>`;
      } else {
        statusText = `⚠️ ${data?.error || 'Не удалось получить локальный статус'}`;
      }
    } else {
      // без локального IP — штатный путь через constructor (может упасть на LAN)
      const syncUrl = process.env.SYNC_URL || process.env.MSB_SYNC_URL || '';
      const syncKey = process.env.SYNC_KEY || process.env.MSB_SYNC_KEY || '';
      if (!syncUrl || !syncKey || !base) {
        statusText = 'Статус SSH в меню не настроен. Сам SSH-доступ этим экраном не проверяется.';
      } else {
        const res = await fetch(`${base}/api/ssh/status`, {
          headers: { Authorization: `Bearer ${syncKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
        });
        const data = await res.json().catch(() => ({}));
        ok = !!data?.ok;
        if (ok) {
          statusText =
            `🖥 Сервер: <code>${data.vps_ip}</code>\n` +
            `🔑 Ключей: ${data.keys_count}\n` +
            `🌐 Разрешённых IP: ${(data.allowed_ips || []).length}\n`;
          if ((data.allowed_ips || []).length) {
            statusText += '\n<b>Открытые IP:</b>\n';
            for (const ip of data.allowed_ips.slice(0, 10)) statusText += `  • <code>${ip}</code>\n`;
          }
          statusText += `\nПодключение: <code>ssh client@${data.vps_ip}</code>`;
        } else {
          statusText =
            `⚠️ ${data?.error || 'Не удалось получить статус'}\n\n` +
            'На внутренней сети конструктор не достучится по внешнему IP. Задай «🖧 Локальный SSH IP».';
        }
      }
    }
  } catch (err) {
    statusText =
      `⚠️ ${String(err?.message || err).slice(0, 200)}\n\n` +
      'Задай «🖧 Локальный SSH IP», если сервер во внутренней сети.';
  }

  const rows = [];
  if (ok) {
    rows.push([{ text: '🔑 Добавить SSH ключ', callback_data: 'settings:ssh:add-key' }]);
    rows.push([{ text: '📋 Показать ключи', callback_data: 'settings:ssh:list-keys' }]);
    rows.push([{ text: '🌐 Открыть IP', callback_data: 'settings:ssh:add-ip' }]);
    rows.push([{ text: '👁 Показать IP', callback_data: 'settings:ssh:list-ips' }]);
  } else {
    rows.push([{ text: '🔄 Обновить', callback_data: 'settings:ssh' }]);
  }
  rows.push([
    {
      text: host ? `🖧 Локальный IP: ${host}` : '🖧 Локальный SSH IP',
      callback_data: 'ext:ssh:local',
    },
  ]);
  rows.push([{ text: '❓ Инструкция', callback_data: 'settings:ssh:help' }]);
  rows.push([{ text: '« Назад', callback_data: 'settings:extras' }]);

  const text = `<b>🔐 SSH доступ к серверу</b>\n\n${statusText}`;
  await editOrReply(bot, chatId, messageId, text, { inline_keyboard: rows });
}

async function handleCallback(bot, cq, closedCore = false) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const userId = cq.from?.id;
  if (!chatId || !userId) return false;

  if (data.startsWith('settings:ssh:')) {
    if (closedCore) return false;
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    await editOrReply(bot, chatId, messageId, 'Управление SSH-ключами и firewall через это меню пока не подключено. Существующий доступ к серверу не меняется.', { inline_keyboard: [[{ text: '« Назад', callback_data: 'settings:ssh' }]] });
    return true;
  }

  // SSH-экран: показываем статус + кнопку локального IP (иначе на LAN всё красное).
  if (data === 'settings:ssh') {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    await showLocalAwareSshHome(bot, chatId, messageId);
    return true;
  }

  if (data === 'ext:ssh:local') {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    clearPendingLocalIp(userId);
    const menu = await buildLocalSshMenu();
    await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
    return true;
  }

  if (data === 'ext:ssh:local:edit') {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    setPendingLocalIp(userId, { chatId, messageId });
    const prompt = localSshPrompt();
    await editOrReply(bot, chatId, messageId, prompt.text, prompt.keyboard);
    return true;
  }

  if (data === 'ext:ssh:local:clear') {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    await setLocalSshHost('');
    const menu = await buildLocalSshMenu();
    await editOrReply(
      bot,
      chatId,
      messageId,
      `✔ Локальный SSH IP сброшен.\n\n${menu.text}`,
      menu.keyboard,
    );
    return true;
  }

  // Разделители в совмещённом меню.
  if (data === 'ext:conn:noop') {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    return true;
  }

  if (closedCore && ['settings:auth:openrouter', 'settings:conn:set:openrouter', 'settings:engine:set:oc', 'settings:engine:set:cc', 'settings:conn:set:cc', 'settings:auth:switch-sub', 'settings:auth:help'].includes(data)) {
    if (data !== 'settings:auth:help' && data !== 'settings:auth:switch-sub') {
      await setActive('claude');
      await syncExtAuthGate();
    }
    return false;
  }

  if (['settings:auth:openrouter', 'settings:conn:set:openrouter', 'settings:engine:set:oc'].includes(data)) {
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    await editOrReply(bot, chatId, messageId,
      'Это подключение в текущем ядре не реализовано. Выбранный движок и сессия сохранены.',
      { inline_keyboard: [[{ text: '« Назад', callback_data: 'settings:conn' }]] });
    return true;
  }
  if (['settings:engine:set:cc', 'settings:conn:set:cc'].includes(data)) {
    if (await providerConfigured(getProvider('claude'))) {
      await updateBotState((state) => {
        if (state.engine !== 'oc') return null;
        state.engine = 'cc';
        return state;
      });
    }
    cq.data = 'ext:conn:set:claude';
    return handleCallback(bot, cq, closedCore);
  }
  if (data === 'settings:auth:help') {
    cq.data = 'setup:help';
    return false;
  }

  // Совмещённый экран: штатные Claude/OpenRouter/OpenClaw + CLI обвязки.
  // На движке OpenClaw штатные «Подключения» не подменяем.
  if (data === 'settings:auth' || data === 'settings:conn' || data === 'ext:conn') {
    if (ccOnly()) return false;
    if ((await readEngine()) === 'oc') return false;
    const menu = await buildConnMenu();
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});
    await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
    return true;
  }

  if (data.startsWith('ext:conn:set:')) {
    const id = data.slice('ext:conn:set:'.length);
    if (!isProviderId(id)) return false;
    if (ccOnly() && id !== 'claude') {
      await bot.api.answerCallbackQuery(cq.id).catch(() => {});
      await editOrReply(bot, chatId, messageId, 'Этот бот зафиксирован на Claude Code (JARVIS_CC_ONLY).', undefined);
      return true;
    }
    const p = getProvider(id);
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});

    if (id === 'codex') {
      const ok = await ensureAndReport(bot, chatId, messageId, id);
      if (!ok) return true;
      const status = await codexLoginStatus();
      if (!status.ok) {
        await editOrReply(bot, chatId, messageId, 'Codex CLI не подтвердил вход. Выбранный движок и сессия сохранены.',
          { inline_keyboard: [[{ text: '🔐 Вход', callback_data: 'ext:auth:codex' }], [{ text: '« Назад', callback_data: 'settings:conn' }]] });
        return true;
      }
      await prepareCodexRuntime();
      await setActive(id);
      await syncExtAuthGate(process.env, os.homedir(), { activateCli: true });
      const menu = await buildConnMenu();
      await editOrReply(bot, chatId, messageId, `${switchedText(id)}\n\n${menu.text}`, menu.keyboard);
      return true;
    }

    if (!(await providerConfigured(p))) {
      if (p.authViaStock) {
        cq.data = 'settings:auth:switch-sub';
        return false;
      }
      const prompt = authPrompt(id);
      setPendingAuth(userId, id, chatId);
      await editOrReply(bot, chatId, messageId, prompt.text, prompt.keyboard);
      return true;
    }
    if (id !== 'claude') {
      const ok = await ensureAndReport(bot, chatId, messageId, id);
      if (!ok) return true;
    }
    await setActive(id);
    await syncExtAuthGate();
    const menu = await buildConnMenu();
    await editOrReply(bot, chatId, messageId, `${switchedText(id)}\n\n${menu.text}`, menu.keyboard);
    console.error(`${EXT_MARKER} active provider → ${id}`);
    return true;
  }

  if (data.startsWith('ext:auth:')) {
    const id = data.slice('ext:auth:'.length);
    if (!isProviderId(id) || getProvider(id)?.authViaStock) return false;
    await bot.api.answerCallbackQuery(cq.id).catch(() => {});

    if (id === 'codex') {
      // Перелогин / первый вход — без запроса секрета в чат.
      await connectCodexNative(bot, chatId, messageId);
      return true;
    }

    const prompt = authPrompt(id);
    setPendingAuth(userId, id, chatId);
    await editOrReply(bot, chatId, messageId, prompt.text, prompt.keyboard);
    return true;
  }

  // «🧠 Агент» / глубина / режим — не показывать Claude, если активен другой провайдер.
  if (
    data === 'menu:agent' ||
    data === 'settings:effort' ||
    data.startsWith('settings:effort:') ||
    data.startsWith('ext:effort:') ||
    data === 'settings:permmode' ||
    data.startsWith('settings:permmode:') ||
    data.startsWith('ext:permmode:')
  ) {
    if (ccOnly()) return false;
    if ((await readEngine()) === 'oc') return false;
    const store = await loadStore();
    if (!store.active || store.active === 'claude') return false;

    await bot.api.answerCallbackQuery(cq.id).catch(() => {});

    if (data === 'menu:agent') {
      const menu = await buildAgentMenu();
      if (!menu) return false;
      await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
      return true;
    }

    if (data === 'settings:effort' || (data.startsWith('settings:effort:') && !data.startsWith('settings:effort:set:'))) {
      const menu = await buildEffortMenu();
      await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
      return true;
    }

    if (data.startsWith('ext:effort:set:') || data.startsWith('settings:effort:set:')) {
      const effort = data.startsWith('ext:effort:set:')
        ? data.slice('ext:effort:set:'.length)
        : data.slice('settings:effort:set:'.length);
      const applied = await applyProviderEffort(store.active, effort);
      const agent = await buildAgentMenu(
        process.env,
        undefined,
        applied.ok ? `✔ Глубина: <b>${effort}</b>.` : `❌ ${applied.error}`,
      );
      await editOrReply(bot, chatId, messageId, agent.text, agent.keyboard);
      return true;
    }

    if (data === 'settings:permmode') {
      const menu = await buildPermModeMenu();
      if (!menu) return false;
      await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
      return true;
    }

    if (data.startsWith('ext:permmode:set:') || data.startsWith('settings:permmode:set:')) {
      const mode = data.startsWith('ext:permmode:set:')
        ? data.slice('ext:permmode:set:'.length)
        : data.slice('settings:permmode:set:'.length);
      const allowed = ['auto', 'smart', 'control', 'plan'];
      const next = allowed.includes(mode) ? mode : 'auto';
      await writeBotPermissionMode(next);
      const notice = store.active === 'codex' ? `✔ Настройка режима сохранена: <b>${next}</b>. Права Codex не менялись.` : `✔ Режим: <b>${next}</b>.`;
      const agent = await buildAgentMenu(process.env, undefined, notice);
      await editOrReply(bot, chatId, messageId, agent.text, agent.keyboard);
      return true;
    }

    return false;
  }

  // «🧠 Модель»: для Cursor/Codex/Qwen — свой список, не Claude Opus/Sonnet.
  if (data === 'settings:model' || data.startsWith('settings:model:') || data.startsWith('ext:model:')) {
    if (ccOnly()) return false;
    if ((await readEngine()) === 'oc') return false;
    const store = await loadStore();
    if (!store.active || store.active === 'claude') return false;

    await bot.api.answerCallbackQuery(cq.id).catch(() => {});

    const isSet = data.startsWith('ext:model:set:') || data.startsWith('settings:model:set:');
    if (!isSet) {
      // Любой экран версий/каталога Claude → наш список моделей провайдера.
      const menu = await buildModelMenu();
      if (!menu) return false;
      await editOrReply(bot, chatId, messageId, menu.text, menu.keyboard);
      return true;
    }

    const modelId = data.startsWith('ext:model:set:')
      ? data.slice('ext:model:set:'.length)
      : data.slice('settings:model:set:'.length);
    // Не даём штатным алиасам Claude (opus/sonnet/…) записаться как модель Codex/Cursor.
    if (/^(opus|sonnet|haiku|fable)\b/i.test(modelId)) {
      const menu = await buildModelMenu();
      await editOrReply(
        bot,
        chatId,
        messageId,
        `Это модель Claude, а сейчас активен другой провайдер.\n\n${menu.text}`,
        menu.keyboard,
      );
      return true;
    }

    const applied = await applyProviderModel(store.active, modelId);
    const menu = await buildModelMenu();
    if (!applied.ok) {
      await editOrReply(
        bot,
        chatId,
        messageId,
        `❌ Не сменил модель: ${applied.error}\n\n${menu?.text || ''}`,
        menu?.keyboard,
      );
      return true;
    }
    await editOrReply(
      bot,
      chatId,
      messageId,
      `${modelSwitchedText(store.active, modelId)}\n\n${menu.text}`,
      menu.keyboard,
    );
    console.error(`${EXT_MARKER} model → ${store.active}:${modelId}`);
    return true;
  }

  return false;
}

async function handleLocalSshIpMessage(bot, msg) {
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  if (!userId || !chatId) return false;
  const pending = getPendingLocalIp(userId);
  if (!pending) return false;

  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) {
    clearPendingLocalIp(userId);
    return false;
  }

  clearPendingLocalIp(userId);
  if (!isValidLocalSshHost(text)) {
    await bot.api.sendMessage(
      chatId,
      `Не похоже на IPv4/hostname. Пример: <code>${profile.resolveProfile().lanExample}</code>`,
      { parse_mode: 'HTML' },
    );
    return true;
  }

  try {
    await setLocalSshHost(text);
    await bot.api.deleteMessage(chatId, msg.message_id).catch(() => {});
    const menu = await buildLocalSshMenu();
    await bot.api.sendMessage(
      chatId,
      `✔ Локальный SSH IP: <code>${text}</code>\n\n${menu.text}`,
      { parse_mode: 'HTML', reply_markup: menu.keyboard },
    );
    console.error(`${EXT_MARKER} MSB_LOCAL_SSH_HOST → ${text}`);
  } catch (err) {
    await bot.api.sendMessage(chatId, `❌ ${String(err.message || err).slice(0, 200)}`);
  }
  return true;
}

async function handleAuthMessage(bot, msg) {
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  if (!userId || !chatId) return false;

  if (await handleLocalSshIpMessage(bot, msg)) return true;

  const pending = getPendingAuth(userId);
  if (!pending) return false;

  // Codex не принимает секрет из Telegram — сбрасываем pending, если вдруг остался.
  if (pending.providerId === 'codex') {
    clearPendingAuth(userId);
    await bot.api
      .sendMessage(
        chatId,
        'Для Codex секрет в чат не нужен. Открой «🔌 Подключение» → Codex → «Войти» (ChatGPT device code).',
      )
      .catch(() => {});
    return true;
  }

  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) {
    clearPendingAuth(userId);
    return false;
  }

  try {
    await saveProviderSecret(pending.providerId, text);
    clearPendingAuth(userId);
    await bot.api.deleteMessage(chatId, msg.message_id).catch(() => {});

    await bot.api.sendMessage(chatId, '⏳ Сохранил ключ. Ставлю/проверяю CLI и авторизацию…').catch(() => {});
    process.env.PATH = enrichPath(process.env);
    const cli = await ensureProviderCli(pending.providerId, { env: process.env });
    if (!cli.ok) {
      await bot.api.sendMessage(
        chatId,
        `✔ Ключ сохранён, но CLI не готов:\n${cli.error}\n\nПоставь CLI и снова выбери провайдера в «🔌 Подключение».`,
      );
      return true;
    }

    const wired = await wireProviderAuth(pending.providerId, text, process.env);
    if (!wired?.ok) {
      await bot.api.sendMessage(
        chatId,
        `❌ Авторизация ${pending.providerId} не удалась.\n${wired?.error || 'unknown'}\n\nДвижок не переключаю.`,
      );
      console.error(`${EXT_MARKER} auth wire failed:`, wired?.error);
      return true;
    }
    if (wired?.warn) {
      console.error(`${EXT_MARKER} auth wire warn:`, wired.warn);
    }

    await setActive(pending.providerId);
    await syncExtAuthGate();
    const menu = await buildConnMenu();
    const extra = cli.installed ? `\nCLI: <code>${cli.bin}</code>` : '';
    await bot.api.sendMessage(
      chatId,
      `${savedKeyText(pending.providerId)}${extra}\n\n${menu.text}`,
      { parse_mode: 'HTML', reply_markup: menu.keyboard },
    );
    console.error(`${EXT_MARKER} saved+wired ${pending.providerId}`);
  } catch (err) {
    clearPendingAuth(userId);
    await bot.api.sendMessage(chatId, `❌ Не сохранил ключ: ${String(err.message || err).slice(0, 200)}`);
  }
  return true;
}

/**
 * Патчит Bot.prototype до загрузки бандла.
 * @returns {Promise<void>}
 */
export async function prepare() {
  if (prepared) return;
  prepared = true;

  process.env.PATH = enrichPath(process.env);

  try {
    await hydrateLocalSshHost();
    installLocalSshFetchPatch();
  } catch (err) {
    console.error(`${EXT_MARKER} local-ssh boot:`, err?.message || err);
  }

  try {
    await syncExtAuthGate();
  } catch (err) {
    console.error(`${EXT_MARKER} setup-bypass boot:`, err?.message || err);
  }

  installUpdateHook(Bot);

  console.error(`${EXT_MARKER} Bot.prototype.handleUpdate patched (ESM Bot)`);
}


export function installUpdateHook(BotClass, env = process.env) {
  registerEngineProviderView(BotClass, env);
  const ownerId = Number(env.ADMIN_ID || env.OWNER_USER_ID || '0');
  const closedCore = env.MSB_USE_CLOSED_CORE === '1';
  const origHandleUpdate = BotClass.prototype.handleUpdate;
  BotClass.prototype.handleUpdate = async function handleUpdateExt(update, webhookReplyEnvelope) {
    const event = update?.callback_query || update?.message;
    if (!Number.isFinite(ownerId) || ownerId <= 0 || Number(event?.from?.id) !== ownerId) {
      return origHandleUpdate.call(this, update, webhookReplyEnvelope);
    }
    try {
      if (update?.callback_query) {
        const startsForm = ['settings:auth:switch-sub', 'setup:subscription', 'settings:env:add', 'settings:tz', 'menu:newproject', 'mon:add-hint', 'settings:bots:add', 'ext:ssh:local:edit'].includes(event.data) || /^(?:settings:env:quick:|ext:auth:|ext:conn:set:|settings:conn:set:|settings:engine:set:)/.test(event.data || '');
        if (startsForm || ['menu:back', 'menu:close', 'menu:settings', 'menu:agent', 'settings:back', 'settings:auth', 'settings:conn', 'ext:conn', 'ext:ssh:local', 'mon:back', 'settings:bots:cancel'].includes(event.data)) {
          clearPendingAuth(event.from.id);
          clearPendingLocalIp(event.from.id);
          this[Symbol.for('msb.cancelPendingInput')]?.(event.message?.chat?.id);
        }
        const handled = await handleCallback(this, event, closedCore);
        if (handled) return;
      }
      if (update?.message?.text) {
        const handled = await handleAuthMessage(this, event);
        if (handled) return;
      }
    } catch (err) {
      console.error(`${EXT_MARKER} handleUpdate error:`, err?.message || err);
    }
    return origHandleUpdate.call(this, update, webhookReplyEnvelope);
  };
}
