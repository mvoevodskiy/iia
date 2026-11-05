/**
 * Обход известного сбоя Responses WebSocket у Codex CLI:
 * "websocket closed by server before response.completed" / Reconnecting 5/5.
 *
 * Встроенный provider `openai` нельзя отключить от WS, поэтому заводим
 * кастомный HTTP-only provider и направляем bot-ходы на него.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexAuthPath, codexConfigPath, parseCodexTomlScalars } from './codex-native.mjs';

export const MSB_HTTP_PROVIDER_ID = 'msb_http';

const CHATGPT_BASE = 'https://chatgpt.com/backend-api/codex';
const API_BASE = 'https://api.openai.com/v1';

const MARK_BEGIN = '# BEGIN msb-ext codex-http';
const MARK_END = '# END msb-ext codex-http';

async function detectAuthMode(home) {
  try {
    const data = JSON.parse(await fs.readFile(codexAuthPath(home), 'utf8'));
    if (data?.auth_mode === 'api_key' || data?.OPENAI_API_KEY) return 'api';
    if (data?.tokens || data?.auth_mode === 'chatgpt' || data?.auth_mode === 'AccessToken') {
      return 'chatgpt';
    }
  } catch {
    /* ignore */
  }
  return 'chatgpt';
}

function providerBlock(baseUrl) {
  return [
    MARK_BEGIN,
    `# HTTP-only: без Responses WebSocket (см. openai/codex#20739, #22634)`,
    `model_provider = "${MSB_HTTP_PROVIDER_ID}"`,
    'stream_idle_timeout_ms = 600000',
    '',
    `[model_providers.${MSB_HTTP_PROVIDER_ID}]`,
    'name = "MSB HTTP (no websocket)"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    'supports_websockets = false',
    MARK_END,
    '',
  ].join('\n');
}

/**
 * Пишет/обновляет HTTP-only provider в ~/.codex/config.toml.
 * Не затирает чужие секции; свой блок между маркерами заменяет целиком.
 * @returns {Promise<{ok:boolean, providerId:string, baseUrl:string, changed:boolean}>}
 */
export async function ensureCodexStableTransport(home = os.homedir()) {
  const file = codexConfigPath(home);
  const authMode = await detectAuthMode(home);
  const baseUrl = authMode === 'api' ? API_BASE : CHATGPT_BASE;
  const block = providerBlock(baseUrl);

  let text = '';
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }

  const scalars = parseCodexTomlScalars(text);
  const currentProvider = scalars.model_provider || 'openai';
  // Не перехватываем ollama/lmstudio/custom — только дефолтный openai и наш msb_http.
  const managed =
    !currentProvider ||
    ['openai', MSB_HTTP_PROVIDER_ID, 'chatgpt', 'chatgpt-http', 'openai_http'].includes(currentProvider);

  let next = text;
  const begin = next.indexOf(MARK_BEGIN);
  const end = next.indexOf(MARK_END);
  if (begin >= 0 && end > begin) {
    const after = end + MARK_END.length;
    next = `${next.slice(0, begin).trimEnd()}\n\n${block}${next.slice(after).replace(/^\n+/, '')}`;
  } else if (managed) {
    // Уберём одиночный model_provider = "openai", если был — блок задаст свой.
    next = next.replace(/^model_provider\s*=\s*"[^"]*"\s*\n?/m, '');
    next = `${next.trimEnd()}\n\n${block}`;
  } else {
    // Чужой provider: только увеличим idle timeout, WS не трогаем.
    if (!/^stream_idle_timeout_ms\s*=/m.test(next)) {
      next = `${next.trimEnd()}\n\nstream_idle_timeout_ms = 600000\n`;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next, { mode: 0o600 });
    await fs.rename(tmp, file);
    return {
      ok: true,
      providerId: currentProvider,
      baseUrl: null,
      changed: next !== text,
      skippedProviderSwitch: true,
    };
  }

  const changed = next !== text;
  if (changed) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next, { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  return {
    ok: true,
    providerId: managed ? MSB_HTTP_PROVIDER_ID : currentProvider,
    baseUrl: managed ? baseUrl : null,
    changed,
    skippedProviderSwitch: !managed,
  };
}

/** CLI `-c` для хода бота: принудительно HTTP-only, если блок msb_http на месте. */
export function codexHttpProviderOverrides(force = true) {
  if (!force) return [];
  return ['-c', `model_provider=${JSON.stringify(MSB_HTTP_PROVIDER_ID)}`];
}
