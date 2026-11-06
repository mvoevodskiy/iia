/**
 * MCP и связанные workspace callbacks.
 * Навигация: [Telegram](../README.md).
 */
import { mcpAddScreen, mcpWorkspaceScreen, placeholder } from '../screens.mjs';
import { UNHANDLED } from './shared.mjs';

export async function handleWorkspaceRoute({ data, show }) {
  // —— mcp ——
  if (data === 'mcp:folder:workspace') return show(mcpWorkspaceScreen());
  if (data === 'mcp:add') return show(mcpAddScreen());
  if (data.startsWith('mcp:setup:') || data.startsWith('mcp:server:') || data.startsWith('mcp:')) {
    return show(placeholder('MCP', 'menu:mcp'));
  }

  return UNHANDLED;
}
