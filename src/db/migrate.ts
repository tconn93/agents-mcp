import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPool, closePool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate(): Promise<void> {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  const pool = getPool();
  await pool.query(schema);
  console.log('Migration complete.');
  await closePool();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
