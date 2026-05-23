export type ProjectStatus = 'pending' | 'cloning' | 'ready' | 'error';
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_input';

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

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result: string | null;
  is_error: boolean;
}

export interface FileChange {
  path: string;
  status: string;
} // status: A|M|D|R etc.

export interface FileChanges {
  base_sha: string | null;
  head_sha: string | null;
  files: FileChange[];
  stat: string;
  patch: string;
  patch_truncated: boolean;
}

export interface TaskResult {
  summary: string; // CC's final message text
  thinking: string[];
  tool_calls: ToolCall[];
  file_changes: FileChanges | null;
  num_turns: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  subtype: string | null; // result event subtype
}

export interface Task {
  id: string;
  project_id: string;
  prompt: string;
  status: TaskStatus;
  exit_code: number | null;
  output: string | null;
  error: string | null;
  session_id: string | null;
  result: TaskResult | null;
  branch: string | null;
  pr_url: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}
