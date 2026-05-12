import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, gte } from 'drizzle-orm';
import { router, publicProcedure, managerProcedure } from '../trpc.js';
import { pricingRules } from '../db/schema/rules.js';
import { items } from '../db/schema/items.js';
import { salesEvents } from '../db/schema/sales.js';
import { priceChanges } from '../db/schema/prices.js';
import { writeAuditEvent } from '../db/audit.js';
import { computeVelocities, evaluate } from '../engine/index.js';
import type { EngineItem, EngineSalesEvent } from '../engine/index.js';
import type {
  RuleConditions,
  RuleAction,
} from '../db/schema/rules.js';
import {
  serializePricingRule,
  type SerializedPricingRule,
} from '../db/serialize.js';

/**
 * Rules router — CRUD on pricing rules plus the "run engine" trigger.
 *
 * The engine itself is a pure function in src/server/engine/ (no I/O). This
 * router fetches the inputs, calls the engine, and persists the resulting
 * pending price changes — that's the seam between rule data and the engine.
 */

// Zod schemas mirror the typed JSON columns in db/schema/rules.ts.
const ruleConditionsSchema = z
  .object({
    velocity24hLt: z.number().nonnegative().optional(),
    velocity24hGt: z.number().nonnegative().optional(),
    velocity7dLt: z.number().nonnegative().optional(),
    velocity7dGt: z.number().nonnegative().optional(),
    inventoryLt: z.number().int().nonnegative().optional(),
    inventoryGt: z.number().int().nonnegative().optional(),
    daysSinceListedGt: z.number().int().nonnegative().optional(),
    category: z.array(z.string()).optional(),
    condition: z.array(z.enum(['new', 'like_new', 'good', 'fair'])).optional(),
  })
  .strict();

const ruleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('multiply'), factor: z.number().positive() }),
  z.object({ type: z.literal('set'), valueCents: z.number().int().min(1) }),
  z.object({ type: z.literal('floor'), minCents: z.number().int().min(1) }),
  z.object({ type: z.literal('ceiling'), maxCents: z.number().int().min(1) }),
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const rulesRouter = router({
  list: publicProcedure.query(async ({ ctx }): Promise<SerializedPricingRule[]> => {
    const rows = await ctx.db.query.pricingRules.findMany({
      orderBy: (r, { asc }) => [asc(r.priority), asc(r.name)],
    });
    return rows.map(serializePricingRule);
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }): Promise<SerializedPricingRule | null> => {
      const row = await ctx.db.query.pricingRules.findFirst({
        where: (r, { eq }) => eq(r.id, input.id),
      });
      return row ? serializePricingRule(row) : null;
    }),

  create: managerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        conditions: ruleConditionsSchema,
        action: ruleActionSchema,
        priority: z.number().int().default(100),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedPricingRule> => {
      return ctx.db.transaction((tx) => {
        const inserted = tx
          .insert(pricingRules)
          .values({
            name: input.name,
            description: input.description ?? null,
            conditions: input.conditions as RuleConditions,
            action: input.action as RuleAction,
            priority: input.priority,
            enabled: input.enabled,
          })
          .returning()
          .get();

        writeAuditEvent(tx, {
          eventType: 'rule.created',
          entityType: 'rule',
          entityId: inserted.id,
          actorId: ctx.user.id,
          payload: { after: inserted },
        });
        return serializePricingRule(inserted);
      });
    }),

  update: managerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        conditions: ruleConditionsSchema.optional(),
        action: ruleActionSchema.optional(),
        priority: z.number().int().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedPricingRule> => {
      return ctx.db.transaction((tx) => {
        const before = tx
          .select()
          .from(pricingRules)
          .where(eq(pricingRules.id, input.id))
          .get();
        if (!before) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
        }

        const patch: Partial<typeof pricingRules.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (input.name !== undefined) patch.name = input.name;
        if (input.description !== undefined) patch.description = input.description;
        if (input.conditions !== undefined) patch.conditions = input.conditions as RuleConditions;
        if (input.action !== undefined) patch.action = input.action as RuleAction;
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.enabled !== undefined) patch.enabled = input.enabled;

        const after = tx
          .update(pricingRules)
          .set(patch)
          .where(eq(pricingRules.id, input.id))
          .returning()
          .get();

        // If `enabled` flipped, emit the dedicated event. Otherwise plain update.
        // (We still write a single event per call — never multiple update flavors
        // for one mutation.)
        const eventType =
          input.enabled !== undefined && input.enabled !== before.enabled
            ? input.enabled
              ? 'rule.enabled'
              : 'rule.disabled'
            : 'rule.updated';

        writeAuditEvent(tx, {
          eventType,
          entityType: 'rule',
          entityId: after.id,
          actorId: ctx.user.id,
          payload: { before, after },
        });
        return serializePricingRule(after);
      });
    }),

  delete: managerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      return ctx.db.transaction((tx) => {
        const before = tx
          .select()
          .from(pricingRules)
          .where(eq(pricingRules.id, input.id))
          .get();
        if (!before) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
        }
        tx.delete(pricingRules).where(eq(pricingRules.id, input.id)).run();
        writeAuditEvent(tx, {
          eventType: 'rule.deleted',
          entityType: 'rule',
          entityId: before.id,
          actorId: ctx.user.id,
          payload: { before },
        });
        return { deleted: true as const };
      });
    }),

  /**
   * Run the pricing engine against current state and persist the resulting
   * pending price changes. Idempotent on the engine side (pure function),
   * but the *persistence* checks for an existing pending change per item
   * and skips duplicates.
   */
  evaluate: managerProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{
        proposedCount: number;
        skippedExistingCount: number;
        evaluatedItemCount: number;
      }> => {
        const now = new Date();

        // 1. Read state (outside the transaction is fine — we re-check before insert).
        const itemRows = await ctx.db.query.items.findMany({
          where: input?.storeId
            ? (i, { eq }) => eq(i.storeId, input.storeId!)
            : undefined,
        });
        if (itemRows.length === 0) {
          return { proposedCount: 0, skippedExistingCount: 0, evaluatedItemCount: 0 };
        }
        const itemIds = itemRows.map((i) => i.id);

        const recentSales = await ctx.db
          .select({
            itemId: salesEvents.itemId,
            quantity: salesEvents.quantity,
            soldAt: salesEvents.soldAt,
          })
          .from(salesEvents)
          .where(
            and(
              inArray(salesEvents.itemId, itemIds),
              gte(salesEvents.soldAt, new Date(now.getTime() - SEVEN_DAYS_MS)),
            ),
          )
          .all();

        const rules = await ctx.db.query.pricingRules.findMany({
          where: (r, { eq }) => eq(r.enabled, true),
        });

        // 2. Engine: pure functions, no I/O.
        const engineItems: EngineItem[] = itemRows.map((i) => ({
          id: i.id,
          storeId: i.storeId,
          category: i.category,
          condition: i.condition,
          inventory: i.inventory,
          currentPriceCents: i.currentPriceCents,
          listedAt: i.createdAt,
        }));
        const engineSales: EngineSalesEvent[] = recentSales.map((s) => ({
          itemId: s.itemId,
          quantity: s.quantity,
          soldAt: s.soldAt,
        }));
        const velocities = computeVelocities(engineSales, itemIds, now);
        const proposals = evaluate({ items: engineItems, velocities, rules, now });

        // 3. Persist proposals in a single transaction; skip items that already
        //    have a pending change (idempotency).
        let proposedCount = 0;
        let skippedExistingCount = 0;

        if (proposals.length === 0) {
          return {
            proposedCount: 0,
            skippedExistingCount: 0,
            evaluatedItemCount: itemRows.length,
          };
        }

        const proposalItemIds = proposals.map((p) => p.itemId);

        ctx.db.transaction((tx) => {
          // Read existing pending changes inside the transaction so the
          // read-and-write happens atomically — closes the TOCTOU window
          // that would let a concurrent override slip in a duplicate.
          const existingPending = tx
            .select({ itemId: priceChanges.itemId })
            .from(priceChanges)
            .where(
              and(
                inArray(priceChanges.itemId, proposalItemIds),
                eq(priceChanges.status, 'pending'),
              ),
            )
            .all();
          const blocked = new Set(existingPending.map((r) => r.itemId));

          for (const p of proposals) {
            if (blocked.has(p.itemId)) {
              skippedExistingCount++;
              continue;
            }
            const change = tx
              .insert(priceChanges)
              .values({
                itemId: p.itemId,
                fromPriceCents: p.fromPriceCents,
                toPriceCents: p.toPriceCents,
                reason: 'rule_fired',
                ruleId: p.ruleId,
                status: 'pending',
                proposedAt: now,
                proposedBy: null, // system (rule engine)
              })
              .returning()
              .get();
            writeAuditEvent(tx, {
              eventType: 'price_change.proposed',
              entityType: 'price_change',
              entityId: change.id,
              actorId: null, // system
              payload: {
                itemId: p.itemId,
                fromPriceCents: p.fromPriceCents,
                toPriceCents: p.toPriceCents,
                ruleId: p.ruleId,
                ruleName: p.ruleName,
              },
              occurredAt: now,
            });
            proposedCount++;
          }
        });

        return {
          proposedCount,
          skippedExistingCount,
          evaluatedItemCount: itemRows.length,
        };
      },
    ),
});
