import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTurnProgress } from './progress.mjs';
import { deliverTurnResponse } from './response.mjs';
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
export function createBot(cfg) {
  const bot = new Bot(cfg.botToken);
  bot.api.config.use(autoRetry());

  /** Active turns outlive the polling handler; keep ownership until delivery finishes. */
  const running = new Map();
  /** @type {Map<number, string>} */
  const pending = new Map();

  let stopping = false;
  const startPolling = bot.start.bind(bot);
  bot.start = (...args) => { stopping = false; return startPolling(...args); };
  const stopPolling = bot.stop.bind(bot);
  bot.stop = async () => {
    stopping = true;
    const turns = [...running.values()];
    for (const turn of turns) if (!turn.completed) turn.controller.abort();
    try { await stopPolling(); }
    finally { await Promise.allSettled(turns.map((turn) => turn.done)); }
  };

  bot.use(adminGuard(cfg.adminId));

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
    if ((process.env.MSB_CC_ONLY || process.env.JARVIS_CC_ONLY) === '1') {
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
    await ctx.reply('Контекст сброшен.');
  });

  bot.command('compact', async (ctx) => {
    await ctx.reply('Сжатие контекста: отправь агенту /compact в ходе или дождись автоcompact.');
  });

  bot.command('undo', async (ctx) => {
    await ctx.reply('Отмена правки: скажи агенту, какой файл вернуть, или /nocheck в штатном ядре.');
  });

  bot.command('sessions', async (ctx) => {
    const { sessionsScreen } = await import('./screens.mjs');
    const view = sessionsScreen();
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
    await ctx.reply(
      [
        `<b>Статус</b>`,
        `Бот: <code>${cfg.botId}</code>`,
        `Движок: ${state.engine === 'oc' ? 'OpenClaw' : 'Claude Code'}`,
        `Модель: <code>${state.ccModel || state.model || 'opus'}</code>`,
        `Workspace: <code>${cfg.workspace}</code>`,
        `Сессия: <code>${(state.ccSessionId || '—').slice(0, 12)}</code>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('cost', async (ctx) => {
    const { state } = await loadState();
    const day = new Date().toISOString().slice(0, 10);
    const spent = state.costHistory?.[day] ?? 0;
    const lim = state.dailySpendLimit ?? 0;
    await ctx.reply(
      `Расход за сегодня: <b>$${Number(spent).toFixed(2)}</b>${lim > 0 ? ` / лимит $${lim}` : ''}`,
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
      'VS Code туннель: скажи агенту поднять code-server/tunnel или открой /settings → Системные → SSH.',
    );
  });

  bot.command('recovery', async (ctx) => {
    await ctx.reply(
      'Аварийный доступ: SSH на сервер под пользователем client. Ключи — /settings → Системные → SSH.',
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
      pending.delete(chatId);
      await saveAuthToken(text);
      try {
        await persistEnvKV(
          text.trim().startsWith('sk-ant-') ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN',
          text.trim(),
        );
        await ctx.reply('Токен сохранён. Перезапускаюсь…');
        setTimeout(() => process.exit(0), 600);
      } catch (err) {
        await ctx.reply(`Токен в процессе есть, .env не записался: ${err.message}`);
      }
      return;
    }
    if (pend === 'timezone') {
      pending.delete(chatId);
      await updateState((s) => {
        s.timezone = text.trim();
        return s;
      });
      await ctx.reply(`Часовой пояс: <code>${text.trim()}</code>`, { parse_mode: 'HTML' });
      return;
    }
    if (pend?.startsWith('env:')) {
      pending.delete(chatId);
      const key = pend.slice(4);
      const { setEnvKey } = await import('../env/store.mjs');
      await setEnvKey(key, text.trim());
      await ctx.reply(`Сохранил <code>${key}</code> в .env бота.`, { parse_mode: 'HTML' });
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
      await updateState((s) => {
        s.activeProject = name;
        return s;
      });
      await ctx.reply(`✔ Проект <code>${name}</code> создан и активирован.`, { parse_mode: 'HTML' });
      return;
    }
    if (pend === 'bot-token') {
      pending.delete(chatId);
      await ctx.reply('⏳ Ставлю бота через bot-ctl…');
      const { addBot } = await import('../bots/manage.mjs');
      const res = await addBot(text.trim(), { ownerId: cfg.adminId });
      if (res.ok) {
        await ctx.reply(`✔ Бот <b>${res.botId}</b> добавлен и запущен.`, { parse_mode: 'HTML' });
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
    // Return to Grammy immediately, so the next getUpdates can deliver /stop.
    turn.done = executeTurn(ctx, text, turn).catch((err) => {
      console.error('[msb/bot] turn delivery failed:', err.message);
    });
  });

  async function executeTurn(ctx, text, turn) {
    const chatId = ctx.chat.id;
    const signal = turn.controller.signal;
    let status;
    let progress;
    const startedAt = performance.now();
    const stopped = async () => {
      if (status) await ctx.api.editMessageText(chatId, status.message_id, 'Моя остановочка ✋🏽⛔️');
    };
    try {
      const thread = ctx.message?.message_thread_id;
      status = await ctx.reply('Думаю ⏳', thread && thread !== 1 ? { message_thread_id: thread } : {});
      if (signal.aborted) { await stopped(); return; }
      progress = startTurnProgress(ctx, status.message_id, { signal });
      const out = await runAgentTurn({ prompt: text, signal, onStatus: ev => progress.onStatus(ev) });
      await progress.stop();
      if (signal.aborted || out.error === 'aborted') { await stopped(); return; }
      turn.completed = true;
      await deliverTurnResponse(ctx, status.message_id, out.text, out.ok ? {
        elapsedMs: performance.now() - startedAt, costUsd: out.result?.costUsd, context: out.result?.context,
      } : {});
    } catch (err) {
      await progress?.stop();
      if (signal.aborted) await stopped().catch(() => {});
      else { turn.completed = true; await deliverTurnResponse(ctx, status?.message_id, `❌ Ошибка: ${String(err.message).slice(0, 300)}`, {}); }
    } finally {
      await progress?.stop();
      turn.completed = true;
      if (running.get(chatId) === turn) running.delete(chatId);
    }
  }

  bot.on(['message:voice', 'message:photo', 'message:video', 'message:document'], async (ctx) => {
    const { state } = await loadState();
    if (isSetupMode(state)) {
      await ctx.reply('Сначала подключи AI: /start');
      return;
    }
    await ctx.reply('Медиа принято. В open-core пока перешли текст с описанием или дождись порта STT/vision.');
  });

  // set commands after start
  bot.api
    .setMyCommands(commandsForEngine('cc', (process.env.MSB_CC_ONLY || process.env.JARVIS_CC_ONLY) === '1'))
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

async function persistEnvKV(key, value) {
  const envPath = path.join(botRoot(), '.env');
  ensureDir(botRoot());
  let existing = '';
  try {
    existing = await fs.readFile(envPath, 'utf8');
  } catch {
    existing = '';
  }
  const lines = existing.split('\n').filter((l) => l && !l.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  await fs.writeFile(envPath, `${lines.join('\n')}\n`, { mode: 0o600 });
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
