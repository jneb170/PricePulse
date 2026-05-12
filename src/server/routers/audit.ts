import { z } from 'zod';
import { and, desc, eq, gte, lte, lt, or } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc.js';
import {
  auditEvents,
  AUDIT_EVENT_TYPES,
  AUDIT_ENTITY_TYPES,
} from '../db/schema/audit.js';
import { users } from '../db/schema/users.js';
import type { SerializedAuditEvent } from '../db/serialize.js';

/**
 * Audit router — read view over the append-only audit_events table.
 *
 * Nothing in this router writes; audit events are emitted from the routers
 * that perform state changes (prices, rules, stores, items). Keeping the
 * write path concentrated in those routers is what makes the "no bypass"
 * guarantee credible.
 */

export type AuditEventWithActor = SerializedAuditEvent & {
  actorName: string | null; // null = system (rule engine)
};

export const auditRouter = router({
  list: publicProcedure
    .input(
      z.object({
        // Cursor pagination keyed on occurredAt — stable across inserts.
        cursor: z
          .object({ occurredAt: z.string(), id: z.string() })
          .nullish(),
        limit: z.number().int().min(1).max(200).default(50),
        // Optional filters.
        eventType: z.enum(AUDIT_EVENT_TYPES).optional(),
        entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
        entityId: z.string().optional(),
        actorId: z.string().optional(),
        // ISO date strings.
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        events: AuditEventWithActor[];
        nextCursor: { occurredAt: string; id: string } | null;
      }> => {
        const whereParts = [];

        if (input.eventType) {
          whereParts.push(eq(auditEvents.eventType, input.eventType));
        }
        if (input.entityType) {
          whereParts.push(eq(auditEvents.entityType, input.entityType));
        }
        if (input.entityId) {
          whereParts.push(eq(auditEvents.entityId, input.entityId));
        }
        if (input.actorId) {
          whereParts.push(eq(auditEvents.actorId, input.actorId));
        }
        if (input.since) {
          whereParts.push(gte(auditEvents.occurredAt, new Date(input.since)));
        }
        if (input.until) {
          whereParts.push(lte(auditEvents.occurredAt, new Date(input.until)));
        }
        // Keyset pagination on (occurredAt DESC, id DESC):
        //   keep rows where occurredAt < cursor.occurredAt
        //   OR (occurredAt = cursor.occurredAt AND id < cursor.id)
        if (input.cursor) {
          const cursorAt = new Date(input.cursor.occurredAt);
          whereParts.push(
            or(
              lt(auditEvents.occurredAt, cursorAt),
              and(
                eq(auditEvents.occurredAt, cursorAt),
                lt(auditEvents.id, input.cursor.id),
              ),
            )!,
          );
        }

        const rows = await ctx.db
          .select({
            id: auditEvents.id,
            eventType: auditEvents.eventType,
            entityType: auditEvents.entityType,
            entityId: auditEvents.entityId,
            actorId: auditEvents.actorId,
            payload: auditEvents.payload,
            occurredAt: auditEvents.occurredAt,
            actorName: users.name,
          })
          .from(auditEvents)
          .leftJoin(users, eq(users.id, auditEvents.actorId))
          .where(whereParts.length > 0 ? and(...whereParts) : undefined)
          .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
          .limit(input.limit + 1)
          .all();

        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;

        const events: AuditEventWithActor[] = page.map((r) => ({
          id: r.id,
          eventType: r.eventType,
          entityType: r.entityType,
          entityId: r.entityId,
          actorId: r.actorId,
          payload: r.payload,
          occurredAt: r.occurredAt.toISOString(),
          actorName: r.actorName,
        }));

        const last = page[page.length - 1];
        const nextCursor =
          hasMore && last
            ? { occurredAt: last.occurredAt.toISOString(), id: last.id }
            : null;

        return { events, nextCursor };
      },
    ),
});
