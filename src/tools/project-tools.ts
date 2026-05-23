import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as queries from '../db/queries.js';
import * as projectManager from '../managers/project-manager.js';

export const projectToolDefinitions: Tool[] = [
  {
    name: 'project_setup',
    description:
      'Clone a GitHub repo and set up a managed project environment. Returns immediately; poll project_status to know when cloning is done.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique project identifier' },
        repo_url: { type: 'string', description: 'Git repository URL to clone' },
        env_vars: {
          type: 'object',
          description: 'Key-value pairs to store as env vars for this project',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['name', 'repo_url'],
    },
  },
  {
    name: 'project_status',
    description: 'Check whether a project environment is ready for task submission.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'project_list',
    description: 'List all managed projects and their statuses.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_remove',
    description: 'Remove a project — deletes local files and DB records.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'project_set_env',
    description: 'Set or update an environment variable for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        key: { type: 'string', description: 'Environment variable name' },
        value: { type: 'string', description: 'Environment variable value' },
      },
      required: ['name', 'key', 'value'],
    },
  },
  {
    name: 'project_get_env',
    description: 'Get all environment variables stored for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
      },
      required: ['name'],
    },
  },
];

export async function handleProjectTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'project_setup': {
      const projectName = args.name as string;
      const repoUrl = args.repo_url as string;
      const envVars = (args.env_vars as Record<string, string>) ?? {};
      const project = await projectManager.setupProject(projectName, repoUrl, envVars);
      return {
        project_id: project.id,
        name: project.name,
        status: project.status,
        local_path: project.local_path,
        message: 'Project setup initiated. Poll project_status to check when ready.',
      };
    }

    case 'project_status': {
      const project = await queries.getProjectByName(args.name as string);
      if (!project) throw new Error(`Project "${args.name}" not found`);
      return {
        ready: project.status === 'ready',
        name: project.name,
        status: project.status,
        error: project.error,
        created_at: project.created_at,
        updated_at: project.updated_at,
      };
    }

    case 'project_list': {
      const projects = await queries.listProjects();
      return projects.map((p) => ({
        name: p.name,
        status: p.status,
        repo_url: p.repo_url,
        created_at: p.created_at,
      }));
    }

    case 'project_remove': {
      await projectManager.removeProject(args.name as string);
      return { success: true, removed: args.name };
    }

    case 'project_set_env': {
      const project = await queries.getProjectByName(args.name as string);
      if (!project) throw new Error(`Project "${args.name}" not found`);
      await queries.setEnvVar(project.id, args.key as string, args.value as string);
      return { success: true, key: args.key };
    }

    case 'project_get_env': {
      const project = await queries.getProjectByName(args.name as string);
      if (!project) throw new Error(`Project "${args.name}" not found`);
      const envVars = await queries.getEnvVars(project.id);
      return { name: project.name, env_vars: envVars };
    }

    default:
      throw new Error(`Unknown project tool: ${name}`);
  }
}
