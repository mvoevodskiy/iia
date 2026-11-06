import { handleNativeEngineCallback } from '../engines/telegram.mjs';
/**
 * Роутер callback_query — те же callback_data, что в закрытом ядре.
 */
import { spawn } from 'node:child_process';
import { InlineKeyboard } from 'grammy';
import { loadState, updateState } from '../state.mjs';
import { editOrReply } from './edit.mjs';
import {
  agentScreen,
  autonomyHistoryScreen,
  autonomyHomeScreen,
  autonomyRightsScreen,
  autonomyTasksScreen,
  autonomyTimersScreen,
  autonomyWhatScreen,
  botDetailScreen,
  botsScreen,
  connScreen,
  effortScreen,
  enginesScreen,
  envScreen,
  extrasScreen,
  hubScreen,
  limitScreen,
  mcpAddScreen,
  mcpScreen,
  mcpWorkspaceScreen,
  modelScreen,
  monitorDigestScreen,
  monitorHelpScreen,
  monitorScreen,
  monitorSettingsScreen,
  monitorSourcesScreen,
  notificationsScreen,
  permModeScreen,
  placeholder,
  projectsScreen,
  restartConfirmScreen,
  serverStatusScreen,
  sessionsScreen,
  settingsScreen,
  setupScreen,
  skillsScreen,
  sshUnavailableScreen,
  sttScreen,
  tzScreen,
  updatesScreen,
} from './screens.mjs';
import { applyEffort, applyModelFamily, applyPermMode } from './actions.mjs';
import { removeSource } from '../monitor/config.mjs';
import { pollAllSources } from '../monitor/poll.mjs';
import { buildDigestText, updateDigestSettings } from '../monitor/digest.mjs';
import { removeBot } from '../bots/manage.mjs';
import { deleteEnvKey } from '../env/store.mjs';

/**
 * @param {object} opts
 * @param {import('grammy').Bot} opts.bot
 * @param {object} opts.cfg
 * @param {Map<number, string>} opts.pending
 */
