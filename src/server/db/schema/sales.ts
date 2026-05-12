import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { items } from './items.js';
import { stores } from './stores.js';

/**
 * Sales events — append-only record of every unit sold.
 *
 * The pricing engine derives "velocity" from this table (e.g. units sold
 * in the last 24h per item or per category). storeId is denormalized to
 * keep the dashboard's per-store velocity query fast without a join.
 *
 * unitPriceCents captures the price at the moment of sale (not the current
 * price), which is what you want for revenue reporting and for evaluating
 * whether a past price change actually moved velocity.
 */
export const salesEvents = sqliteTable(
  'sales_events',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    soldAt: integer('sold_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    itemSoldAtIdx: index('sales_events_item_sold_at_idx').on(table.itemId, table.soldAt),
    storeSoldAtIdx: index('sales_events_store_sold_at_idx').on(table.storeId, table.soldAt),
  }),
);

export const salesEventsRelations = relations(salesEvents, ({ one }) => ({
  item: one(items, {
    fields: [salesEvents.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [salesEvents.storeId],
    references: [stores.id],
  }),
}));

export type SalesEvent = typeof salesEvents.$inferSelect;
export type NewSalesEvent = typeof salesEvents.$inferInsert;
