import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { stores } from './stores.js';
import { priceChanges } from './prices.js';
import { salesEvents } from './sales.js';

/**
 * Items — individual SKUs at a specific store.
 *
 * Prices are stored as integer cents (e.g. 1299 = $12.99) to avoid floating
 * point rounding errors. `currentPriceCents` is denormalized from the latest
 * approved price change for fast dashboard reads.
 *
 * Item categories reflect the donated-goods business: clothing, books,
 * furniture, electronics, housewares, toys, etc.
 */
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    condition: text('condition', { enum: ['new', 'like_new', 'good', 'fair'] })
      .notNull()
      .default('good'),
    inventory: integer('inventory').notNull().default(1),
    currentPriceCents: integer('current_price_cents').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // SKUs are unique per store, not globally — different stores can reuse codes.
    skuPerStore: uniqueIndex('items_store_sku_idx').on(table.storeId, table.sku),
    storeIdx: index('items_store_idx').on(table.storeId),
    categoryIdx: index('items_category_idx').on(table.category),
  }),
);

export const itemsRelations = relations(items, ({ one, many }) => ({
  store: one(stores, {
    fields: [items.storeId],
    references: [stores.id],
  }),
  priceChanges: many(priceChanges),
  salesEvents: many(salesEvents),
}));

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
