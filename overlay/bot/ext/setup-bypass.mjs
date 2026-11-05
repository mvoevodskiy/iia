/**
 * Штатный e1() держит Setup Mode, пока нет Claude OAuth / Anthropic key / authMode.
 * Активный Cursor/Codex/Qwen с ключом должен считаться «подключённым», иначе
 * сообщения уходят в Ru() («AI ещё не подключён») и shim никогда не вызывается.
 *
 * Пишем в state.json authMode=subscription (+ маркер extAuthBypass), бандл не трогаем.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getProvider } from './providers.mjs';
import { providerConfigured } from './env.mjs';
import { loadStore } from './store.mjs';
import { botStatePath } from './paths.mjs';

const MARK = '[iia/ext/setup-bypass]';
export const EXT_AUTH_FLAG = 'extAuthBypass';

async function readState(env, home) {
  const file = botStatePath(env, home);
  try {
    return { file, state: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (err) {
    if (err?.code === 'ENOENT') return { file, state: {} };
    throw err;
  }
}

async function writeState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function hasClaudeCreds(env) {
  return !!(
    env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ||
    env.IIA_ANTHROPIC_API_KEY?.trim() ||
    env.ANTHROPIC_API_KEY?.trim()
  );
}

/**
 * Синхронизирует state.authMode с активным ext-провайдером.
 * @returns {{ changed: boolean, reason: string }}
 */
export async function syncExtAuthGate(env = process.env, home = os.homedir()) {
  const store = await loadStore(env, home);
  const provider = getProvider(store.active) || getProvider('claude');
  const { file, state } = await readState(env, home);

  if (state?.engine === 'oc') {
    return { changed: false, reason: 'oc-engine' };
  }

  const configured = await providerConfigured(provider, env, home);
  const claudeOk = await hasClaudeCreds(env);
  let changed = false;
  let reason = 'noop';

  if (provider.id !== 'claude' && configured) {
    if (state.authMode !== 'subscription' || !state.hasSubscriptionAuth || state[EXT_AUTH_FLAG] !== provider.id) {
      state.authMode = 'subscription';
      state.hasSubscriptionAuth = true;
      // Смена канала — новая сессия чата (старый ccSessionId от Claude/другого CLI невалиден).
      if (state[EXT_AUTH_FLAG] !== provider.id && state.ccSessionId) {
        delete state.ccSessionId;
      }
      state[EXT_AUTH_FLAG] = provider.id;
      changed = true;
      reason = `bypass:${provider.id}`;
    }
  } else if (state[EXT_AUTH_FLAG]) {
    // Сняли ext-байпас: либо снова Claude, либо ключ пропал.
    // Чужой ext session id нельзя оставлять — Claude CLI его не понимает.
    if (state.ccSessionId) delete state.ccSessionId;
    delete state[EXT_AUTH_FLAG];
    if (!claudeOk && provider.id === 'claude') {
      if (state.authMode === 'subscription') delete state.authMode;
      if (state.hasSubscriptionAuth) delete state.hasSubscriptionAuth;
      reason = 'clear-bypass-need-claude-setup';
    } else {
      reason = 'clear-bypass-flag';
    }
    changed = true;
  } else if (provider.id === 'claude' && typeof state.ccSessionId === 'string' && state.ccSessionId.startsWith('ext:')) {
    delete state.ccSessionId;
    changed = true;
    reason = 'drop-foreign-ext-session';
  }

  if (changed) {
    await writeState(file, state);
    console.error(`${MARK} ${reason}`);
  }
  return { changed, reason };
}