export async function handleCallback({ bot, cfg, pending, ctx }) {
  const data = ctx.callbackQuery.data || '';
  const chatId = ctx.chat?.id;
  const msgId = ctx.callbackQuery.message?.message_id;
  await ctx.answerCallbackQuery().catch(() => {});
  if (!chatId) return;
  if (['menu:back', 'menu:close', 'menu:agent', 'menu:settings', 'settings:back', 'mon:back', 'settings:bots:cancel'].includes(data)) pending.delete(chatId);

  const show = async (view) => editOrReply(bot.api, chatId, msgId, view.text, view.keyboard);
  const { state } = await loadState();
  const engineMenu = async (snapshot) => enginesScreen(state, snapshot,
    await bot[Symbol.for('msb.engineProviderView')]?.(state));

  if (data === 'whisper:skip') return show({ text: 'Когда захочешь — отправь голосовое снова.\nИли подключи Deepgram в /settings → 🔑' });

  // —— menu ——
  if (data === 'menu:back' || data === 'menu:close') return show(hubScreen());
  if (data === 'menu:settings' || data === 'settings:back') return show(settingsScreen(state));
  if (data === 'menu:agent') return show(await agentScreen(state));
  if (data === 'menu:autonomy' || data === 'auto:home') return show(await autonomyHomeScreen());
  if (data === 'menu:mcp') return show(mcpScreen());
  if (data === 'menu:skills') return show(skillsScreen());
  if (data === 'menu:sessions') return show(await sessionsScreen(state));
  if (data === 'menu:projects') return show(projectsScreen());
  if (data === 'menu:newproject') {
    pending.set(chatId, 'new-project');
    return show({
      text: 'Пришли имя нового проекта (латиница/цифры/-_). Создам папку в ~/projects/.',
      keyboard: projectsScreen().keyboard,
    });
  }
  if (data === 'menu:newtask') {
    await updateState((s) => {
      delete s.ccSessionId;
      s.sessionEpoch = (s.sessionEpoch || 0) + 1;
      return s;
    });
    await bot.api.sendMessage(chatId, 'Новая сессия. Пиши задачу.');
    return show(hubScreen());
  }

  // —— agent / model ——
  if (data === 'settings:model') return show(modelScreen());
  if (data === 'settings:effort') return show(effortScreen());
  if (data === 'settings:permmode') return show(permModeScreen());
  if (data === 'settings:conn' || data === 'settings:auth') return show(await connScreen(state));
  if (data === 'settings:conn:noop') return;
  if (data === 'settings:conn:set:cc' || data === 'settings:engine:set:cc') {
    await updateState((s) => {
      s.engine = 'cc';
      return s;
    });
    return show(await agentScreen((await loadState()).state));
  }
  if (data === 'settings:auth:switch-sub' || data === 'setup:subscription') {
    pending.set(chatId, 'auth-token');
    return show({
      text: 'Пришли следующим сообщением токен Claude (<code>claude setup-token</code>) или ключ <code>sk-ant-…</code>.\nОтмена: /start',
      keyboard: (await connScreen(state)).keyboard,
    });
  }
  if (data.startsWith('settings:model:set:')) {
    const family = data.split(':').pop();
    const model = await applyModelFamily(family);
    if (model) await bot.api.sendMessage(chatId, `Модель: <code>${model}</code>`, { parse_mode: 'HTML' });
    return show(await agentScreen((await loadState()).state));
  }
  if (data === 'settings:model:fable:ask' || data.startsWith('settings:model:fable')) {
    await applyModelFamily('fable');
    await bot.api.sendMessage(
      chatId,
      'Fable включена. На Pro она может тратить usage credits сверх подписки.',
    );
    return show(await agentScreen((await loadState()).state));
  }
  if (data === 'settings:model:ver') {
    return show(placeholder('📌 Версии', 'settings:model'));
  }
  if (data.startsWith('settings:effort:set:')) {
    await applyEffort(data.split(':').pop());
    return show(await agentScreen((await loadState()).state));
  }
  if (data.startsWith('settings:permmode:set:')) {
    await applyPermMode(data.slice('settings:permmode:set:'.length));
    return show(await agentScreen((await loadState()).state));
  }

  // —— settings tree ——
  if (data === 'settings:extras') return show(extrasScreen());
  if (data === 'settings:restart') return show(restartConfirmScreen());
  if (data === 'settings:restart:do') {
    await bot.api.sendMessage(chatId, 'Запускаю перезапуск бота…');
    setTimeout(() => restartSelf(() => bot.api.sendMessage(chatId, 'Не удалось запустить перезапуск. Служба осталась в прежнем состоянии.').catch(() => {})), 400);
    return;
  }
  if (data === 'settings:ssh') return show(sshUnavailableScreen());
  if (data === 'settings:updates') return show(await updatesScreen());
  if (data === 'settings:bots' || data === 'settings:bots:refresh') return show(await botsScreen());
  if (data === 'settings:bots:add') {
    pending.set(chatId, 'bot-token');
    return show({
      text: `👾 <b>Новый бот</b>\n\nПришли токен от @BotFather (<code>1234567890:ABC…</code>).\nЯ сам поставлю юнит через <code>sudo bot-ctl.sh add</code>.`,
      keyboard: (await botsScreen()).keyboard,
    });
  }
  if (data === 'settings:bots:cancel') {
    pending.delete(chatId);
    return show(await botsScreen());
  }
  if (data.startsWith('settings:bots:bot:')) {
    return show(await botDetailScreen(data.slice('settings:bots:bot:'.length)));
  }
  if (data.startsWith('settings:bots:delete-confirm:')) {
    const id = data.slice('settings:bots:delete-confirm:'.length);
    const res = await removeBot(id);
    await bot.api.sendMessage(chatId, res.ok ? `✔ Удалён <b>${id}</b>` : `Не удалось: ${res.error}`, {
      parse_mode: 'HTML',
    });
    return show(await botsScreen());
  }
  if (data.startsWith('settings:bots:delete:')) {
    const id = data.slice('settings:bots:delete:'.length);
    return show({
      text: `🗑 <b>Удалить ${id}?</b>\n\nПереписки и настройки сотрутся. Бот в Telegram останется.`,
      keyboard: new InlineKeyboard()
        .text(`Да, удалить ${id}`, `settings:bots:delete-confirm:${id}`)
        .row()
        .text('✖ Отмена', `settings:bots:bot:${id}`),
    });
  }
  if (data === 'settings:env') return show(await envScreen());
  if (data === 'settings:env:add') {
    pending.set(chatId, 'env-key-name');
    return show({
      text: 'Пришли имя ключа (например <code>MY_API_KEY</code>).',
      keyboard: (await envScreen()).keyboard,
    });
  }
  if (data.startsWith('settings:env:quick:')) {
    const key = data.slice('settings:env:quick:'.length);
    pending.set(chatId, `env:${key}`);
    return show({
      text: `Пришли значение для <code>${key}</code>.`,
      keyboard: (await envScreen()).keyboard,
    });
  }
  if (data.startsWith('settings:env:delete:')) {
    const key = data.slice('settings:env:delete:'.length);
    try {
      await deleteEnvKey(key);
      await bot.api.sendMessage(chatId, `Удалил <code>${key}</code>.`, { parse_mode: 'HTML' });
    } catch (err) {
      await bot.api.sendMessage(chatId, err.message);
    }
    return show(await envScreen());
  }
  if (data.startsWith('settings:env:confirm-delete:')) {
    return show(await envScreen());
  }
  if (data === 'settings:tz') {
    pending.set(chatId, 'timezone');
    return show(tzScreen(state));
  }
  if (data === 'settings:limit') return show(limitScreen(state));
  if (data.startsWith('settings:limit:set:')) {
    const n = Number(data.split(':').pop());
    await updateState((s) => {
      s.dailySpendLimit = Number.isFinite(n) ? n : 0;
      if (n === 0) s.costPaused = false;
      return s;
    });
    return show(limitScreen((await loadState()).state));
  }
  if (data === 'settings:server-status') return show(serverStatusScreen(cfg));
  if (data === 'settings:stt') return show(sttScreen());
  if (data === 'nm:list') return show(notificationsScreen());
  if (process.env.MSB_OS_ENGINE === 'native' && await handleNativeEngineCallback({
    data, state, show, providerView: () => bot[Symbol.for('msb.engineProviderView')]?.(state),
  })) return;
  if (data === 'eng:home' || data === 'eng:add' || data === 'eng:mig') {
    if (process.env.JARVIS_CC_ONLY === '1' && data !== 'eng:home') {
      return show({ text: CC_BLOCK(), keyboard: (await engineMenu()).keyboard });
    }
    return show(await engineMenu());
  }

  // —— autonomy ——
  if (data === 'auto:what') return show(autonomyWhatScreen());
  if (data === 'auto:tasks') return show(await autonomyTasksScreen());
  if (data === 'auto:timers') return show(autonomyTimersScreen());
  if (data === 'auto:history') return show(autonomyHistoryScreen());
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

  // —— monitor ——
  if (data === 'mon:back' || data === 'auto:monitor') return show(await monitorScreen(data === 'auto:monitor' ? 'auto:home' : 'menu:back'));
  if (data === 'mon:sources') return show(await monitorSourcesScreen());
  if (data === 'mon:digest') return show(await monitorDigestScreen());
  if (data === 'mon:help') return show(monitorHelpScreen());
  if (data === 'mon:settings') return show(monitorSettingsScreen());
  if (data === 'mon:add-hint') {
    pending.set(chatId, 'mon-source');
    return show({
      text: 'Пришли ссылку или @ник источника (YouTube, X, GitHub, Telegram, RSS).',
      keyboard: (await monitorSourcesScreen()).keyboard,
    });
  }
  if (data.startsWith('mon:src-del:')) {
    const rest = data.slice('mon:src-del:'.length);
    const i = rest.indexOf(':');
    const type = rest.slice(0, i);
    const id = decodeURIComponent(rest.slice(i + 1));
    await removeSource(type, id);
    return show(await monitorSourcesScreen());
  }
  if (data === 'mon:digest-toggle') {
    const { loadMonitorConfig } = await import('../monitor/config.mjs');
    const cfg = await loadMonitorConfig();
    await updateDigestSettings({ enabled: !(cfg.digest?.enabled !== false) });
    return show(await monitorDigestScreen());
  }
  if (data.startsWith('mon:digest:time:set:')) {
    await updateDigestSettings({ hour: Number(data.split(':').pop()) });
    return show(await monitorDigestScreen());
  }
  if (data.startsWith('mon:digest:count:set:')) {
    await updateDigestSettings({ topN: Number(data.split(':').pop()) });
    return show(await monitorDigestScreen());
  }
  if (data === 'digest:now') {
    const dig = await buildDigestText();
    await bot.api.sendMessage(chatId, dig.text, { parse_mode: 'HTML' });
    return show(await monitorDigestScreen());
  }
  if (data === 'mon:poll:all') {
    await bot.api.sendMessage(chatId, '⏳ Собираю источники…');
    const res = await pollAllSources();
    await bot.api.sendMessage(
      chatId,
      `Готово: новых ${res.added}, ошибок ${res.errors.length}.`,
    );
    return show(await monitorScreen());
  }
  if (data.startsWith('mon:storage:set:')) {
    const { loadMonitorConfig, saveMonitorConfig } = await import('../monitor/config.mjs');
    const cfg = await loadMonitorConfig();
    cfg.storage = data.split(':').pop();
    await saveMonitorConfig(cfg);
    return show(monitorSettingsScreen());
  }
  if (
    data.startsWith('mon:storage') ||
    data.startsWith('mon:model') ||
    data.startsWith('mon:notif') ||
    data.startsWith('mon:reportstyle') ||
    data.startsWith('mon:collection') ||
    data.startsWith('mon:balance') ||
    data === 'mon:scored' ||
    data === 'mon:feed' ||
    data === 'mon:search' ||
    data === 'mon:incident'
  ) {
    return show(placeholder('Мониторинг', 'mon:settings'));
  }

  // —— mcp ——
  if (data === 'mcp:folder:workspace') return show(mcpWorkspaceScreen());
  if (data === 'mcp:add') return show(mcpAddScreen());
  if (data.startsWith('mcp:setup:') || data.startsWith('mcp:server:') || data.startsWith('mcp:')) {
    return show(placeholder('MCP', 'menu:mcp'));
  }

  // —— setup ——
  if (data === 'setup:help') {
    return show({
      text: 'На машине выполни <code>claude setup-token</code>, скопируй токен и пришли его боту.',
      keyboard: setupScreen().keyboard,
    });
  }
  if (data.startsWith('setup:')) return show(setupScreen());

  // —— plan / misc ——
  if (data.startsWith('plan:')) {
    await bot.api.sendMessage(chatId, `Получено: ${data}. Обработчик подтверждения в open-core пока не подключён.`);
    return;
  }

  // неизвестный callback — не молчим в лог
  console.error(`[msb/bot] unhandled callback: ${data}`);
}

function CC_BLOCK() {
  return `Этот бот работает только с 👾 Claude Code.
Управление OpenClaw через это меню пока не подключено.`;
}

function restartSelf(onError) {
  try {
    const child = spawn('sudo', ['-n', 'bot-ctl.sh', 'restart', process.env.MSB_BOT_ID || 'default'], {
      detached: true, stdio: 'ignore',
    });
    child.once('error', onError);
    child.once('exit', (code) => { if (code) onError(); });
    child.unref();
  } catch { onError(); }
}
