import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { items } from './items.js';
import { pricingRules } from './rules.js';
import { users } from './users.js';

/**
 * Price changes — every proposed price movement, whether from a rule or a manager.
 *
 * Lifecycle:
 *   proposed → (approved | rejected) → (applied | reverted)
 *
 * When a change is approved AND applied, items.currentPriceCents is updated
 * in the same transaction as an audit_event row. The approval workflow is
 * the heart of the demo: nothing changes price without an explicit decision.
 *
 * `reason` distinguishes machine suggestions from human overrides for the
 * audit log and for retraining the rule set later.
 */
export const priceChanges = sqliteTable(
  'price_changes',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    fromPriceCents: integer('from_price_cents').notNull(),
    toPriceCents: integer('to_price_cents').notNull(),
    reason: text('reason', {
      enum: ['rule_fired', 'manager_override', 'manual_correction', 'rollback'],
    }).notNull(),
    // Set when reason = rule_fired. Lets the audit UI show *which* rule fired.
    ruleId: text('rule_id').references(() => pricingRules.id, {
      onDelete: 'set null',
    }),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'applied'],
    })
      .notNull()
      .default('pending'),
    proposedAt: integer('proposed_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    // Null when proposed by the rule engine ('system'); otherwise a user id.
    proposedBy: text('proposed_by').references(() => users.id),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    decidedBy: text('decided_by').references(() => users.id),
    appliedAt: integer('applied_at', { mode: 'timestamp_ms' }),
    // Free-form note attached by the manager when overriding or rejecting.
    note: text('note'),
  },
  (table) => ({
    itemIdx: index('price_changes_item_idx').on(table.itemId),
    statusIdx: index('price_changes_status_idx').on(table.status),
    proposedAtIdx: index('price_changes_proposed_at_idx').on(table.proposedAt),
  }),
);

export const priceChangesRelations = relations(priceChanges, ({ one }) => ({
  item: one(items, {
    fields: [priceChanges.itemId],
    references: [items.id],
  }),
  rule: one(pricingRules, {
    fields: [priceChanges.ruleId],
    references: [pricingRules.id],
  }),
  proposer: one(users, {
    fields: [priceChanges.proposedBy],
    references: [users.id],
    relationName: 'proposer',
  }),
  decider: one(users, {
    fields: [priceChanges.decidedBy],
    references: [users.id],
    relationName: 'decider',
  }),
}));

export type PriceChange = typeof priceChanges.$inferSelect;
export type NewPriceChange = typeof priceChanges.$inferInsert;
