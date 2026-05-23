import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { createWriteStream } from 'fs';
import { config } from '../config.js';
import type { ToolCall } from '../types.js';

export interface CcRunOptions {
  prompt: string;
  cwd: string;
  env: Record<string, string>;
  rawOutputPath: string; // write raw JSONL here
  resumeSessionId?: string; // if set, resume instead of fresh
  onChild?: (child: ChildProcess) => void; // hand back child for cancel/timeout
}

export interface CcRunResult {
  sessionId: string | null;
  summary: string;
  thinking: string[];
  toolCalls: ToolCall[];
  numTurns: number | null;
  costUsd: number | null;
  durationMs: number | null;
  subtype: string | null;
  isError: boolean;
  exitCode: number;
}

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface CcEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  duration_ms?: number;
  is_error?: boolean;
  message?: { content?: ContentBlock[] };
}

function normalizeToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === 'object') {
          const b = block as ContentBlock;
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
        }
        if (typeof block === 'string') return block;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

export function runClaudeCode(opts: CcRunOptions): Promise<CcRunResult> {
  return new Promise((resolve) => {
    const args: string[] = [];
    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId);
    }
    args.push(
      '-p',
      opts.prompt,
      '--dangerously-skip-permissions',
      '--output-format',
      'stream-json',
      '--verbose',
      ...config.ccExtraArgs,
    );

    let sessionId: string | null = null;
    const texts: string[] = [];
    const thinking: string[] = [];
    const toolCalls: ToolCall[] = [];
    const toolIndexById = new Map<string, number>();
    let summary = '';
    let numTurns: number | null = null;
    let costUsd: number | null = null;
    let durationMs: number | null = null;
    let subtype: string | null = null;
    let isError = false;
    let sawResult = false;

    const logStream = createWriteStream(opts.rawOutputPath, { flags: 'w' });

    const child = spawn(config.ccBin, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (opts.onChild) opts.onChild(child);

    let lineBuffer = '';

    const handleLine = (raw: string): void => {
      const line = raw.trim();
      if (!line) return;
      let event: CcEvent;
      try {
        event = JSON.parse(line) as CcEvent;
      } catch {
        return; // ignore parse failures
      }

      switch (event.type) {
        case 'system': {
          if (event.subtype === 'init' && event.session_id) {
            sessionId = event.session_id;
          }
          break;
        }
        case 'assistant': {
          const blocks = event.message?.content ?? [];
          for (const block of blocks) {
            if (block.type === 'text' && typeof block.text === 'string') {
              texts.push(block.text);
            } else if (
              block.type === 'thinking' &&
              typeof block.thinking === 'string'
            ) {
              thinking.push(block.thinking);
            } else if (block.type === 'tool_use' && block.id) {
              toolCalls.push({
                id: block.id,
                name: block.name ?? '',
                input: block.input,
                result: null,
                is_error: false,
              });
              toolIndexById.set(block.id, toolCalls.length - 1);
            }
          }
          break;
        }
        case 'user': {
          const blocks = event.message?.content ?? [];
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const idx = toolIndexById.get(block.tool_use_id);
              if (idx !== undefined) {
                toolCalls[idx].result = normalizeToolResultContent(
                  block.content,
                );
                toolCalls[idx].is_error = !!block.is_error;
              }
            }
          }
          break;
        }
        case 'result': {
          sawResult = true;
          summary = event.result ?? '';
          numTurns = event.num_turns ?? null;
          costUsd = event.total_cost_usd ?? null;
          durationMs = event.duration_ms ?? null;
          subtype = event.subtype ?? null;
          isError = !!event.is_error;
          if (event.session_id) sessionId = event.session_id;
          break;
        }
        default:
          break;
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      logStream.write(str);
      lineBuffer += str;
      let newlineIdx: number;
      while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);
        handleLine(line);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      logStream.write('[stderr] ' + chunk.toString('utf-8'));
    });

    const finish = (exitCode: number): void => {
      // Flush any trailing buffered line.
      if (lineBuffer.trim()) {
        handleLine(lineBuffer);
        lineBuffer = '';
      }
      if (!sawResult) {
        summary = texts.join('\n\n');
      }
      const finalIsError = isError || exitCode !== 0;
      logStream.end();
      resolve({
        sessionId,
        summary,
        thinking,
        toolCalls,
        numTurns,
        costUsd,
        durationMs,
        subtype,
        isError: finalIsError,
        exitCode,
      });
    };

    child.on('close', (code) => {
      finish(code ?? 1);
    });

    child.on('error', (err) => {
      summary = err.message;
      isError = true;
      logStream.write('[spawn-error] ' + err.message);
      logStream.end();
      resolve({
        sessionId,
        summary,
        thinking,
        toolCalls,
        numTurns,
        costUsd,
        durationMs,
        subtype,
        isError: true,
        exitCode: 1,
      });
    });
  });
}
