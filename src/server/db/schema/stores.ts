import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { items } from './items.js';
import { salesEvents } from './sales.js';

/**
 * Stores — the 11 fictional thrift locations.
 *
 * Each store has its own inventory and sales velocity, which drives
 * pricing decisions independently from sibling stores.
 */
export const stores = sqliteTable('stores', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  location: text('location').notNull(), // city / neighborhood
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const storesRelations = relations(stores, ({ many }) => ({
  items: many(items),
  salesEvents: many(salesEvents),
}));

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
