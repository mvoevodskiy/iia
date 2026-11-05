/**
 * Запуск Claude Code CLI в режиме stream-json.
 * Контракт совместим с закрытым [iia/agent-cc] и overlay shim (PATH→claude).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { workspaceDir } from '../paths.mjs';

const DEFAULT_MAX_TURNS = 200;
const PROMPT_FILE_THRESHOLD = 40 * 1024;

/**
 * @typedef {object} ClaudeTurnOptions
 * @property {string} prompt
 * @property {string} [sessionId]
 * @property {string} [model]
 * @property {string} [effort]
 * @property {string} [permissionMode]
 * @property {string} [systemPrompt]
 * @property {string[]} [allowedTools]
 * @property {string[]} [disallowedTools]
 * @property {AbortSignal} [signal]
 * @property {string} [cwd]
 * @property {(ev: object) => void} [onEvent]
 * @property {boolean} [autonomy]
 */

/**
 * @param {ClaudeTurnOptions} opts
 */
export async function runClaudeTurn(opts) {
  const cwd = opts.cwd || workspaceDir();
  const permissionMode = opts.permissionMode || 'bypassPermissions';
  const maxTurns = opts.autonomy ? 50 : DEFAULT_MAX_TURNS;

  const allowed =
    opts.allowedTools?.length > 0
      ? opts.allowedTools.join(',')
      : 'Bash,WebSearch,WebFetch,Agent,Task,Workflow,Monitor,Skill,Read,Edit,Write,Glob,Grep';

  /** @type {string[]} */
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(maxTurns),
    '--permission-mode',
    permissionMode,
    '--allowedTools',
    allowed,
  ];

  const denied = [
    ...(opts.disallowedTools || []),
    // зеркало Dn(): не трогать секреты/ядро через tools без явного override
  ];
  if (denied.length) {
    args.push('--disallowedTools', ...denied);
  }

  let sysPromptFile = null;
  if (opts.systemPrompt) {
    const bytes = Buffer.byteLength(opts.systemPrompt, 'utf8');
    if (bytes > PROMPT_FILE_THRESHOLD) {
      sysPromptFile = path.join(
        os.tmpdir(),
        `iia-cc-system-prompt-${process.pid}-${Date.now().toString(36)}.md`,
      );
      await fs.writeFile(sysPromptFile, opts.systemPrompt, { mode: 0o600 });
      args.push('--append-system-prompt-file', sysPromptFile);
    } else {
      args.push('--append-system-prompt', opts.systemPrompt);
    }
  }

  if (opts.model) args.push('--model', opts.model);
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.sessionId) args.push('--resume', opts.sessionId);

  const promptBytes = Buffer.byteLength(opts.prompt || '', 'utf8');
  if (promptBytes > 9 * 1024 * 1024) {
    throw new Error(`MESSAGE_TOO_LARGE:${(promptBytes / 1024 / 1024).toFixed(1)}`);
  }

  console.error(
    `[iia/agent-cc] Spawning: claude ${args.slice(0, 3).join(' ')}... (session=${(opts.sessionId || 'new').slice(0, 8)}, model=${opts.model || 'default'}, prompt=${promptBytes}B)`,
  );

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('claude', args, {
        cwd,
        env: {
          ...process.env,
          CI: '1',
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '200000',
          CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || '90',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });
    } catch (err) {
      cleanup();
      if (err?.code === 'ENOENT') {
        return reject(new Error('Claude Code CLI не установлен'));
      }
      return reject(err);
    }

    child.stdin?.on('error', () => {});
    child.stdin?.end(opts.prompt || '');

    const onAbort = () => {
      try {
        child.kill('SIGINT');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGTERM');
        } catch {
          try {
            child.kill('SIGTERM');
          } catch {
            /* ignore */
          }
        }
      }, 2000).unref?.();
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    let stdoutBuf = '';
    let stderr = '';
    let sessionId = opts.sessionId || '';
    let text = '';
    let model;
    let subtype;
    let isError = false;
    let inputTokens = 0;
    let outputTokens = 0;
    const toolsUsed = [];
    let toolCount = 0;

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        const ev = parseStreamLine(line);
        if (!ev) continue;
        opts.onEvent?.(ev);
        switch (ev.type) {
          case 'system':
            if (ev.subtype === 'init') {
              if (ev.session_id) sessionId = ev.session_id;
              if (ev.model) model = ev.model;
            }
            break;
          case 'assistant': {
            const msg = ev.message;
            if (msg?.usage) {
              if (typeof msg.usage.input_tokens === 'number') inputTokens = msg.usage.input_tokens;
              if (typeof msg.usage.output_tokens === 'number') outputTokens = msg.usage.output_tokens;
            }
            for (const part of msg?.content || []) {
              if (part.type === 'text' && part.text) text += part.text;
              if (part.type === 'tool_use' && part.name) {
                toolCount += 1;
                if (!toolsUsed.includes(part.name)) toolsUsed.push(part.name);
              }
            }
            break;
          }
          case 'result':
            if (ev.session_id) sessionId = ev.session_id;
            if (ev.subtype) subtype = ev.subtype;
            if (typeof ev.is_error === 'boolean') isError = ev.is_error;
            if (typeof ev.result === 'string' && ev.result && !text) text = ev.result;
            if (ev.usage) {
              if (typeof ev.usage.input_tokens === 'number') inputTokens = ev.usage.input_tokens;
              if (typeof ev.usage.output_tokens === 'number') outputTokens = ev.usage.output_tokens;
            }
            break;
          default:
            break;
        }
      }
    });

    child.on('error', (err) => {
      cleanup();
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', (code, signal) => {
      cleanup();
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      console.error(
        `[iia/agent-cc] Process closed: code=${code}, signal=${signal ?? '-'}, tools=${toolCount}, stderr=${stderr.slice(0, 200)}`,
      );
      resolve({
        sessionId,
        text: text.trim(),
        model,
        subtype,
        isError: isError || code !== 0,
        exitCode: code,
        signal,
        aborted: Boolean(opts.signal?.aborted),
        usage: { inputTokens, outputTokens },
        toolsUsed,
        toolCount,
        stderr: stderr.slice(0, 4000),
      });
    });

    function cleanup() {
      if (sysPromptFile) fs.unlink(sysPromptFile).catch(() => {});
    }
  });
}

function parseStreamLine(line) {
  const A = line.trim();
  if (!A) return null;
  try {
    const Q = JSON.parse(A);
    if (Q && typeof Q.type === 'string') return Q;
    console.error(`[iia/agent-cc] stream-json line without 'type' field: ${A.slice(0, 200)}`);
    return null;
  } catch (err) {
    console.error(`[iia/agent-cc] stream-json parse failed (${err.message}): ${A.slice(0, 200)}`);
    return null;
  }
}
