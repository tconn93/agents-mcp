import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as queries from '../db/queries.js';
import * as taskManager from '../managers/task-manager.js';

export const taskToolDefinitions: Tool[] = [
  {
    name: 'task_submit',
    description:
      'Submit a one-shot prompt to Claude Code running in a project directory. Returns a task_id immediately; use task_check to poll for results.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name of the target project' },
        prompt: {
          type: 'string',
          description: 'The instruction to send to Claude Code',
        },
      },
      required: ['project_name', 'prompt'],
    },
  },
  {
    name: 'task_check',
    description:
      'Check the status of a submitted task. Returns {ready: false} while running; {ready: true, output, status} when done. Poll every 30-60 seconds.',
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
];

export async function handleTaskTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'task_submit': {
      const task = await taskManager.submitTask(
        args.project_name as string,
        args.prompt as string,
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
        created_at: t.created_at,
        completed_at: t.completed_at,
        prompt_preview: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? '…' : ''),
      }));
    }

    default:
      throw new Error(`Unknown task tool: ${name}`);
  }
}
