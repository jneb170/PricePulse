/**
 * Shared database configuration.
 *
 * Kept side-effect-free so tooling (migrate, reset-db) can import the path
 * resolver without opening a Database connection. The runtime `./index.ts`
 * imports from here too, so the resolution logic has exactly one home.
 */

/**
 * Resolve the SQLite database path from env, falling back to the local dev DB.
 *
 * Both the Express runtime and out-of-band scripts (migrate, reset-db) MUST
 * call this so a deploy override like `DATABASE_URL=/data/dev.db` applies
 * uniformly. Do not duplicate the env read elsewhere.
 */
export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? './data/dev.db';
}
