import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as queries from '../db/queries.js';
import * as taskManager from '../managers/task-manager.js';

export const taskToolDefinitions: Tool[] = [
  {
    name: 'task_submit',
    description:
      'Submit a one-shot prompt to Claude Code running in a project directory. Returns a task_id immediately; use task_check to poll for results. On success with file changes, an auto-PR may be opened.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name of the target project' },
        prompt: {
          type: 'string',
          description: 'The instruction to send to Claude Code',
        },
        goal_prefix: {
          type: 'string',
          description:
            'Optional override for the prompt prefix (e.g. "/ultrawork " or "/team "). Defaults to the server GOAL_PREFIX.',
        },
      },
      required: ['project_name', 'prompt'],
    },
  },
  {
    name: 'task_check',
    description:
      'Check the status of a submitted task. Returns {ready: false} while queued/running; {ready: true, status, result, ...} when terminal. For needs_input status, includes needs_reply and question. Poll every 30-60 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID returned by task_submit' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_list',
    description: 'List tasks, optionally filtered by project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Filter by project name (optional)',
        },
      },
    },
  },
  {
    name: 'task_reply',
    description:
      'Reply to a task that finished asking a question (status needs_input) or to continue a completed task. Resumes the same session with your message. Poll task_check afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID to resume' },
        message: { type: 'string', description: 'Your reply / follow-up instruction' },
      },
      required: ['task_id', 'message'],
    },
  },
  {
    name: 'task_cancel',
    description: 'Cancel a running task. Terminates the underlying process and marks it failed.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID to cancel' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_logs',
    description:
      'Fetch the raw stream-json log for a task. Returns the last N lines (default 200).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        tail_lines: {
          type: 'number',
          description: 'Number of trailing lines to return (default 200)',
        },
      },
      required: ['task_id'],
    },
  },
];

export async function handleTaskTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'task_submit': {
      const opts =
        typeof args.goal_prefix === 'string'
          ? { goalPrefix: args.goal_prefix }
          : undefined;
      const task = await taskManager.submitTask(
        args.project_name as string,
        args.prompt as string,
        opts,
      );
      return {
        task_id: task.id,
        status: task.status,
        project_id: task.project_id,
        created_at: task.created_at,
        message: 'Task queued. Poll task_check with task_id every 30-60 seconds.',
      };
    }

    case 'task_check': {
      const task = await queries.getTask(args.task_id as string);
      if (!task) throw new Error(`Task "${args.task_id}" not found`);
      return taskManager.buildTaskCheckResponse(task);
    }

    case 'task_list': {
      let project_id: string | undefined;
      if (args.project_name) {
        const project = await queries.getProjectByName(args.project_name as string);
        if (!project) throw new Error(`Project "${args.project_name}" not found`);
        project_id = project.id;
      }
      const tasks = await queries.listTasks(project_id);
      return tasks.map((t) => ({
        task_id: t.id,
        project_id: t.project_id,
        status: t.status,
        branch: t.branch,
        pr_url: t.pr_url,
        created_at: t.created_at,
        completed_at: t.completed_at,
        prompt_preview: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? '…' : ''),
      }));
    }

    case 'task_reply': {
      const task = await taskManager.replyToTask(
        args.task_id as string,
        args.message as string,
      );
      return {
        task_id: task.id,
        status: task.status,
        message: 'Reply sent; resume in progress. Poll task_check.',
      };
    }

    case 'task_cancel': {
      const ok = await taskManager.cancelTask(args.task_id as string);
      return { task_id: args.task_id, cancelled: ok };
    }

    case 'task_logs': {
      const tail =
        typeof args.tail_lines === 'number' ? args.tail_lines : undefined;
      const log = await taskManager.readTaskLog(args.task_id as string, tail);
      return { task_id: args.task_id, log };
    }

    default:
      throw new Error(`Unknown task tool: ${name}`);
  }
}
