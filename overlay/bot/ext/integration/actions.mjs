/**
 * Изменение сохранённого режима без renderer-побочных действий.
 * Навигация: [Обвязка](../README.md).
 */
import os from 'node:os';
import { updateBotState } from '../state-update.mjs';
import { loadStore } from '../store.mjs';

export async function writeBotPermissionMode(mode, env = process.env, home = os.homedir()) {
  return updateBotState(async (state) => {
    state.permissionMode = mode;
    // Codex does not consume this UI setting; keep its native conversation.
    if (state.ccSessionId && (await loadStore(env, home)).active !== 'codex') delete state.ccSessionId;
    return state;
  }, env, home);
}
