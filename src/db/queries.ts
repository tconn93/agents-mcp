import { getPool } from './client.js';
import type { Project, Task, ProjectStatus, TaskStatus } from '../types.js';

// ─── Projects ────────────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  repo_url: string,
  local_path: string,
): Promise<Project> {
  const pool = getPool();
  const res = await pool.query<Project>(
    `INSERT INTO projects (name, repo_url, local_path)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, repo_url, local_path],
  );
  return res.rows[0];
}

export async function getProjectByName(name: string): Promise<Project | null> {
  const pool = getPool();
  const res = await pool.query<Project>(
    'SELECT * FROM projects WHERE name = $1',
    [name],
  );
  return res.rows[0] ?? null;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const pool = getPool();
  const res = await pool.query<Project>(
    'SELECT * FROM projects WHERE id = $1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
  error?: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE projects SET status = $1, error = $2, updated_at = NOW() WHERE id = $3`,
    [status, error ?? null, id],
  );
}

export async function listProjects(): Promise<Project[]> {
  const pool = getPool();
  const res = await pool.query<Project>(
    'SELECT * FROM projects ORDER BY created_at DESC',
  );
  return res.rows;
}

export async function deleteProject(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM projects WHERE id = $1', [id]);
}

// ─── Env Vars ─────────────────────────────────────────────────────────────────

export async function setEnvVar(
  project_id: string,
  key: string,
  value: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO project_env_vars (project_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [project_id, key, value],
  );
}

export async function getEnvVars(
  project_id: string,
): Promise<Record<string, string>> {
  const pool = getPool();
  const res = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM project_env_vars WHERE project_id = $1',
    [project_id],
  );
  return Object.fromEntries(res.rows.map((r) => [r.key, r.value]));
}

export async function deleteEnvVar(
  project_id: string,
  key: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    'DELETE FROM project_env_vars WHERE project_id = $1 AND key = $2',
    [project_id, key],
  );
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(
  project_id: string,
  prompt: string,
): Promise<Task> {
  const pool = getPool();
  const res = await pool.query<Task>(
    `INSERT INTO tasks (project_id, prompt) VALUES ($1, $2) RETURNING *`,
    [project_id, prompt],
  );
  return res.rows[0];
}

export async function getTask(id: string): Promise<Task | null> {
  const pool = getPool();
  const res = await pool.query<Task>('SELECT * FROM tasks WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function updateTaskRunning(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
    [id],
  );
}

export async function updateTaskCompleted(
  id: string,
  exit_code: number,
  output: string,
): Promise<void> {
  const pool = getPool();
  const status: TaskStatus = exit_code === 0 ? 'completed' : 'failed';
  await pool.query(
    `UPDATE tasks
     SET status = $1, exit_code = $2, output = $3, completed_at = NOW()
     WHERE id = $4`,
    [status, exit_code, output, id],
  );
}

export async function updateTaskFailed(
  id: string,
  error: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE tasks
     SET status = 'failed', error = $1, completed_at = NOW()
     WHERE id = $2`,
    [error, id],
  );
}

export async function listTasks(project_id?: string): Promise<Task[]> {
  const pool = getPool();
  if (project_id) {
    const res = await pool.query<Task>(
      'SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC',
      [project_id],
    );
    return res.rows;
  }
  const res = await pool.query<Task>(
    'SELECT * FROM tasks ORDER BY created_at DESC',
  );
  return res.rows;
}
