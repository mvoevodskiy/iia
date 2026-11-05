import fs from 'node:fs/promises';
import path from 'node:path';
import { workspaceDir } from '../paths.mjs';

const FILES = ['SOUL.md', 'CLAUDE.md', 'USER.md', 'MEMORY.md', 'TELEGRAM-TOOLS.md'];

/**
 * Собирает append-system-prompt из workspace (как context-loader закрытого ядра, упрощённо).
 */
export async function buildSystemPrompt({ workspace = workspaceDir(), extra = '' } = {}) {
  const chunks = [];
  for (const name of FILES) {
    try {
      const text = await fs.readFile(path.join(workspace, name), 'utf8');
      if (text.trim()) chunks.push(`# ${name}\n\n${text.trim()}`);
    } catch {
      /* optional */
    }
  }
  chunks.push(
    [
      '# Runtime',
      'Ты работаешь как личный агент владельца в Telegram через MSB open-core.',
      'Отвечай на русском, если владелец не попросил иное.',
      'Рабочий каталог — workspace сервера. Проекты — в ~/projects/.',
      'Не выдумывай секреты и чужие продукты. На необратимом — спроси.',
    ].join('\n'),
  );
  if (extra) chunks.push(extra);
  return chunks.join('\n\n');
}
