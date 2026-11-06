/**
 * Штатный e1() держит Setup Mode, пока нет Claude OAuth / Anthropic key / authMode.
 * Активный Cursor/Codex/Qwen с ключом должен считаться «подключённым», иначе
 * сообщения уходят в Ru() («AI ещё не подключён») и shim никогда не вызывается.
 *
 * Пишем в state.json authMode=subscription (+ маркер extAuthBypass), бандл не трогаем.
 */
import os from 'node:os';
import { getProvider } from './providers.mjs';
import { providerConfigured } from './env.mjs';
import { loadStore } from './store.mjs';
import { updateBotState } from './state-update.mjs';
import { currentSessionProvider, switchProviderSession } from './provider-sessions.mjs';

const MARK = '[msb/ext/setup-bypass]';
export const EXT_AUTH_FLAG = 'extAuthBypass';

async function hasClaudeCreds(env) {
  return !!(
    env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ||
    env.MSB_ANTHROPIC_API_KEY?.trim() ||
    env.ANTHROPIC_API_KEY?.trim()
  );
}

/**
 * Синхронизирует state.authMode с активным ext-провайдером.
 * @returns {{ changed: boolean, reason: string }}
 */
export async function syncExtAuthGate(env = process.env, home = os.homedir(), { activateCli = false } = {}) {
  let outcome;
  await updateBotState(async (state) => {
  const store = await loadStore(env, home);
  const provider = getProvider(store.active) || getProvider('claude');
  const previousProvider = currentSessionProvider(state);
  let sessionSwitched = false;

  if (state?.engine === 'oc' && !activateCli) {
    outcome = { changed: false, reason: 'oc-engine' };
    return null;
  }

  const configured = await providerConfigured(provider, env, home);
  const claudeOk = await hasClaudeCreds(env);
  // A transient loss of the selected CLI's credentials must not discard its
  // conversation. The adapter still reports missing auth on the next turn.
  if (provider.id !== 'claude' && !configured && state[EXT_AUTH_FLAG] === provider.id) {
    outcome = { changed: false, reason: 'active-provider-auth-missing' };
    return null;
  }
  let changed = false;
  let reason = 'noop';
  if (state.engine === 'oc' && activateCli && provider.id !== 'claude' && configured) {
    state.engine = 'cc';
    switchProviderSession(state, previousProvider, provider.id);
    sessionSwitched = true;
    changed = true;
    reason = 'select-cli-engine';
  }

  if (provider.id !== 'claude' && configured) {
    if (state.authMode !== 'subscription' || !state.hasSubscriptionAuth || state[EXT_AUTH_FLAG] !== provider.id || previousProvider !== provider.id) {
      state.authMode = 'subscription';
      state.hasSubscriptionAuth = true;
      // Each CLI resumes only its own previously parked conversation.
      if (!sessionSwitched && previousProvider !== provider.id) {
        switchProviderSession(state, previousProvider, provider.id);
      }
      state[EXT_AUTH_FLAG] = provider.id;
      changed = true;
      reason = `bypass:${provider.id}`;
    }
  } else if (state[EXT_AUTH_FLAG]) {
    // Сняли ext-байпас: либо снова Claude, либо ключ пропал.
    // Never give Claude a foreign CLI session; restore its own if parked.
    if (provider.id === 'claude') {
      switchProviderSession(state, previousProvider, 'claude');
    } else if (state.ccSessionId) delete state.ccSessionId;
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
    switchProviderSession(state, previousProvider, 'claude');
    changed = true;
    reason = 'drop-foreign-ext-session';
  }

  if (changed) {
    console.error(`${MARK} ${reason}`);
  }
  outcome = { changed, reason };
  return changed ? state : null;
  }, env, home);
  return outcome;
}
