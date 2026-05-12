import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { priceChanges } from './prices.js';
import { auditEvents } from './audit.js';

/**
 * Users — stub for the manager approval workflow.
 *
 * No real auth in the demo; this exists so the audit log and price change
 * records can attribute decisions to a named actor instead of a bare string.
 * Seed with 2–3 users (e.g. "Alex (Manager)", "Sam (Manager)", "Demo User").
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: text('role', { enum: ['manager', 'viewer'] }).notNull().default('manager'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  proposedChanges: many(priceChanges, { relationName: 'proposer' }),
  decidedChanges: many(priceChanges, { relationName: 'decider' }),
  auditEvents: many(auditEvents),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
