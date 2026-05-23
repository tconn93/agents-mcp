export type ProjectStatus = 'pending' | 'cloning' | 'ready' | 'error';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  local_path: string;
  status: ProjectStatus;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  project_id: string;
  prompt: string;
  status: TaskStatus;
  exit_code: number | null;
  output: string | null;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}
