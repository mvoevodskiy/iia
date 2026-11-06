import { loadMonitorConfig, saveMonitorConfig } from './config.mjs';
import { listRecentItems, loadMeta, saveMeta } from './store.mjs';
import { loadState } from '../state.mjs';

export async function buildDigestText(env = process.env) {
  const cfg = await loadMonitorConfig(env);
  const topN = cfg.digest?.topN || 10;
  const items = await listRecentItems({ limit: topN, sinceHours: 36 }, env);
  if (!items.length) {
    return { empty: true, text: 'За последние сутки новых материалов нет.' };
  }
  const lines = [`📨 <b>Дайджест</b> · ${items.length} материалов`, ''];
  for (const it of items) {
    const when = (it.publishedAt || '').slice(0, 16).replace('T', ' ');
    lines.push(`• <b>${esc(it.sourceName || it.sourceType)}</b> · ${when}`);
    lines.push(`  ${esc(it.title)}`);
    if (it.url) lines.push(`  ${esc(it.url)}`);
    lines.push('');
  }
  return { empty: false, text: lines.join('\n'), count: items.length };
}

export async function maybeSendDigest({ api, adminId, force = false, env = process.env, log = console.error } = {}) {
  if (!api || !adminId) return { sent: false, reason: 'no-api' };
  const cfg = await loadMonitorConfig(env);
  if (!cfg.digest?.enabled && !force) return { sent: false, reason: 'disabled' };

  const hour = cfg.digest?.hour ?? 9;
  const { state } = await loadState(env);
  const tz = state.timezone || env.MSB_TIMEZONE || 'Europe/Moscow';
  const nowHour = hourInTz(tz);
  const meta = await loadMeta(env);
  const day = new Date().toISOString().slice(0, 10);

  if (!force) {
    if (nowHour !== hour) return { sent: false, reason: 'wrong-hour' };
    if (meta.lastDigestAt?.startsWith(day)) return { sent: false, reason: 'already' };
  }

  const dig = await buildDigestText(env);
  if (dig.empty && !force) return { sent: false, reason: 'empty' };

  await api.sendMessage(adminId, dig.text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  meta.lastDigestAt = new Date().toISOString();
  await saveMeta(meta, env);
  log(`[msb/monitor] digest sent (${dig.count || 0})`);
  return { sent: true, count: dig.count || 0 };
}

export async function updateDigestSettings(patch, env = process.env) {
  const cfg = await loadMonitorConfig(env);
  cfg.digest = { ...cfg.digest, ...patch };
  await saveMonitorConfig(cfg, env);
  return cfg.digest;
}

function hourInTz(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'hour')?.value || 0);
  } catch {
    return new Date().getHours();
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
