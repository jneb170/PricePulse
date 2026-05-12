/**
 * Reset, migrate, and seed the SQLite database in a single invocation.
 *
 * Designed to run on every container boot for the public demo deployment,
 * which has no persistent volume — the reset itself is the safety net.
 *
 * Output is terse on purpose: one line per phase plus the seed's own
 * inserted-row summary. Noise becomes signal in container logs.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolveDatabaseUrl } from '../db/config.js';

// NOTE: '../db/seed' (transitively '../db/index') opens a Database connection
// at module load. Importing it eagerly would lock the path before rmSync runs.
// Defer with dynamic import after the file is freshly migrated.

async function main() {
  const dbPath = resolveDatabaseUrl();

  console.log('resetting db');
  mkdirSync(dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });

  console.log('applying migrations');
  const sqlite = new Database(dbPath);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });
  } finally {
    sqlite.close();
  }

  console.log('seeding');
  const { seed } = await import('../db/seed.js');
  await seed();

  console.log('ready');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`reset failed: ${message}`);
  process.exit(1);
});
