import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { priceChanges } from './prices.js';

/**
 * Pricing rules — declarative if/then statements evaluated by the engine.
 *
 * Example rule:
 *   {
 *     conditions: { velocity24hLt: 1, inventoryGt: 10, daysSinceListedGt: 14 },
 *     action: { type: 'multiply', factor: 0.9 }
 *   }
 *
 * Conditions and actions are stored as typed JSON so the editor UI can
 * round-trip them safely. Higher priority (lower number) wins when multiple
 * rules match the same item.
 */

export type RuleConditions = {
  velocity24hLt?: number;
  velocity24hGt?: number;
  velocity7dLt?: number;
  velocity7dGt?: number;
  inventoryLt?: number;
  inventoryGt?: number;
  daysSinceListedGt?: number;
  category?: string[];
  condition?: Array<'new' | 'like_new' | 'good' | 'fair'>;
};

export type RuleAction =
  | { type: 'multiply'; factor: number } // e.g. factor: 0.9 = 10% off
  | { type: 'set'; valueCents: number }
  | { type: 'floor'; minCents: number }
  | { type: 'ceiling'; maxCents: number };

export const pricingRules = sqliteTable(
  'pricing_rules',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: text('name').notNull(),
    description: text('description'),
    conditions: text('conditions', { mode: 'json' }).$type<RuleConditions>().notNull(),
    action: text('action', { mode: 'json' }).$type<RuleAction>().notNull(),
    priority: integer('priority').notNull().default(100), // lower = higher priority
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    enabledPriorityIdx: index('pricing_rules_enabled_priority_idx').on(
      table.enabled,
      table.priority,
    ),
  }),
);

export const pricingRulesRelations = relations(pricingRules, ({ many }) => ({
  priceChanges: many(priceChanges),
}));

export type PricingRule = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
