import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { join, homedir } from 'path';
import * as queries from '../db/queries.js';
import { writeEnvFile } from './project-manager.js';
import type { Task } from '../types.js';

const PROJECTS_BASE = process.env.PROJECTS_BASE_DIR ?? join(homedir(), 'projects');
const TASK_OUTPUTS_DIR = join(PROJECTS_BASE, '.task-outputs');

export async function ensureOutputsDir(): Promise<void> {
  await mkdir(TASK_OUTPUTS_DIR, { recursive: true });
}

function outputFilePath(taskId: string): string {
  return join(TASK_OUTPUTS_DIR, `${taskId}.txt`);
}

async function spawnClaudeCode(
  task: Task,
  projectPath: string,
  envVars: Record<string, string>,
): Promise<void> {
  await queries.updateTaskRunning(task.id);

  const outputPath = outputFilePath(task.id);
  const outputChunks: Buffer[] = [];

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...envVars,
      HOME: process.env.HOME ?? homedir(),
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    };

    const proc = spawn(
      'claude',
      ['-p', task.prompt, '--dangerously-skip-permissions'],
      {
        cwd: projectPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    proc.stdout.on('data', (chunk: Buffer) => outputChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => outputChunks.push(chunk));

    proc.on('close', async (code) => {
      const output = Buffer.concat(outputChunks).toString('utf-8');
      const exitCode = code ?? 1;

      try {
        await writeFile(outputPath, output, 'utf-8');
        await queries.updateTaskCompleted(task.id, exitCode, output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await queries.updateTaskFailed(task.id, msg);
      }

      resolve();
    });

    proc.on('error', async (err) => {
      await queries.updateTaskFailed(task.id, err.message);
      resolve();
    });
  });
}

export async function submitTask(
  projectName: string,
  prompt: string,
): Promise<Task> {
  await ensureOutputsDir();

  const project = await queries.getProjectByName(projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);
  if (project.status !== 'ready') {
    throw new Error(
      `Project "${projectName}" is not ready (status: ${project.status})`,
    );
  }

  const task = await queries.createTask(project.id, prompt);
  const envVars = await queries.getEnvVars(project.id);

  // Refresh .env file before running
  if (Object.keys(envVars).length > 0) {
    await writeEnvFile(project.local_path, envVars);
  }

  // Fire and forget — don't await
  spawnClaudeCode(task, project.local_path, envVars).catch((err) => {
    console.error(`Task ${task.id} spawn error:`, err);
  });

  return task;
}

export function buildTaskCheckResponse(task: Task): Record<string, unknown> {
  const isTerminal = task.status === 'completed' || task.status === 'failed';

  if (!isTerminal) {
    const elapsed = task.started_at
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : 0;
    return {
      ready: false,
      task_id: task.id,
      status: task.status,
      elapsed_seconds: elapsed,
      created_at: task.created_at,
    };
  }

  return {
    ready: true,
    task_id: task.id,
    status: task.status,
    exit_code: task.exit_code,
    output: task.output,
    error: task.error,
    created_at: task.created_at,
    started_at: task.started_at,
    completed_at: task.completed_at,
  };
}
