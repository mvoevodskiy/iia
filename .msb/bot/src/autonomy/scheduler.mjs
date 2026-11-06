import fs from 'node:fs/promises';
import path from 'node:path';
import { autonomyDir, ensureDir } from '../paths.mjs';
import { runAgentTurn } from '../agent/turn.mjs';
import { listTasks, saveAllTasks } from './store.mjs';

const START_DELAY_MS = 30_000;
const TICK_MS = 60_000;

/**
 * Упрощённый планировщик фоновых задач (аналог [msb/scheduler]).
 */
export function startScheduler({ api, adminId, log = console.error } = {}) {
  let stopped = false;
  let busy = false;

  log('[msb/scheduler] Starting (delay 30s)...');
  const boot = setTimeout(tick, START_DELAY_MS);
  const timer = setInterval(tick, TICK_MS);
  boot.unref?.();
  timer.unref?.();

  async function tick() {
    if (stopped || busy) return;
    busy = true;
    try {
      const tasks = await listTasks();
      const now = Date.now();
      let changed = false;
      for (const task of tasks) {
        if (task.enabled === false) continue;
        if ((task.nextAt || 0) > now) continue;
        await runTask(task, api, adminId, log);
        task.nextAt = now + Math.max(1, task.everyHours || 24) * 3600 * 1000;
        changed = true;
      }
      if (changed) await saveAllTasks(tasks);
    } catch (err) {
      log(`[msb/scheduler] tick error: ${err.message}`);
    } finally {
      busy = false;
    }
  }

  return {
    stop() {
      stopped = true;
      clearTimeout(boot);
      clearInterval(timer);
    },
  };
}

async function runTask(task, api, adminId, log) {
  const dir = autonomyDir();
  ensureDir(dir);
  const runId = `${Date.now()}-${task.id.slice(0, 8)}`;
  log(`[msb/scheduler] run ${runId} task=${task.title}`);

  const result = await runAgentTurn({
    prompt: [
      'Ты выполняешь фоновую задачу владельца в общей с чатом сессии.',
      'Сделай ровно то, что в задании. В конце — короткий итог.',
      '',
      `Задание:\n${task.prompt}`,
    ].join('\n'),
    autonomy: true,
  });

  const line = JSON.stringify({
    at: new Date().toISOString(),
    taskId: task.id,
    ok: result.ok,
    error: result.error || null,
    preview: (result.text || '').slice(0, 200),
  });
  await fs.appendFile(path.join(dir, 'runs.jsonl'), `${line}\n`);

  if (!result.ok && result.error === 'setup') {
    task.failStreak = (task.failStreak || 0) + 1;
    return;
  }

  const empty = !result.text?.trim();
  if (empty && task.silenceOk) {
    task.failStreak = 0;
    return;
  }

  if (!result.ok) {
    task.failStreak = (task.failStreak || 0) + 1;
    if (task.failStreak >= 3) {
      task.enabled = false;
      task.pausedUntil = Date.now() + Math.max(2, task.everyHours || 24) * 2 * 3600 * 1000;
    }
  } else {
    task.failStreak = 0;
  }

  if (adminId && api && (result.text || !task.silenceOk)) {
    const header = `🥷 <b>${escapeHtml(task.title)}</b>`;
    const body = escapeHtml((result.text || 'пустой прогон').slice(0, 3500));
    try {
      await api.sendMessage(adminId, `${header}\n\n${body}`, { parse_mode: 'HTML' });
    } catch (err) {
      log(`[msb/scheduler] notify failed: ${err.message}`);
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
