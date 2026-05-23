import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as queries from '../db/queries.js';
import * as git from '../managers/git-manager.js';

export const githubToolDefinitions: Tool[] = [
  {
    name: 'project_diff',
    description:
      'Show the current uncommitted changes in a project working tree (staged via git add -A): file list, diff stat, and patch.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'github_branch',
    description: 'Create (or switch to) a git branch in a project.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        branch: { type: 'string', description: 'Branch name to create/switch to' },
      },
      required: ['name', 'branch'],
    },
  },
  {
    name: 'github_commit_push',
    description:
      'Stage all changes, commit with a message, and optionally create/switch to a branch and push it to origin.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        message: { type: 'string', description: 'Commit message' },
        branch: {
          type: 'string',
          description: 'Optional branch to create/switch to before committing, then push',
        },
      },
      required: ['name', 'message'],
    },
  },
  {
    name: 'github_open_pr',
    description:
      'Open a pull request via gh, or return a compare URL fallback if gh is unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body (markdown)' },
        base: {
          type: 'string',
          description: 'Base branch (defaults to "main")',
        },
        branch: {
          type: 'string',
          description: 'Head branch (defaults to current branch)',
        },
      },
      required: ['name', 'title', 'body'],
    },
  },
];

async function resolvePath(name: string): Promise<string> {
  const project = await queries.getProjectByName(name);
  if (!project) throw new Error(`Project "${name}" not found`);
  return project.local_path;
}

export async function handleGithubTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'project_diff': {
      const cwd = await resolvePath(args.name as string);
      const baseSha = await git.currentCommit(cwd);
      return git.computeFileChanges(cwd, baseSha);
    }

    case 'github_branch': {
      const cwd = await resolvePath(args.name as string);
      const branch = args.branch as string;
      await git.createBranch(cwd, branch);
      return { success: true, branch };
    }

    case 'github_commit_push': {
      const cwd = await resolvePath(args.name as string);
      const branch =
        typeof args.branch === 'string' ? args.branch : undefined;
      if (branch) {
        await git.createBranch(cwd, branch);
      }
      const sha = await git.commitAll(cwd, args.message as string);
      let pushed = false;
      if (branch) {
        const res = await git.push(cwd, branch);
        pushed = res.ok;
      }
      return { commit: sha, pushed };
    }

    case 'github_open_pr': {
      const cwd = await resolvePath(args.name as string);
      const branch =
        typeof args.branch === 'string'
          ? args.branch
          : await git.currentBranch(cwd);
      const base = typeof args.base === 'string' ? args.base : 'main';
      const result = await git.openPr(cwd, {
        branch,
        base,
        title: args.title as string,
        body: args.body as string,
      });
      return result;
    }

    default:
      throw new Error(`Unknown github tool: ${name}`);
  }
}
