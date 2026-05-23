import { spawn } from 'child_process';
import { config } from '../config.js';
import type { FileChange, FileChanges } from '../types.js';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command via spawn with an args array (no shell interpolation).
 * Never rejects on a nonzero exit code — resolves with {code, stdout, stderr}.
 * Rejects only when the process cannot be spawned at all (resolved as code 127).
 */
function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf-8');
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });
    child.on('error', (err) => {
      resolve({ code: 127, stdout, stderr: stderr + String(err.message) });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function currentBranch(cwd: string): Promise<string> {
  const res = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return res.stdout.trim();
}

export async function currentCommit(cwd: string): Promise<string | null> {
  const res = await run('git', ['rev-parse', 'HEAD'], cwd);
  if (res.code !== 0) return null;
  const sha = res.stdout.trim();
  return sha.length > 0 ? sha : null;
}

export async function parseRemote(
  cwd: string,
): Promise<{ owner: string; repo: string } | null> {
  const res = await run('git', ['remote', 'get-url', 'origin'], cwd);
  if (res.code !== 0) return null;
  const url = res.stdout.trim();
  if (!url) return null;

  // SSH form: git@github.com:owner/repo.git
  const ssh = url.match(/^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2] };
  }
  // HTTPS form: https://github.com/owner/repo.git
  const https = url.match(/^https?:\/\/[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) {
    return { owner: https[1], repo: https[2] };
  }
  return null;
}

export async function stageAll(cwd: string): Promise<void> {
  await run('git', ['add', '-A'], cwd);
}

export async function computeFileChanges(
  cwd: string,
  baseSha: string | null,
): Promise<FileChanges> {
  await stageAll(cwd);

  const nameStatus = await run('git', ['diff', '--cached', '--name-status'], cwd);
  const files: FileChange[] = [];
  for (const line of nameStatus.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const status = tokens[0];
    const path = tokens[tokens.length - 1];
    files.push({ status, path });
  }

  const statRes = await run('git', ['diff', '--cached', '--stat'], cwd);
  const patchRes = await run('git', ['diff', '--cached'], cwd);

  let patch = patchRes.stdout;
  let patch_truncated = false;
  if (patch.length > config.maxPatchBytes) {
    patch = patch.slice(0, config.maxPatchBytes);
    patch_truncated = true;
  }

  return {
    base_sha: baseSha,
    head_sha: null,
    files,
    stat: statRes.stdout,
    patch,
    patch_truncated,
  };
}

export async function createBranch(cwd: string, branch: string): Promise<void> {
  const res = await run('git', ['checkout', '-b', branch], cwd);
  if (res.code !== 0) {
    // Branch likely already exists; switch to it.
    await run('git', ['checkout', branch], cwd);
  }
}

export async function commitAll(
  cwd: string,
  message: string,
): Promise<string | null> {
  await stageAll(cwd);
  const res = await run(
    'git',
    [
      '-c',
      'user.email=agents-mcp@local',
      '-c',
      'user.name=agents-mcp',
      'commit',
      '-m',
      message,
    ],
    cwd,
  );
  const combined = `${res.stdout}\n${res.stderr}`;
  if (/nothing to commit/i.test(combined)) {
    return null;
  }
  if (res.code !== 0) {
    return null;
  }
  return currentCommit(cwd);
}

export async function push(
  cwd: string,
  branch: string,
): Promise<{ ok: boolean; stderr: string }> {
  const res = await run('git', ['push', '-u', 'origin', branch], cwd);
  return { ok: res.code === 0, stderr: res.stderr };
}

export interface OpenPrOptions {
  branch: string;
  base: string;
  title: string;
  body: string;
}

export interface OpenPrResult {
  pr_url: string | null;
  compare_url: string | null;
  method: 'gh' | 'compare' | 'none';
  detail: string;
}

export async function openPr(
  cwd: string,
  opts: OpenPrOptions,
): Promise<OpenPrResult> {
  const gh = await run(
    'gh',
    [
      'pr',
      'create',
      '--base',
      opts.base,
      '--head',
      opts.branch,
      '--title',
      opts.title,
      '--body',
      opts.body,
    ],
    cwd,
  );

  if (gh.code === 0) {
    const urlMatch = gh.stdout.match(/https?:\/\/\S+/);
    return {
      pr_url: urlMatch ? urlMatch[0].trim() : null,
      compare_url: null,
      method: 'gh',
      detail: gh.stdout.trim(),
    };
  }

  // gh missing or failed — fall back to a compare URL if we can parse the remote.
  const remote = await parseRemote(cwd);
  if (remote) {
    const compare_url = `https://github.com/${remote.owner}/${remote.repo}/compare/${opts.base}...${opts.branch}?expand=1`;
    return {
      pr_url: null,
      compare_url,
      method: 'compare',
      detail: gh.stderr.trim(),
    };
  }

  return {
    pr_url: null,
    compare_url: null,
    method: 'none',
    detail: gh.stderr.trim(),
  };
}
