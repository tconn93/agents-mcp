import { homedir } from 'os';
import { join } from 'path';

const projectsBaseDir =
  process.env.PROJECTS_BASE_DIR ?? join(homedir(), 'projects');

export const config = {
  projectsBaseDir,
  taskOutputsDir: join(projectsBaseDir, '.task-outputs'),
  maxConcurrentTasks: Number(process.env.MAX_CONCURRENT_TASKS ?? 5),
  taskTimeoutMs: Number(process.env.TASK_TIMEOUT_MS ?? 1800000), // 30 min
  goalPrefix: process.env.GOAL_PREFIX ?? '/goal ',
  ccBin: process.env.CC_BIN ?? 'claude',
  ccExtraArgs: (process.env.CC_EXTRA_ARGS ?? '').split(' ').filter(Boolean),
  autoPr: (process.env.AUTO_PR ?? 'true') !== 'false',
  baseBranchOverride: process.env.BASE_BRANCH || undefined, // if unset, detect current branch
  maxPatchBytes: Number(process.env.MAX_PATCH_BYTES ?? 200000),
};
