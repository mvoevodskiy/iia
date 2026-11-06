/**
 * Сборка handlers, общих pending/running и жизненного цикла хода.
 * Навигация: [Telegram](./README.md) → [callbacks](./router.mjs), [voice](./voice.mjs).
 */
import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { presentationAwareRetry, presentationSignal } from './presentation-api.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { recognizeVoice, voicePreview, STT_ONBOARDING } from './voice.mjs';
import { startTurnProgress } from './progress.mjs';
import { deliverTurnResponse } from './response.mjs';
import { beginTurnHistory } from './history.mjs';
import { runAgentTurn } from '../agent/turn.mjs';
import { hasClaudeAuth, loadState, updateState } from '../state.mjs';
import { addTask, tryParseScheduleMessage } from '../autonomy/store.mjs';
import { botRoot, ensureDir, workspaceDir } from '../paths.mjs';
import { adminGuard, isSetupMode } from './auth.mjs';
import { HELP_CC, HELP_OC, commandsForEngine } from './commands.mjs';
import { handleCallback } from './router.mjs';
import { hubScreen, monitorScreen, setupScreen, settingsScreen } from './screens.mjs';

/**
 * @param {ReturnType<import('../config.mjs').readConfig>} cfg
 */
export function createBot(cfg, { bot = new Bot(cfg.botToken), runTurn = runAgentTurn } = {}) {
  bot.api.config.use(presentationAwareRetry(autoRetry()));

  /** Active turns outlive the polling handler; keep ownership until delivery finishes. */
  const running = new Map();
  // Includes completed deliveries whose journal is still flushing after chat unlock.
  const unfinished = new Set();
  /** @type {Map<number, string>} */
  const pending = new Map();

  let stopping = false;
  const startPolling = bot.start.bind(bot);
  bot.start = (...args) => { stopping = false; return startPolling(...args); };
  const stopPolling = bot.stop.bind(bot);
  bot.stop = async () => {
    stopping = true;
    const turns = [...unfinished];
    for (const turn of turns) if (!turn.completed) turn.controller.abort();
    try { await stopPolling(); }
    finally { await Promise.allSettled(turns.map((turn) => turn.done)); }
  };

  bot.use(adminGuard(cfg.adminId));
  bot[Symbol.for('msb.cancelPendingInput')] = (chatId) => pending.delete(chatId);
  bot.use(async (ctx, next) => {
    if (/^\/start(?:@[\w_]+)?(?:\s|$)/.test(ctx.message?.text || '')) pending.delete(ctx.chat?.id);
    return next();
  });

  bot.command('start', async (ctx) => {
    const { state } = await loadState();
    await updateState((s) => {
      s.chatId = ctx.chat.id;
      s.userId = ctx.from?.id;
      s.ownerUsername = ctx.from?.username || null;
      if (s.ccEffort === undefined) s.ccEffort = 'xhigh';
      if (s.dailySpendLimit === undefined) s.dailySpendLimit = 10;
      if (s.timezone === undefined) s.timezone = cfg.timezone;
      return s;
    });
    if (isSetupMode(state)) {
      const view = setupScreen();
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
      return;
    }
    const view = hubScreen();
    await ctx.reply(view.text, { reply_markup: view.keyboard });
  });

  bot.command('help', async (ctx) => {
    const { state } = await loadState();
    await ctx.reply(state.engine === 'oc' ? HELP_OC : HELP_CC, { parse_mode: 'HTML' });
  });

  bot.command('claude', async (ctx) => {
    await ctx.reply(`<b>Режим Claude</b> — что доступно в этом режиме:\n\n${HELP_CC}`, {
      parse_mode: 'HTML',
    });
  });

  bot.command('openclaw', async (ctx) => {
    if (process.env.JARVIS_CC_ONLY === '1') {
      await ctx.reply(
        'Этот бот работает только с 👾 Claude Code.\nOpenClaw: /settings → ⚙️ Движки → ➕ OpenClaw.',
      );
      return;
    }
    await ctx.reply(`<b>Режим OpenClaw</b> — что доступно в этом режиме:\n\n${HELP_OC}`, {
      parse_mode: 'HTML',
    });
  });

  bot.command('settings', async (ctx) => {
    const { state } = await loadState();
    const view = settingsScreen(state);
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('pult', async (ctx) => {
    try {
      const { buildPultCommandKeyboard } = await import('../pult/client.mjs');
      const view = await buildPultCommandKeyboard();
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
    } catch (err) {
      await ctx.reply(
        `Пульт недоступен: ${err.message}\n\nВключи в /settings → Системные → Пульт (нужен пароль).`,
      );
    }
  });

  bot.command('monitor', async (ctx) => {
    const view = await monitorScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });
  bot.command('digest', async (ctx) => {
    const { buildDigestText } = await import('../monitor/digest.mjs');
    const dig = await buildDigestText();
    await ctx.reply(dig.text, { parse_mode: 'HTML' });
  });
  bot.command('sources', async (ctx) => {
    const { monitorSourcesScreen } = await import('./screens.mjs');
    const view = await monitorSourcesScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });


  bot.command('stop', async (ctx) => {
    const turn = running.get(ctx.chat.id);
    if (turn && !turn.completed) {
      turn.controller.abort();
      await ctx.reply('Моя остановочка ✋🏽⛔️');
    } else {
      await ctx.reply('Нечего останавливать 🤷');
    }
  });

  bot.command('newtask', async (ctx) => {
    await updateState((s) => {
      delete s.ccSessionId;
      s.sessionEpoch = (s.sessionEpoch || 0) + 1;
      return s;
    });
    await ctx.reply('Новая сессия. Пиши задачу.');
  });

  bot.command('clear', async (ctx) => {
    await updateState((s) => {
      delete s.ccSessionId;
      s.sessionEpoch = (s.sessionEpoch || 0) + 1;
      return s;
    });
    await ctx.reply('Начата новая беседа. Файлы и native-история сохранены.');
  });

  bot.command('compact', async (ctx) => {
    await ctx.reply('Ручное сжатие через эту Telegram-команду пока не подключено. Сессию и файлы не менял.');
  });

  bot.command('undo', async (ctx) => {
    await ctx.reply('Автоматическая отмена правок через /undo пока не подключена. Опиши агенту, какую правку нужно вернуть.');
  });

  bot.command('sessions', async (ctx) => {
    const { sessionsScreen } = await import('./screens.mjs');
    const { state } = await loadState();
    const view = await sessionsScreen(state);
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('projects', async (ctx) => {
    const { projectsScreen } = await import('./screens.mjs');
    const view = projectsScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('skills', async (ctx) => {
    const { skillsScreen } = await import('./screens.mjs');
    const view = skillsScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('status', async (ctx) => {
    const { state } = await loadState();
    const { statusScreen } = await import('./screens.mjs');
    const view = await statusScreen(state, cfg);
    await ctx.reply(view.text, { parse_mode: 'HTML' });
  });

  bot.command('cost', async (ctx) => {
    const { state } = await loadState();
    const day = new Date().toISOString().slice(0, 10);
    const spent = state.costHistory?.[day];
    const limit = state.dailySpendLimit ?? 0;
    await ctx.reply(
      `${typeof spent === 'number' && Number.isFinite(spent) ? `В сохранённой статистике за сегодня: <b>$${spent.toFixed(2)}</b>.` : 'В сохранённой статистике нет данных за сегодня.'}\nСохранённый лимит: ${limit > 0 ? `$${limit}/день` : 'без ограничений'}.\nСбор стоимости и применение лимита в open-core пока не подключены.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('autostatus', async (ctx) => {
    const { autonomyHistoryScreen } = await import('./screens.mjs');
    const view = autonomyHistoryScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('autoactions', async (ctx) => {
    const { autonomyTasksScreen } = await import('./screens.mjs');
    const view = await autonomyTasksScreen();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('connect', async (ctx) => {
    await ctx.reply(
      'VS Code туннель: скажи агенту поднять code-server/tunnel или открой /settings → Системные → SSH. Эта команда сама туннель не запускает.',
    );
  });

  bot.command('recovery', async (ctx) => {
    await ctx.reply(
      'Аварийный доступ: используй существующее SSH-подключение или консоль хостера. Меню SSH — /settings → Системные → SSH.',
    );
  });

  bot.command('feedback', async (ctx) => {
    pending.set(ctx.chat.id, 'feedback');
    await ctx.reply('Напиши отзыв следующим сообщением — сохраню в workspace/ops/feedback.md.');
  });

  bot.on('callback_query:data', async (ctx) => {
    await handleCallback({ bot, cfg, pending, ctx });
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text || '';
    const chatId = ctx.chat.id;
    if (text.startsWith('/')) return;

    const pend = pending.get(chatId);
    if (pend === 'auth-token') {
      const token = text.trim();
      const { setEnvKey } = await import('../env/store.mjs');
      try {
        await setEnvKey(token.startsWith('sk-ant-') ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN', token);
        await saveAuthToken(token);
      } catch (err) { await ctx.reply(`Токен не сохранён: ${err.message}`); return; }
      pending.delete(chatId);
      await ctx.reply('Токен сохранён. Перезапускаюсь…');
      setTimeout(() => process.exit(0), 600);
      return;
    }
    if (pend === 'timezone') {
      const timezone = text.trim();
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
      catch { await ctx.reply('Неизвестный часовой пояс. Например: Europe/Moscow.'); return; }
      pending.delete(chatId);
      await updateState((s) => {
        s.timezone = timezone;
        return s;
      });
      await ctx.reply(`Часовой пояс: <code>${escapeHtml(timezone)}</code>`, { parse_mode: 'HTML' });
      return;
    }
    if (pend?.startsWith('env:')) {
      const key = pend.slice(4);
      const { setEnvKey } = await import('../env/store.mjs');
      try { await setEnvKey(key, text.trim()); }
      catch (err) { await ctx.reply(`Не сохранил: ${err.message}`); return; }
      pending.delete(chatId);
      await ctx.reply(`Сохранил <code>${escapeHtml(key)}</code> в .env бота. Это не проверка подключения сервиса. Для параметров запуска нужен перезапуск бота.`, { parse_mode: 'HTML' });
      return;
    }
    if (pend === 'feedback') {
      pending.delete(chatId);
      const file = path.join(workspaceDir(), 'ops', 'feedback.md');
      ensureDir(path.dirname(file));
      await fs.appendFile(file, `\n## ${new Date().toISOString()}\n\n${text}\n`);
      await ctx.reply('Спасибо, записал.');
      return;
    }
    if (pend === 'new-project') {
      pending.delete(chatId);
      const name = text.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!name) {
        await ctx.reply('Имя не подошло. Только латиница, цифры, -_.');
        return;
      }
      const dir = path.join(process.env.HOME || '', 'projects', name);
      await fs.mkdir(dir, { recursive: true });
      await updateState((s) => { s.activeProject = name; return s; });
      await ctx.reply(`✔ Проект <code>${name}</code> создан и выбран. Переключение cwd в open-core пока не подключено.`, { parse_mode: 'HTML' });
      return;
    }
    if (pend === 'bot-token') {
      pending.delete(chatId);
      await ctx.reply('⏳ Ставлю бота через bot-ctl…');
      const { addBot } = await import('../bots/manage.mjs');
      const res = await addBot(text.trim(), { ownerId: cfg.adminId });
      if (res.ok) {
        await ctx.reply(`✔ Служба бота <b>${res.botId}</b> создана и запущена. Ответ в Telegram ещё нужно проверить.`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`Не удалось добавить бота: ${res.error}`);
      }
      return;
    }
    if (pend === 'env-key-name') {
      const key = text.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        await ctx.reply('Имя ключа: только A-Z, цифры и _.');
        return;
      }
      pending.set(chatId, `env:${key}`);
      await ctx.reply(`Ок. Пришли значение для <code>${key}</code>.`, { parse_mode: 'HTML' });
      return;
    }
    if (pend === 'mon-source') {
      pending.delete(chatId);
      const { addSourceFromInput } = await import('../monitor/config.mjs');
      const res = await addSourceFromInput(text);
      if (!res.ok) {
        await ctx.reply(res.error);
        return;
      }
      await ctx.reply(
        res.added
          ? `✔ Источник <b>${res.type}</b>: ${res.name}`
          : `Уже был: <b>${res.type}</b> ${res.name}`,
        { parse_mode: 'HTML' },
      );
      return;
    }
    if (
      pend === 'pult-password' ||
      pend === 'pult-tg-token' ||
      pend === 'pult-url' ||
      pend === 'pult-listen' ||
      pend === 'pult-session'
    ) {
      pending.delete(chatId);
      const { setEnvKey, deleteEnvKey } = await import('../env/store.mjs');
      const { pultScreen } = await import('./screens.mjs');
      const { engineStatusSnapshot, submitRequest, waitRequestResult } = await import('../engines/client.mjs');
      const { readPultSecrets, pultPublicUrl, pultListenHost } = await import('../pult/client.mjs');
      const { escapeHtml } = await import('./edit.mjs');

      try {
        if (pend === 'pult-password') {
          const pw = text.trim();
          if ([...pw].length < 12) {
            await ctx.reply('Пароль короче 12 символов.');
            return;
          }
          await setEnvKey('PULT_PASSWORD', pw);
        } else if (pend === 'pult-tg-token') {
          const v = text.trim();
          if (v === '-' || v === '') await deleteEnvKey('PULT_TG_TOKEN');
          else await setEnvKey('PULT_TG_TOKEN', v);
        } else if (pend === 'pult-url') {
          const v = text.trim().replace(/\/+$/, '');
          try {
            const u = new URL(v);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
          } catch {
            await ctx.reply('Нужен URL вида https://… или http://…');
            return;
          }
          await setEnvKey('PULT_PUBLIC_URL', v);
        } else if (pend === 'pult-listen') {
          const host = text.trim();
          if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host !== '::' && !host.includes(':')) {
            await ctx.reply('Ожидаю IPv4, например 192.168.1.10');
            return;
          }
          await setEnvKey('PULT_HOST', host);
        } else if (pend === 'pult-session') {
          const hours = Number(text.trim());
          if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
            await ctx.reply('Нужно целое число часов от 1 до 720.');
            return;
          }
          await setEnvKey('PULT_SESSION_HOURS', String(hours));
        }

        let note = 'сохранено';
        try {
          const { id } = await submitRequest('reload-pult', {
            bot_id: process.env.MSB_BOT_ID || 'default',
          });
          const result = await waitRequestResult(id, { timeoutMs: 90_000 });
          note =
            result?.code === 'OK'
              ? 'сохранено, службы обновлены'
              : `сохранено; reload: ${result?.code || 'нет ответа'}`;
        } catch (err) {
          note = `сохранено; reload: ${err.message}`;
        }

        const secrets = await readPultSecrets();
        const { readEnvMap } = await import('../env/store.mjs');
        const { map } = await readEnvMap();
        const snap = await engineStatusSnapshot();
        const view = pultScreen(
          snap.pult,
          {
            password: map.get('PULT_PASSWORD') || secrets.web.get('PULT_PASSWORD') || '',
            host: map.get('PULT_HOST') || pultListenHost(secrets),
            tgToken: map.get('PULT_TG_TOKEN') || secrets.web.get('PULT_TG_TOKEN') || '',
            publicUrl: map.get('PULT_PUBLIC_URL') || pultPublicUrl(secrets),
            sessionHours: map.get('PULT_SESSION_HOURS') || secrets.web.get('PULT_SESSION_HOURS') || '4',
          },
          escapeHtml(note),
        );
        await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
      } catch (err) {
        await ctx.reply(`Не удалось сохранить: ${err.message}`);
      }
      return;
    }

    const { state } = await loadState();
    if (isSetupMode(state)) {
      const view = setupScreen();
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
      return;
    }

    const scheduled = tryParseScheduleMessage(text);
    if (scheduled) {
      const task = await addTask(scheduled);
      await ctx.reply(
        `Задача сохранена: <b>${escapeHtml(task.title)}</b>\nКаждые ${task.everyHours} ч.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    // маркеры автономки из ответа агента
    const marker = text.match(/\[SCHEDULE_TASK\]([\s\S]*?)\[\/SCHEDULE_TASK\]/i);
    if (marker) {
      const body = marker[1].trim();
      const task = await addTask({ prompt: body, title: body.slice(0, 80), everyHours: 24 });
      await ctx.reply(`Задача из маркера: <b>${escapeHtml(task.title)}</b>`, { parse_mode: 'HTML' });
      return;
    }

    if (running.has(chatId)) {
      await ctx.reply('Уже работаю над предыдущим сообщением. /stop — прервать.');
      return;
    }

    if (!hasClaudeAuth(process.env, state)) {
      const view = setupScreen();
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
      return;
    }

    if (stopping) return;
    const turn = { controller: new AbortController(), completed: false, done: null };
    running.set(chatId, turn);
    unfinished.add(turn);
    // Return to Grammy immediately, so the next getUpdates can deliver /stop.
    turn.done = executeTurn(ctx, text, turn).catch((err) => {
      console.error('[msb/bot] turn delivery failed:', err.message);
    }).finally(() => unfinished.delete(turn));
  });

  async function executeTurn(ctx, text, turn, voice = false) {
    const chatId = ctx.chat.id;
    const signal = turn.controller.signal;
    let status;
    let progress;
    let transcription;
    let transcribed = false;
    const startedAt = performance.now();
    let history, result, outcome = 'error', deliveredText = '', delivered = false;
    let responseReady = false;
    const stopped = async () => {
      outcome = 'aborted';
      if (status) await ctx.api.editMessageText(chatId, status.message_id, 'Моя остановочка ✋🏽⛔️', {}, presentationSignal(AbortSignal.timeout(15_000)))
        .then(() => { deliveredText = 'Моя остановочка ✋🏽⛔️'; delivered = true; }).catch(() => {});
    };
    try {
      if (!voice) history = await beginTurnHistory({ input: ctx.message?.text ?? text });
      const thread = ctx.message?.message_thread_id;
      if (voice) {
        transcription = await ctx.reply('🎙 Расшифровываю...', thread && thread !== 1 ? { message_thread_id: thread } : {});
        if (signal.aborted) return;
      }
      status = await ctx.reply('Думаю ⏳', thread && thread !== 1 ? { message_thread_id: thread } : {});
      if (signal.aborted) { await stopped(); return; }
      progress = startTurnProgress(ctx, status.message_id, { signal, preparing: voice });
      if (voice) {
        const recognized = await recognizeVoice(ctx, cfg.botToken, signal);
        signal.throwIfAborted();
        const preview = voicePreview(recognized.transcript);
        try { await ctx.api.editMessageText(chatId, transcription.message_id, preview.html, { parse_mode: 'HTML' }); }
        catch { if (!signal.aborted) await ctx.api.editMessageText(chatId, transcription.message_id, preview.plain).catch(() => {}); }
        signal.throwIfAborted();
        transcribed = true;
        text = recognized.prompt;
        history = await beginTurnHistory({ input: recognized.transcript.slice(0, 300) });
        progress.beginThinking();
      }
      const out = await runTurn({ prompt: text, signal, onStatus: ev => {
        if (ev.kind === 'provider') history?.provider(ev.providerId);
        progress.onStatus(ev);
      } });
      result = out.result;
      outcome = out.ok ? 'ok' : 'error';
      await progress.stop();
      if (signal.aborted || out.error === 'aborted') { await stopped(); return; }
      turn.completed = true;
      responseReady = true;
      await deliverTurnResponse(ctx, status.message_id, out.text, out.ok ? {
        elapsedMs: performance.now() - startedAt, costUsd: out.result?.costUsd, context: out.result?.context,
      } : {});
      deliveredText = out.text; delivered = true;
    } catch (err) {
      await progress?.stop();
      if (signal.aborted) await stopped().catch(() => {});
      else {
        outcome = responseReady ? 'delivery_error' : 'error';
        turn.completed = true;
        if (voice && err.code === 'STT_NOT_CONFIGURED') {
          if (status) await ctx.api.deleteMessage(chatId, status.message_id, presentationSignal(AbortSignal.timeout(15_000))).catch(() => {});
          const thread = ctx.message?.message_thread_id;
          await ctx.reply(STT_ONBOARDING.text, { reply_markup: STT_ONBOARDING.reply_markup, ...(thread && thread !== 1 ? { message_thread_id: thread } : {}) });
        } else {
          const error = voice && !transcribed
            ? `❌ Не удалось обработать голосовое: ${String(err.message).slice(0, 200)}\n\nПопробуй ещё раз или напиши текстом.`
            : `❌ Ошибка: ${String(err.message).slice(0, 300)}`;
          await deliverTurnResponse(ctx, status?.message_id, error, {});
          deliveredText = error; delivered = true;
        }
      }
    } finally {
      await progress?.stop();
      if (transcription && !transcribed) await ctx.api.deleteMessage(chatId, transcription.message_id, presentationSignal(AbortSignal.timeout(15_000))).catch(() => {});
      turn.completed = true;
      if (running.get(chatId) === turn) running.delete(chatId);
      await history?.finish({ status: signal.aborted ? 'aborted' : outcome, text: deliveredText, delivered, result });
    }
  }

  bot.on('message:voice', async ctx => {
    const { state } = await loadState();
    if (isSetupMode(state)) { await ctx.reply('Сначала подключи AI: /start'); return; }
    if (stopping) return;
    if (running.has(ctx.chat.id)) { await ctx.reply('Уже работаю над предыдущим сообщением. /stop — прервать.'); return; }
    const turn = { controller: new AbortController(), completed: false, done: null };
    running.set(ctx.chat.id, turn);
    unfinished.add(turn);
    // Speech never passes through pending text forms or fabricated Telegram updates.
    turn.done = executeTurn(ctx, '', turn, true).catch(err => console.error('[msb/bot] voice delivery failed:', err.message)).finally(() => unfinished.delete(turn));
  });

  bot.on(['message:photo', 'message:video', 'message:document'], async (ctx) => {
    const { state } = await loadState();
    if (isSetupMode(state)) {
      await ctx.reply('Сначала подключи AI: /start');
      return;
    }
    await ctx.reply('Обработка голоса и вложений в текущем Telegram-ядре пока не подключена. Перешли задачу текстом.');
  });

  // set commands after start
  bot.api
    .setMyCommands(commandsForEngine('cc', process.env.JARVIS_CC_ONLY === '1'))
    .catch((err) => console.error('[msb/bot] setMyCommands failed:', err.message));

  return bot;
}

async function saveAuthToken(raw) {
  const token = raw.trim();
  if (token.startsWith('sk-ant-')) {
    process.env.ANTHROPIC_API_KEY = token;
    process.env.MSB_ANTHROPIC_API_KEY = token;
  } else {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
  }
  await updateState((s) => {
    s.authMode = 'subscription';
    s.hasSubscriptionAuth = true;
    return s;
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function runPolling(bot, { log = console.error } = {}) {
  let fastFails = 0;
  for (;;) {
    try {
      log('[msb/bot] starting polling (open-core)');
      await bot.start({
        onStart: (info) => log(`[msb/bot] @${info.username} ready`),
      });
      return;
    } catch (err) {
      const msg = String(err?.message || err);
      if (/401|Unauthorized|Not Found/i.test(msg)) {
        log(`[msb/bot] Token invalid (${msg.slice(0, 100)}). Bot will not poll Telegram.`);
        return;
      }
      try {
        await bot.stop();
      } catch {
        /* ignore */
      }
      fastFails += 1;
      if (fastFails < 5) {
        const wait = Math.min(30_000, fastFails * 5000);
        log(`[msb/bot] bot.start() failed (${fastFails}/5), retry in ${wait / 1000}s: ${msg.slice(0, 200)}`);
        await sleep(wait);
        continue;
      }
      if (/409|Conflict/i.test(msg)) {
        log('[msb/bot] 409 Conflict persists. Retrying every 300s until the path is free.');
        await sleep(300_000);
        fastFails = 0;
        continue;
      }
      log(`[msb/bot] bot.start() failed after retries: ${msg.slice(0, 200)}`);
      log('[msb/bot] Bot not polling. Heartbeat still running.');
      return;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
