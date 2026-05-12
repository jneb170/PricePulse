/**
 * Database schema entry point.
 *
 * Import everything from this file in queries and migrations so Drizzle Kit
 * picks up all tables and relations in one pass:
 *
 *   import * as schema from './db/schema';
 *   const db = drizzle(sqlite, { schema });
 */
export * from './stores.js';
export * from './items.js';
export * from './prices.js';
export * from './sales.js';
export * from './rules.js';
export * from './audit.js';
export * from './users.js';
