import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import { resolveDatabaseUrl } from './config.js';

// Re-export so existing call sites can keep importing from './db'.
export { resolveDatabaseUrl };

const DB_PATH = resolveDatabaseUrl();

const sqlite = new Database(DB_PATH);
// Pragmas worth setting up front:
// - WAL gives concurrent reads while a writer is open (matters for the dashboard).
// - foreign_keys must be turned on per-connection in SQLite.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
export { schema };
