import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as taskManager from '../managers/task-manager.js';

export const serverToolDefinitions: Tool[] = [
  {
    name: 'server_status',
    description:
      'Report scheduler status: max concurrency, running and queued task counts, free capacity, and active task IDs.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handleServerTool(
  name: string,
  _args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'server_status':
      return taskManager.getServerStatus();

    default:
      throw new Error(`Unknown server tool: ${name}`);
  }
}
