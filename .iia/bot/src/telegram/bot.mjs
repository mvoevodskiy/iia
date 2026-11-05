import { Bot, GrammyError } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { spawn } from 'node:child_process';
import { runAgentTurn } from '../agent/turn.mjs';
import { updateState } from '../state.mjs';
import { addTask, tryParseScheduleMessage } from '../autonomy/store.mjs';
import { adminGuard } from './auth.mjs';
import {
  applyEffort,
  applyModelFamily,
  applyPermMode,
  renderAbout,
  renderAgent,
  renderAutonomy,
  renderConn,
  renderEffort,
  renderModel,
  renderPermMode,
  renderRestart,
  renderSettings,
  renderStart,
  renderTasks,
} from './menus.mjs';

/**
 * @param {import('../config.mjs').readConfig extends Function ? ReturnType<import('../config.mjs').readConfig> : any} cfg
 */
export function createBot(cfg) {
  const bot = new Bot(cfg.botToken);
  bot.api.config.use(autoRetry());

  /** @type {Map<number, AbortController>} */
  const running = new Map();
  /** @type {Map<number, 'auth-token'>} */
  const pending = new Map();

  bot.use(adminGuard(cfg.adminId));

  bot.command('start', async (ctx) => {
    const view = await renderStart(cfg);
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.command('stop', async (ctx) => {
    const ac = running.get(ctx.chat.id);
    if (ac) {
      ac.abort();
      running.delete(ctx.chat.id);
      await ctx.reply('Останавливаю текущий ход…');
    } else {
      await ctx.reply('Сейчас ничего не выполняется.');
    }
  });

  bot.command('newtask', async (ctx) => {
    const view = await renderAutonomy();
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => {});
    const chatId = ctx.chat.id;
    const msgId = ctx.callbackQuery.message?.message_id;

    const edit = async (view) => {
      try {
        await ctx.api.editMessageText(chatId, msgId, view.text, {
          parse_mode: 'HTML',
          reply_markup: view.keyboard,
        });
      } catch (err) {
        if (!(err instanceof GrammyError && /not modified/i.test(err.description || ''))) {
          await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
        }
      }
    };

    switch (true) {
      case data === 'menu:back':
      case data === 'menu:close':
        return edit(await renderStart(cfg));
      case data === 'menu:settings':
        return edit(await renderSettings());
      case data === 'menu:agent':
        return edit(await renderAgent());
      case data === 'menu:autonomy':
        return edit(await renderAutonomy());
      case data === 'menu:about':
        return edit(renderAbout(cfg));
      case data === 'settings:conn':
        return edit(await renderConn());
      case data === 'settings:auth':
        pending.set(chatId, 'auth-token');
        return edit({
          text: 'Пришли следующим сообщением токен Claude (<code>claude setup-token</code>) или ключ <code>sk-ant-…</code>.\nОтмена: /start',
          keyboard: (await renderConn()).keyboard,
        });
      case data === 'settings:model':
        return edit(renderModel());
      case data === 'settings:effort':
        return edit(renderEffort());
      case data === 'settings:permmode':
        return edit(renderPermMode());
      case data === 'settings:restart':
        return edit(renderRestart());
      case data === 'settings:restart:do':
        await ctx.reply('Перезапускаюсь…');
        setTimeout(() => restartSelf(), 500);
        return;
      case data.startsWith('settings:model:set:'): {
        const family = data.split(':').pop();
        const model = await applyModelFamily(family);
        await ctx.reply(model ? `Модель: <code>${model}</code>` : 'Неизвестная модель', {
          parse_mode: 'HTML',
        });
        return edit(await renderAgent());
      }
      case data === 'settings:model:fable:ask':
        await applyModelFamily('fable');
        await ctx.reply('Fable включена. На Pro она может тратить usage credits сверх подписки.');
        return edit(await renderAgent());
      case data.startsWith('settings:effort:set:'): {
        const v = data.split(':').pop();
        await applyEffort(v);
        return edit(await renderAgent());
      }
      case data.startsWith('settings:permmode:set:'): {
        const v = data.slice('settings:permmode:set:'.length);
        await applyPermMode(v);
        return edit(await renderAgent());
      }
      case data === 'auto:tasks':
        return edit(await renderTasks());
      case data === 'auto:what':
        return edit({
          text: [
            '<b>Что такое автономка</b>',
            'Фоновые задачи по расписанию без тебя в чате.',
            'Пример: «каждые 24 часа собери краткий дайджест из ~/workspace/memory».',
            'Правила: см. <code>~/.iia/AUTONOMY.md</code>.',
          ].join('\n'),
          keyboard: (await renderAutonomy()).keyboard,
        });
      default:
        return;
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text || '';
    const chatId = ctx.chat.id;

    if (pending.get(chatId) === 'auth-token') {
      pending.delete(chatId);
      await saveAuthToken(text);
      await ctx.reply('Токен сохранён в окружение процесса и state. Перезапусти бота через systemd, чтобы закрепить в .env навсегда — или используй «Перезапуск» после записи в файл.');
      // Persist into bot .env if possible
      try {
        await persistTokenToEnvFile(text);
        await ctx.reply('Записал в `.env` бота. Делаю мягкий выход для подхвата systemd…');
        setTimeout(() => process.exit(0), 800);
      } catch (err) {
        await ctx.reply(`Не смог записать .env: ${err.message}. Задай CLAUDE_CODE_OAUTH_TOKEN вручную.`);
      }
      return;
    }

    if (text.startsWith('/')) return;

    const scheduled = tryParseScheduleMessage(text);
    if (scheduled) {
      const task = await addTask(scheduled);
      await ctx.reply(
        `Задача сохранена: <b>${escapeHtml(task.title)}</b>\nКаждые ${task.everyHours} ч.\nСписок: /start → Автономка.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (running.has(chatId)) {
      await ctx.reply('Уже работаю над предыдущим сообщением. /stop — прервать.');
      return;
    }

    const ac = new AbortController();
    running.set(chatId, ac);
    const status = await ctx.reply('⏳ Думаю…');

    const bump = async (label) => {
      try {
        await ctx.api.editMessageText(chatId, status.message_id, label);
      } catch {
        /* ignore */
      }
    };

    try {
      const out = await runAgentTurn({
        prompt: text,
        signal: ac.signal,
        onStatus(ev) {
          if (ev.kind === 'tool') {
            void bump(`🔧 ${ev.name}${ev.input ? `: ${ev.input}` : ''}`);
          } else if (ev.kind === 'thinking') {
            void bump('💭 Думаю…');
          } else if (ev.kind === 'init') {
            void bump(`🧠 ${ev.model || 'модель'}…`);
          }
        },
      });
      await bump('✅');
      await replyChunked(ctx, out.text);
    } catch (err) {
      await ctx.reply(`Ошибка хода: ${err.message}`);
    } finally {
      running.delete(chatId);
    }
  });

  return bot;
}

async function saveAuthToken(raw) {
  const token = raw.trim();
  if (token.startsWith('sk-ant-')) {
    process.env.ANTHROPIC_API_KEY = token;
    process.env.IIA_ANTHROPIC_API_KEY = token;
  } else {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
  }
  await updateState((s) => {
    s.authMode = 'subscription';
    s.hasSubscriptionAuth = true;
    return s;
  });
}

async function persistTokenToEnvFile(raw) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { botRoot, ensureDir } = await import('../paths.mjs');
  const envPath = path.join(botRoot(), '.env');
  ensureDir(botRoot());
  let existing = '';
  try {
    existing = await fs.readFile(envPath, 'utf8');
  } catch {
    existing = '';
  }
  const token = raw.trim();
  const key = token.startsWith('sk-ant-') ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
  const lines = existing.split('\n').filter((l) => l && !l.startsWith(`${key}=`));
  lines.push(`${key}=${token}`);
  await fs.writeFile(envPath, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function restartSelf() {
  // systemd Restart=always поднимет процесс; bot-ctl если есть
  try {
    spawn('sudo', ['bot-ctl.sh', 'restart', process.env.IIA_BOT_ID || 'default'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    process.exit(0);
  }
}

async function replyChunked(ctx, text) {
  const limit = 4000;
  const body = text || '';
  for (let i = 0; i < body.length; i += limit) {
    await ctx.reply(body.slice(i, i + limit));
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Устойчивый polling (409 / сетевые сбои) — упрощённый Hl().
 */
export async function runPolling(bot, { log = console.error } = {}) {
  let fastFails = 0;
  for (;;) {
    try {
      log('[iia/bot] starting polling (open-core)');
      await bot.start({
        onStart: (info) => log(`[iia/bot] @${info.username} ready`),
      });
      return;
    } catch (err) {
      const msg = String(err?.message || err);
      if (/401|Unauthorized|Not Found/i.test(msg)) {
        log(`[iia/bot] Token invalid (${msg.slice(0, 100)}). Bot will not poll Telegram.`);
        return;
      }
      try {
        bot.stop();
      } catch {
        /* ignore */
      }
      fastFails += 1;
      if (fastFails < 5) {
        const wait = Math.min(30_000, fastFails * 5000);
        log(`[iia/bot] bot.start() failed (${fastFails}/5), retry in ${wait / 1000}s: ${msg.slice(0, 200)}`);
        await sleep(wait);
        continue;
      }
      if (/409|Conflict/i.test(msg)) {
        log('[iia/bot] 409 Conflict persists. Retrying every 300s until the path is free.');
        await sleep(300_000);
        fastFails = 0;
        continue;
      }
      log(`[iia/bot] bot.start() failed after retries: ${msg.slice(0, 200)}`);
      log('[iia/bot] Bot not polling. Heartbeat still running.');
      return;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
