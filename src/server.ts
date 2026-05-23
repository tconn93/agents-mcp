import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { projectToolDefinitions, handleProjectTool } from './tools/project-tools.js';
import { taskToolDefinitions, handleTaskTool } from './tools/task-tools.js';
import { githubToolDefinitions, handleGithubTool } from './tools/github-tools.js';
import { serverToolDefinitions, handleServerTool } from './tools/server-tools.js';

const PROJECT_TOOL_NAMES = new Set(projectToolDefinitions.map((t) => t.name));
const TASK_TOOL_NAMES = new Set(taskToolDefinitions.map((t) => t.name));
const GITHUB_TOOL_NAMES = new Set(githubToolDefinitions.map((t) => t.name));
const SERVER_TOOL_NAMES = new Set(serverToolDefinitions.map((t) => t.name));

export function createServer(): Server {
  const server = new Server(
    { name: 'agents-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...projectToolDefinitions,
      ...taskToolDefinitions,
      ...githubToolDefinitions,
      ...serverToolDefinitions,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result: unknown;

      if (PROJECT_TOOL_NAMES.has(name)) {
        result = await handleProjectTool(name, args as Record<string, unknown>);
      } else if (TASK_TOOL_NAMES.has(name)) {
        result = await handleTaskTool(name, args as Record<string, unknown>);
      } else if (GITHUB_TOOL_NAMES.has(name)) {
        result = await handleGithubTool(name, args as Record<string, unknown>);
      } else if (SERVER_TOOL_NAMES.has(name)) {
        result = await handleServerTool(name, args as Record<string, unknown>);
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}
