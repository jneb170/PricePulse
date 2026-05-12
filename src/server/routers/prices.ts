import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { router, publicProcedure, managerProcedure } from '../trpc.js';
import { priceChanges } from '../db/schema/prices.js';
import { items } from '../db/schema/items.js';
import { stores } from '../db/schema/stores.js';
import { pricingRules } from '../db/schema/rules.js';
import { writeAuditEvent } from '../db/audit.js';
import type { PriceChange } from '../db/schema/prices.js';
import {
  serializePriceChange,
  type SerializedPriceChange,
} from '../db/serialize.js';

/**
 * Prices router — the manager approval workflow.
 *
 * Every mutation in this file MUST update `items.currentPriceCents` (where
 * applicable) AND write a corresponding `audit_events` row in the same
 * transaction. The whole point of the demo is that nothing changes price
 * outside this contract.
 */

export type PriceChangeWithContext = SerializedPriceChange & {
  itemName: string;
  itemSku: string;
  storeId: string;
  storeName: string;
  ruleName: string | null;
};

/** Project a raw join result onto the PriceChangeWithContext shape. */
type JoinedRow = {
  change: PriceChange;
  itemName: string;
  itemSku: string;
  storeId: string;
  storeName: string;
  ruleName: string | null;
};

function projectJoined(r: JoinedRow): PriceChangeWithContext {
  return {
    ...serializePriceChange(r.change),
    itemName: r.itemName,
    itemSku: r.itemSku,
    storeId: r.storeId,
    storeName: r.storeName,
    ruleName: r.ruleName,
  };
}

