/**
 * Роутер callback_query — те же callback_data, что в закрытом ядре.
 */
import { spawn } from 'node:child_process';
import { InlineKeyboard } from 'grammy';
import { loadState, updateState } from '../state.mjs';
import { editOrReply, escapeHtml } from './edit.mjs';
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
  pultListenScreen,
  pultScreen,
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
import {
  engineStatusSnapshot,
  submitRequest,
  waitRequestResult,
} from '../engines/client.mjs';
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

  const show = async (view) => editOrReply(bot.api, chatId, msgId, view.text, view.keyboard);
  const { state } = await loadState();

  // —— menu ——
  if (data === 'menu:back' || data === 'menu:close') return show(hubScreen());
  if (data === 'menu:settings' || data === 'settings:back') return show(settingsScreen(state));
  if (data === 'menu:agent') return show(await agentScreen(state));
  if (data === 'menu:autonomy' || data === 'auto:home') return show(await autonomyHomeScreen());
  if (data === 'menu:mcp') return show(mcpScreen());
  if (data === 'menu:skills') return show(skillsScreen());
  if (data === 'menu:sessions') return show(sessionsScreen());
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

  // —— Пульт ——
  if (data === 'pult:refresh') {
    try {
      const { buildPultCommandKeyboard } = await import('../pult/client.mjs');
      return show(await buildPultCommandKeyboard());
    } catch (err) {
      return show({
        text: `<b>🖥 Пульт</b>\n\nНе удалось обновить кнопки: ${escapeHtml(err.message)}`,
        keyboard: new InlineKeyboard().text('🔄 Ещё раз', 'pult:refresh'),
      });
    }
  }

  if (data.startsWith('settings:pult')) {
    const { readPultSecrets, pultPublicUrl, pultListenHost } = await import('../pult/client.mjs');
    const { readEnvMap } = await import('../env/store.mjs');
    const loadPultCfg = async () => {
      const secrets = await readPultSecrets();
      const { map } = await readEnvMap();
      const password = map.get('PULT_PASSWORD') || secrets.web.get('PULT_PASSWORD') || '';
      const tgToken = map.get('PULT_TG_TOKEN') || secrets.web.get('PULT_TG_TOKEN') || '';
      const sessionHours = map.get('PULT_SESSION_HOURS') || secrets.web.get('PULT_SESSION_HOURS') || '4';
      return {
        password,
        host: map.get('PULT_HOST') || pultListenHost(secrets),
        tgToken,
        publicUrl: map.get('PULT_PUBLIC_URL') || pultPublicUrl(secrets),
        sessionHours,
      };
    };
    const showPult = async (note = '') => {
      const snap = await engineStatusSnapshot();
      return show(pultScreen(snap.pult, await loadPultCfg(), note));
    };
    const reloadIfNeeded = async () => {
      try {
        const { id } = await submitRequest('reload-pult', {
          bot_id: process.env.MSB_BOT_ID || 'default',
        });
        const result = await waitRequestResult(id, { timeoutMs: 90_000 });
        return result?.code === 'OK'
          ? 'настройки применены'
          : `reload: <code>${escapeHtml(result?.code || 'нет ответа')}</code>`;
      } catch (err) {
        return `reload: ${escapeHtml(err.message)}`;
      }
    };

    if (data === 'settings:pult') return showPult();
    if (data === 'settings:pult:on' || data === 'settings:pult:off') {
      const action = data === 'settings:pult:on' ? 'enable-pult' : 'disable-pult';
      try {
        const { id } = await submitRequest(action, {
          bot_id: process.env.MSB_BOT_ID || 'default',
        });
        const result = await waitRequestResult(id, { timeoutMs: 90_000 });
        const note = result
          ? `${action}: <code>${escapeHtml(result.code)}</code>${
              result.detail?.hint ? `\n${escapeHtml(String(result.detail.hint))}` : ''
            }${result.detail?.reason ? ` (${escapeHtml(String(result.detail.reason))})` : ''}`
          : `⚠️ ${action}: нет ответа helper`;
        return showPult(note);
      } catch (err) {
        return showPult(`${action} ошибка: ${escapeHtml(err.message)}`);
      }
    }
    if (data === 'settings:pult:password') {
      pending.set(chatId, 'pult-password');
      return show({
        text: `<b>🔑 Пароль Пульта</b>\n\nПришли пароль (≥12 символов). Сохраню в .env бота и перезапущу службы, если Пульт включён.`,
        keyboard: new InlineKeyboard().text('« Назад', 'settings:pult'),
      });
    }
    if (data === 'settings:pult:tg-token') {
      pending.set(chatId, 'pult-tg-token');
      return show({
        text: `<b>🤖 Бот тревог Пульта</b>\n\nНеобязателен: панель открывается через <code>/pult</code> из любого MSB-бота.\nТокен нужен только для тревог и сводки 08:00.\n\nПришли токен от @BotFather или <code>-</code>, чтобы сбросить.`,
        keyboard: new InlineKeyboard().text('« Назад', 'settings:pult'),
      });
    }
    if (data === 'settings:pult:url') {
      pending.set(chatId, 'pult-url');
      return show({
        text: `<b>🔗 Публичный URL Пульта</b>\n\nАдрес, который попадает в кнопки /pult и Mini App.\nПример: <code>https://pult.example.com</code> или <code>http://192.168.1.10:8791</code>`,
        keyboard: new InlineKeyboard().text('« Назад', 'settings:pult'),
      });
    }
    if (data === 'settings:pult:session') {
      pending.set(chatId, 'pult-session');
      return show({
        text: `<b>⏱ Сессия браузера</b>\n\nСколько часов жить cookie после входа (пароль, Mini App или одноразовая ссылка).\nПо умолчанию <b>4</b>. Допустимо 1…720.\n\nПришли число часов.`,
        keyboard: new InlineKeyboard()
          .text('4 ч', 'settings:pult:session:set:4')
          .text('12 ч', 'settings:pult:session:set:12')
          .text('24 ч', 'settings:pult:session:set:24')
          .row()
          .text('« Назад', 'settings:pult'),
      });
    }
    if (data.startsWith('settings:pult:session:set:')) {
      const hours = data.slice('settings:pult:session:set:'.length);
      const { setEnvKey } = await import('../env/store.mjs');
      await setEnvKey('PULT_SESSION_HOURS', hours);
      const note = await reloadIfNeeded();
      return showPult(`Сессия: <b>${escapeHtml(hours)} ч</b>\n${note}`);
    }
    if (data === 'settings:pult:listen') {
      const cfg = await loadPultCfg();
      return show(pultListenScreen(cfg.host));
    }
    if (data === 'settings:pult:listen:custom') {
      pending.set(chatId, 'pult-listen');
      return show({
        text: `<b>✏️ Свой IP прослушивания</b>\n\nПришли IPv4 (например <code>192.168.1.10</code>).`,
        keyboard: new InlineKeyboard().text('« Назад', 'settings:pult:listen'),
      });
    }
    if (data.startsWith('settings:pult:listen:set:')) {
      const host = data.slice('settings:pult:listen:set:'.length);
      const { setEnvKey } = await import('../env/store.mjs');
      await setEnvKey('PULT_HOST', host);
      const note = await reloadIfNeeded();
      return showPult(`Слушает: <code>${escapeHtml(host)}</code>\n${note}`);
    }
  }
  if (data === 'settings:restart') return show(restartConfirmScreen());
  if (data === 'settings:restart:do') {
    await bot.api.sendMessage(chatId, 'Перезапускаюсь…');
    setTimeout(() => restartSelf(), 400);
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
  if (data === 'eng:home' || data === 'eng:add' || data === 'eng:mig') {
    const snap = await engineStatusSnapshot();
    if ((process.env.MSB_CC_ONLY || process.env.JARVIS_CC_ONLY) === '1' && data !== 'eng:home') {
      return show({ text: CC_BLOCK(), keyboard: enginesScreen(state, snap).keyboard });
    }
    return show(enginesScreen(state, snap));
  }
  if (data === 'eng:status') {
    try {
      const { id } = await submitRequest('status', {
        bot_id: process.env.MSB_BOT_ID || 'default',
      });
      const result = await waitRequestResult(id, { timeoutMs: 20_000 });
      const snap = await engineStatusSnapshot();
      const note = result
        ? `\n\nЗаявка <code>${result.code}</code> (${result.result})`
        : '\n\n⚠️ Нет ответа helper за 20с';
      const screen = enginesScreen(state, snap);
      return show({ text: screen.text + note, keyboard: screen.keyboard });
    } catch (err) {
      return show({
        text: `Не удалось связаться с msb-engine: ${err.message}`,
        keyboard: enginesScreen(state).keyboard,
      });
    }
  }
  if (data === 'eng:oc:on' || data === 'eng:oc:off') {
    const action = data === 'eng:oc:on' ? 'enable-openclaw' : 'disable-openclaw';
    try {
      const { id } = await submitRequest(action, {
        bot_id: process.env.MSB_BOT_ID || 'default',
      });
      const result = await waitRequestResult(id, { timeoutMs: 60_000 });
      const snap = await engineStatusSnapshot();
      const screen = enginesScreen(state, snap);
      const note = result
        ? `\n\n${action}: <code>${result.code}</code>`
        : `\n\n⚠️ ${action}: нет ответа`;
      return show({ text: screen.text + note, keyboard: screen.keyboard });
    } catch (err) {
      return show({
        text: `${action} ошибка: ${err.message}`,
        keyboard: enginesScreen(state).keyboard,
      });
    }
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
    await bot.api.sendMessage(chatId, `Принято: ${data}`);
    return;
  }

  // неизвестный callback — не молчим в лог
  console.error(`[msb/bot] unhandled callback: ${data}`);
}

function CC_BLOCK() {
  return `Этот бот работает только с 👾 Claude Code.
OpenClaw ставится отдельно: /settings → ⚙️ Движки → ➕ OpenClaw.`;
}

function restartSelf() {
  try {
    spawn('sudo', ['bot-ctl.sh', 'restart', process.env.MSB_BOT_ID || 'default'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    process.exit(0);
  }
}
