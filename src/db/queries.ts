import { getPool } from './client.js';
import type {
  Project,
  Task,
  ProjectStatus,
  TaskStatus,
  TaskResult,
} from '../types.js';

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

// ─── Scheduler / orchestration ─────────────────────────────────────────────────

export async function claimNextQueuedTask(): Promise<Task | null> {
  const pool = getPool();
  const res = await pool.query<Task>(
    `UPDATE tasks SET status = 'running', started_at = NOW()
     WHERE id = (
       SELECT id FROM tasks WHERE status = 'queued'
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
  );
  return res.rows[0] ?? null;
}

export async function setTaskSession(
  id: string,
  session_id: string,
): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE tasks SET session_id = $1 WHERE id = $2', [
    session_id,
    id,
  ]);
}

export interface FinalizeTaskFields {
  status: TaskStatus;
  exit_code: number | null;
  output: string;
  result: TaskResult | null;
  branch: string | null;
  pr_url: string | null;
  error?: string;
}

export async function finalizeTask(
  id: string,
  fields: FinalizeTaskFields,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE tasks
     SET status = $1,
         exit_code = $2,
         output = $3,
         result = $4::jsonb,
         branch = $5,
         pr_url = $6,
         error = $7,
         completed_at = NOW()
     WHERE id = $8`,
    [
      fields.status,
      fields.exit_code,
      fields.output,
      fields.result ? JSON.stringify(fields.result) : null,
      fields.branch,
      fields.pr_url,
      fields.error ?? null,
      id,
    ],
  );
}

export async function markTaskRunning(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE tasks
     SET status = 'running', started_at = COALESCE(started_at, NOW())
     WHERE id = $1`,
    [id],
  );
}

export async function resetOrphanedRunningTasks(): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    `UPDATE tasks
     SET status = 'failed', error = 'orphaned by server restart', completed_at = NOW()
     WHERE status = 'running'`,
  );
  return res.rowCount ?? 0;
}

export async function getTaskCounts(): Promise<{
  queued: number;
  running: number;
}> {
  const pool = getPool();
  const res = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) AS count FROM tasks
     WHERE status IN ('queued', 'running')
     GROUP BY status`,
  );
  let queued = 0;
  let running = 0;
  for (const row of res.rows) {
    if (row.status === 'queued') queued = Number(row.count);
    else if (row.status === 'running') running = Number(row.count);
  }
  return { queued, running };
}