export const pricesRouter = router({
  /**
   * Pending approval queue. Powers the "approve change" rows on the dashboard
   * and the dedicated approvals view.
   */
  listPending: publicProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<PriceChangeWithContext[]> => {
      const whereParts = [eq(priceChanges.status, 'pending')];
      if (input.storeId) whereParts.push(eq(items.storeId, input.storeId));

      const rows = await ctx.db
        .select({
          change: priceChanges,
          itemName: items.name,
          itemSku: items.sku,
          storeId: items.storeId,
          storeName: stores.name,
          ruleName: pricingRules.name,
        })
        .from(priceChanges)
        .innerJoin(items, eq(items.id, priceChanges.itemId))
        .innerJoin(stores, eq(stores.id, items.storeId))
        .leftJoin(pricingRules, eq(pricingRules.id, priceChanges.ruleId))
        .where(and(...whereParts))
        .orderBy(desc(priceChanges.proposedAt))
        .limit(input.limit)
        .all();

      return rows.map(projectJoined);
    }),

  history: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }): Promise<PriceChangeWithContext[]> => {
      const rows = await ctx.db
        .select({
          change: priceChanges,
          itemName: items.name,
          itemSku: items.sku,
          storeId: items.storeId,
          storeName: stores.name,
          ruleName: pricingRules.name,
        })
        .from(priceChanges)
        .innerJoin(items, eq(items.id, priceChanges.itemId))
        .innerJoin(stores, eq(stores.id, items.storeId))
        .leftJoin(pricingRules, eq(pricingRules.id, priceChanges.ruleId))
        .where(eq(priceChanges.itemId, input.itemId))
        .orderBy(desc(priceChanges.proposedAt))
        .limit(input.limit)
        .all();

      return rows.map(projectJoined);
    }),

  /**
   * Approve a pending change.
   * Side effects (one transaction):
   *   1. price_changes.status = 'applied', decidedAt, decidedBy, appliedAt set
   *   2. items.currentPriceCents updated to toPriceCents
   *   3. audit_events row of type 'price_change.approved' AND 'price_change.applied'
   */
  approve: managerProcedure
    .input(z.object({ priceChangeId: z.string(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }): Promise<SerializedPriceChange> => {
      return ctx.db.transaction((tx) => {
        const before = tx
          .select()
          .from(priceChanges)
          .where(eq(priceChanges.id, input.priceChangeId))
          .get();
        if (!before) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Price change not found',
          });
        }
        if (before.status !== 'pending') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot approve a change in status '${before.status}'`,
          });
        }
        const item = tx
          .select()
          .from(items)
          .where(eq(items.id, before.itemId))
          .get();
        if (!item) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Item for this price change no longer exists',
          });
        }

        const now = new Date();
        const after = tx
          .update(priceChanges)
          .set({
            status: 'applied',
            decidedAt: now,
            decidedBy: ctx.user.id,
            appliedAt: now,
            note: input.note ?? before.note,
          })
          .where(eq(priceChanges.id, before.id))
          .returning()
          .get();

        tx.update(items)
          .set({ currentPriceCents: after.toPriceCents, updatedAt: now })
          .where(eq(items.id, item.id))
          .run();

        // Two events: the human decision, then the state effect.
        writeAuditEvent(tx, {
          eventType: 'price_change.approved',
          entityType: 'price_change',
          entityId: after.id,
          actorId: ctx.user.id,
          payload: {
            before,
            after,
            note: input.note ?? null,
          },
          occurredAt: now,
        });
        writeAuditEvent(tx, {
          eventType: 'price_change.applied',
          entityType: 'price_change',
          entityId: after.id,
          actorId: ctx.user.id,
          payload: {
            itemId: item.id,
            fromPriceCents: after.fromPriceCents,
            toPriceCents: after.toPriceCents,
          },
          occurredAt: now,
        });

        return serializePriceChange(after);
      });
    }),

  reject: managerProcedure
    .input(z.object({ priceChangeId: z.string(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }): Promise<SerializedPriceChange> => {
      return ctx.db.transaction((tx) => {
        const before = tx
          .select()
          .from(priceChanges)
          .where(eq(priceChanges.id, input.priceChangeId))
          .get();
        if (!before) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Price change not found',
          });
        }
        if (before.status !== 'pending') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot reject a change in status '${before.status}'`,
          });
        }
        const now = new Date();
        const after = tx
          .update(priceChanges)
          .set({
            status: 'rejected',
            decidedAt: now,
            decidedBy: ctx.user.id,
            note: input.note ?? before.note,
          })
          .where(eq(priceChanges.id, before.id))
          .returning()
          .get();

        writeAuditEvent(tx, {
          eventType: 'price_change.rejected',
          entityType: 'price_change',
          entityId: after.id,
          actorId: ctx.user.id,
          payload: { before, after, note: input.note ?? null },
          occurredAt: now,
        });
        return serializePriceChange(after);
      });
    }),

  /**
   * Manager-initiated price change.
   * Goes straight from `pending` to `applied` (manager decisions skip the
   * approval queue), writes both 'price_change.proposed' and 'price_change.applied'
   * audit events with reason = 'manager_override'.
   */
  override: managerProcedure
    .input(
      z.object({
        itemId: z.string(),
        toPriceCents: z.number().int().min(1),
        note: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedPriceChange> => {
      return ctx.db.transaction((tx) => {
        const item = tx
          .select()
          .from(items)
          .where(eq(items.id, input.itemId))
          .get();
        if (!item) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
        }
        const now = new Date();
        const inserted = tx
          .insert(priceChanges)
          .values({
            itemId: item.id,
            fromPriceCents: item.currentPriceCents,
            toPriceCents: input.toPriceCents,
            reason: 'manager_override',
            ruleId: null,
            status: 'applied',
            proposedAt: now,
            proposedBy: ctx.user.id,
            decidedAt: now,
            decidedBy: ctx.user.id,
            appliedAt: now,
            note: input.note,
          })
          .returning()
          .get();

        tx.update(items)
          .set({ currentPriceCents: input.toPriceCents, updatedAt: now })
          .where(eq(items.id, item.id))
          .run();

        writeAuditEvent(tx, {
          eventType: 'price_change.proposed',
          entityType: 'price_change',
          entityId: inserted.id,
          actorId: ctx.user.id,
          payload: {
            itemId: item.id,
            fromPriceCents: item.currentPriceCents,
            toPriceCents: input.toPriceCents,
            reason: 'manager_override',
            note: input.note,
          },
          occurredAt: now,
        });
        writeAuditEvent(tx, {
          eventType: 'price_change.applied',
          entityType: 'price_change',
          entityId: inserted.id,
          actorId: ctx.user.id,
          payload: {
            itemId: item.id,
            fromPriceCents: item.currentPriceCents,
            toPriceCents: input.toPriceCents,
          },
          occurredAt: now,
        });

        return serializePriceChange(inserted);
      });
    }),

  /**
   * Revert a previously-applied change. Creates a new price_change with
   * reason='rollback' pointing the price back to the prior value.
   */
  revert: managerProcedure
    .input(
      z.object({ priceChangeId: z.string(), note: z.string().min(1).max(500) }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedPriceChange> => {
      return ctx.db.transaction((tx) => {
        const original = tx
          .select()
          .from(priceChanges)
          .where(eq(priceChanges.id, input.priceChangeId))
          .get();
        if (!original) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Price change not found',
          });
        }
        if (original.status !== 'applied') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Can only revert an applied change; this one is '${original.status}'`,
          });
        }
        const item = tx
          .select()
          .from(items)
          .where(eq(items.id, original.itemId))
          .get();
        if (!item) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Item for this price change no longer exists',
          });
        }

        const now = new Date();
        // The rollback's from/to inverts the original change. We take the
        // current item price as the source-of-truth "from" — if other changes
        // happened in between, this still walks the price back to the value
        // we want, attributed correctly.
        const rollback = tx
          .insert(priceChanges)
          .values({
            itemId: item.id,
            fromPriceCents: item.currentPriceCents,
            toPriceCents: original.fromPriceCents,
            reason: 'rollback',
            ruleId: null,
            status: 'applied',
            proposedAt: now,
            proposedBy: ctx.user.id,
            decidedAt: now,
            decidedBy: ctx.user.id,
            appliedAt: now,
            note: input.note,
          })
          .returning()
          .get();

        tx.update(items)
          .set({ currentPriceCents: original.fromPriceCents, updatedAt: now })
          .where(eq(items.id, item.id))
          .run();

        // Mark the original as reverted via an audit event on the original id.
        writeAuditEvent(tx, {
          eventType: 'price_change.reverted',
          entityType: 'price_change',
          entityId: original.id,
          actorId: ctx.user.id,
          payload: {
            rolledBackBy: rollback.id,
            itemId: item.id,
            restoredPriceCents: original.fromPriceCents,
            note: input.note,
          },
          occurredAt: now,
        });
        // And the rollback itself is a new applied change.
        writeAuditEvent(tx, {
          eventType: 'price_change.applied',
          entityType: 'price_change',
          entityId: rollback.id,
          actorId: ctx.user.id,
          payload: {
            itemId: item.id,
            fromPriceCents: rollback.fromPriceCents,
            toPriceCents: rollback.toPriceCents,
            reason: 'rollback',
            rollbackOf: original.id,
          },
          occurredAt: now,
        });

        return serializePriceChange(rollback);
      });
    }),
});

