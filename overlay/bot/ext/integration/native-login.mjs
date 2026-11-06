/**
 * Проверка CLI и прежний native login Codex.
 * Навигация: [Обвязка](../README.md).
 */
import { getProvider } from '../providers.mjs';
import { setActive } from '../store.mjs';
import { buildConnMenu, switchedText, codexLoginGuide } from '../menu.mjs';
import { ensureProviderCli, enrichPath } from '../ensure-cli.mjs';
import { startCodexDeviceLogin, waitCodexNativeAuth, codexLoginStatus } from '../auth-wire.mjs';
import { syncExtAuthGate } from '../setup-bypass.mjs';
import { hasNativeCodexAuth } from '../codex-native.mjs';
import { ensureCodexStableTransport } from '../codex-transport.mjs';
import { editOrReply } from './shared.mjs';
import { EXT_MARKER } from './shared.mjs';

export async function prepareCodexRuntime() {
  try {
    const tr = await ensureCodexStableTransport();
    if (tr.changed) {
      console.error(`${EXT_MARKER} codex transport → ${tr.providerId}`);
    }
  } catch (err) {
    console.error(`${EXT_MARKER} codex transport ensure failed:`, err?.message || err);
  }
}

export async function ensureAndReport(bot, chatId, messageId, providerId) {
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

export async function connectCodexNative(bot, chatId, messageId) {
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
