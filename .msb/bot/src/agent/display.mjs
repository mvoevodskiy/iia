import fs from 'node:fs/promises';
import path from 'node:path';
import { botRoot, homeDir } from '../paths.mjs';
import { resolveEffort, resolveModel } from '../state.mjs';

const TITLES = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', qwen: 'Qwen' };

/** Display the same provider selection the CLI shim reads. Do not mutate state. */
export async function agentDisplay(state, env = process.env) {
  if (state.engine === 'oc') return { engine: 'OpenClaw', model: '—', effort: null };
  let store = {};
  try { store = JSON.parse(await fs.readFile(path.join(botRoot(env), 'ext-providers.json'), 'utf8')); }
  catch { /* standalone core has no extension */ }
  const provider = env.JARVIS_CC_ONLY === '1' ? 'claude' : store.active || state.extAuthBypass || 'claude';
  if (provider === 'claude') return { engine: 'Claude Code', model: resolveModel(state), effort: resolveEffort(state) };
  let native = {};
  if (provider === 'codex') {
    try {
      const text = (await fs.readFile(path.join(env.CODEX_HOME || path.join(homeDir(env), '.codex'), 'config.toml'), 'utf8')).split(/^\s*\[/m, 1)[0];
      for (const key of ['model', 'model_reasoning_effort']) {
        const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(\"(?:[^\"\\\\]|\\\\.)*\")`, 'm'));
        if (match) native[key] = JSON.parse(match[1]);
      }
    } catch { /* native config is optional */ }
  }
  const previous = state.lastCcUsage?.sessionId === state.ccSessionId ? state.lastCcUsage : null;
  return {
    engine: TITLES[provider] || provider,
    model: store.models?.[provider] || native.model || previous?.model || '—',
    effort: store.efforts?.[provider] || native.model_reasoning_effort || null,
  };
}
