import { spawn } from 'child_process';
import { mkdir, rm, writeFile, access } from 'fs/promises';
import { join, homedir } from 'path';
import * as queries from '../db/queries.js';
import type { Project } from '../types.js';

const PROJECTS_BASE = process.env.PROJECTS_BASE_DIR ?? join(homedir(), 'projects');

export function projectPath(name: string): string {
  return join(PROJECTS_BASE, name);
}

export async function ensureProjectsBase(): Promise<void> {
  await mkdir(PROJECTS_BASE, { recursive: true });
}

async function gitClone(repoUrl: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', repoUrl, targetPath], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

export async function writeEnvFile(
  localPath: string,
  envVars: Record<string, string>,
): Promise<void> {
  const content = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  await writeFile(join(localPath, '.env'), content, 'utf-8');
}

export async function setupProject(
  name: string,
  repoUrl: string,
  envVars: Record<string, string> = {},
): Promise<Project> {
  await ensureProjectsBase();
  const localPath = projectPath(name);

  const existing = await queries.getProjectByName(name);
  if (existing) {
    throw new Error(`Project "${name}" already exists`);
  }

  const project = await queries.createProject(name, repoUrl, localPath);

  // Clone in background, update status when done
  (async () => {
    try {
      await queries.updateProjectStatus(project.id, 'cloning');
      await gitClone(repoUrl, localPath);

      // Store env vars
      for (const [key, value] of Object.entries(envVars)) {
        await queries.setEnvVar(project.id, key, value);
      }

      // Write .env file
      if (Object.keys(envVars).length > 0) {
        await writeEnvFile(localPath, envVars);
      }

      await queries.updateProjectStatus(project.id, 'ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await queries.updateProjectStatus(project.id, 'error', msg);
    }
  })();

  return project;
}

export async function removeProject(name: string): Promise<void> {
  const project = await queries.getProjectByName(name);
  if (!project) throw new Error(`Project "${name}" not found`);

  try {
    await rm(project.local_path, { recursive: true, force: true });
  } catch {
    // Directory might not exist; proceed to DB cleanup
  }

  await queries.deleteProject(project.id);
}

export async function isProjectDirReady(localPath: string): Promise<boolean> {
  try {
    await access(localPath);
    return true;
  } catch {
    return false;
  }
}
