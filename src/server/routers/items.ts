import { z } from 'zod';
import { and, eq, gt, sql } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc.js';
import { items } from '../db/schema/items.js';
import { stores } from '../db/schema/stores.js';
import { salesEvents } from '../db/schema/sales.js';
import { priceChanges } from '../db/schema/prices.js';
import { serializeItem, type SerializedItem } from '../db/serialize.js';

/**
 * Items router.
 *
 * The headline procedure here is `dashboard` — it returns the joined
 * row shape that the Dashboard screen renders. It's the only query the
 * dashboard needs to make, so the backend agent should optimize for it:
 * one query that joins items + stores, computes velocity from sales_events
 * over the last 24h / 7d, and left-joins the most recent pending price
 * change (if any).
 */

export type DashboardRow = {
  itemId: string;
  storeId: string;
  storeName: string;
  sku: string;
  name: string;
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  inventory: number;
  currentPriceCents: number;
  velocity24h: number; // units sold in the last 24h (raw count, not /day)
  velocity7d: number; // units sold per day, averaged over the last 7 days
  daysSinceListed: number;
  // Populated only when a pending suggestion exists for this item.
  pendingChange: {
    id: string;
    suggestedPriceCents: number;
    reason: 'rule_fired' | 'manager_override' | 'manual_correction' | 'rollback';
    ruleId: string | null;
    proposedAt: string; // ISO
  } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const itemsRouter = router({
  /**
   * The dashboard's one and only data fetch.
   * Filters: optional storeId, optional category, optional pendingOnly flag.
   */
  dashboard: publicProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        category: z.string().optional(),
        pendingOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(100),
        cursor: z.string().nullish(),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ rows: DashboardRow[]; nextCursor: string | null }> => {
        const now = new Date();
        const cutoff24hMs = now.getTime() - DAY_MS;
        const cutoff7dMs = now.getTime() - 7 * DAY_MS;

        // Correlated subqueries compute velocity windows without a GROUP BY,
        // keeping pagination + filtering on the items table simple.
        // (Postgres-compatible: COALESCE + SUM over a filtered subquery.)
        const velocity24h = sql<number>`(
          SELECT COALESCE(SUM(${salesEvents.quantity}), 0)
          FROM ${salesEvents}
          WHERE ${salesEvents.itemId} = ${items.id}
            AND ${salesEvents.soldAt} > ${cutoff24hMs}
        )`;
        const velocity7dTotal = sql<number>`(
          SELECT COALESCE(SUM(${salesEvents.quantity}), 0)
          FROM ${salesEvents}
          WHERE ${salesEvents.itemId} = ${items.id}
            AND ${salesEvents.soldAt} > ${cutoff7dMs}
        )`;
        // Latest pending price_change for this item — at most one row matters
        // per item, and we pick the most recently proposed one if multiple
        // exist (the engine prevents duplicates, but pagination should still
        // be deterministic).
        const pendingId = sql<string | null>`(
          SELECT ${priceChanges.id}
          FROM ${priceChanges}
          WHERE ${priceChanges.itemId} = ${items.id}
            AND ${priceChanges.status} = 'pending'
          ORDER BY ${priceChanges.proposedAt} DESC
          LIMIT 1
        )`;

        const whereParts = [];
        if (input.storeId) whereParts.push(eq(items.storeId, input.storeId));
        if (input.category) whereParts.push(eq(items.category, input.category));
        if (input.cursor) whereParts.push(gt(items.id, input.cursor));
        if (input.pendingOnly) {
          // EXISTS keeps the planner happy and stays Postgres-compatible.
          whereParts.push(sql`EXISTS (
            SELECT 1 FROM ${priceChanges}
            WHERE ${priceChanges.itemId} = ${items.id}
              AND ${priceChanges.status} = 'pending'
          )`);
        }

        const rows = await ctx.db
          .select({
            itemId: items.id,
            storeId: items.storeId,
            storeName: stores.name,
            sku: items.sku,
            name: items.name,
            category: items.category,
            condition: items.condition,
            inventory: items.inventory,
            currentPriceCents: items.currentPriceCents,
            createdAt: items.createdAt,
            velocity24h,
            velocity7dTotal,
            pendingId,
          })
          .from(items)
          .innerJoin(stores, eq(stores.id, items.storeId))
          .where(whereParts.length > 0 ? and(...whereParts) : undefined)
          .orderBy(items.id)
          .limit(input.limit + 1) // +1 to detect a next page
          .all();

        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;

        // Fetch the pending-change details in one follow-up query.
        const pendingIds = page
          .map((r) => r.pendingId)
          .filter((id): id is string => !!id);
        const pendingMap = new Map<
          string,
          {
            id: string;
            suggestedPriceCents: number;
            reason: 'rule_fired' | 'manager_override' | 'manual_correction' | 'rollback';
            ruleId: string | null;
            proposedAt: Date;
          }
        >();
        if (pendingIds.length > 0) {
          const pendingRows = await ctx.db
            .select({
              id: priceChanges.id,
              toPriceCents: priceChanges.toPriceCents,
              reason: priceChanges.reason,
              ruleId: priceChanges.ruleId,
              proposedAt: priceChanges.proposedAt,
            })
            .from(priceChanges)
            .where(
              sql`${priceChanges.id} IN (${sql.join(
                pendingIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            )
            .all();
          for (const p of pendingRows) {
            pendingMap.set(p.id, {
              id: p.id,
              suggestedPriceCents: p.toPriceCents,
              reason: p.reason,
              ruleId: p.ruleId,
              proposedAt: p.proposedAt,
            });
          }
        }

        const out: DashboardRow[] = page.map((r) => {
          const pending = r.pendingId ? pendingMap.get(r.pendingId) ?? null : null;
          const daysListed = Math.max(
            0,
            Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS),
          );
          return {
            itemId: r.itemId,
            storeId: r.storeId,
            storeName: r.storeName,
            sku: r.sku,
            name: r.name,
            category: r.category,
            condition: r.condition,
            inventory: r.inventory,
            currentPriceCents: r.currentPriceCents,
            velocity24h: Number(r.velocity24h) || 0,
            velocity7d: (Number(r.velocity7dTotal) || 0) / 7,
            daysSinceListed: daysListed,
            pendingChange: pending
              ? {
                  id: pending.id,
                  suggestedPriceCents: pending.suggestedPriceCents,
                  reason: pending.reason,
                  ruleId: pending.ruleId,
                  proposedAt: pending.proposedAt.toISOString(),
                }
              : null,
          };
        });

        const nextCursor = hasMore ? page[page.length - 1]!.itemId : null;
        return { rows: out, nextCursor };
      },
    ),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }): Promise<SerializedItem | null> => {
      const row = await ctx.db.query.items.findFirst({
        where: (i, { eq }) => eq(i.id, input.id),
      });
      return row ? serializeItem(row) : null;
    }),
});
