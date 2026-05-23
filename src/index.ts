import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { initScheduler } from './managers/task-manager.js';
import { ensureProjectsBase } from './managers/project-manager.js';
import { getPool } from './db/client.js';

// Load .env if present (dev convenience)
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dotenv = await import('dotenv' as any);
  dotenv.config();
} catch {
  // dotenv not installed; rely on real env vars
}

async function main(): Promise<void> {
  // Verify DB connection
  const pool = getPool();
  await pool.query('SELECT 1');

  // Ensure runtime directories exist
  await ensureProjectsBase();

  // Initialize scheduler: ensures outputs dir, resets orphaned tasks, starts pump.
  await initScheduler();

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('agents-mcp server running on stdio');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
