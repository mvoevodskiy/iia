import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import fs from 'node:fs/promises';
import path from 'node:path';
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

  /** @type {Map<number, AbortController>} */
  const running = new Map();
  /** @type {Map<number, string>} */
  const pending = new Map();

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
    await updateState((s) => {
      delete s.ccSessionId;
      return s;
    });
    await ctx.reply('Новая сессия. Пиши задачу.');
  });

  bot.command('clear', async (ctx) => {
    await updateState((s) => {
      delete s.ccSessionId;
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
          if (ev.kind === 'tool') void bump(`🔧 ${ev.name}${ev.input ? `: ${ev.input}` : ''}`);
          else if (ev.kind === 'thinking') void bump('💭 Думаю…');
          else if (ev.kind === 'init') void bump(`🧠 ${ev.model || 'модель'}…`);
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
        bot.stop();
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
