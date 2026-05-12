import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, managerProcedure } from '../trpc.js';
import { stores } from '../db/schema/stores.js';
import { writeAuditEvent } from '../db/audit.js';
import { serializeStore, type SerializedStore } from '../db/serialize.js';

/**
 * Stores router — CRUD over the 11 fictional locations.
 *
 * Reads are public; writes require a stub-authenticated manager so the
 * audit log can attribute the change.
 */
export const storesRouter = router({
  list: publicProcedure.query(async ({ ctx }): Promise<SerializedStore[]> => {
    const rows = await ctx.db.query.stores.findMany({
      orderBy: (s, { asc }) => [asc(s.name)],
    });
    return rows.map(serializeStore);
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }): Promise<SerializedStore | null> => {
      const row = await ctx.db.query.stores.findFirst({
        where: (s, { eq }) => eq(s.id, input.id),
      });
      return row ? serializeStore(row) : null;
    }),

  create: managerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        location: z.string().min(1).max(200),
        timezone: z.string().default('America/Los_Angeles'),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedStore> => {
      return ctx.db.transaction((tx) => {
        const inserted = tx
          .insert(stores)
          .values({
            name: input.name,
            location: input.location,
            timezone: input.timezone,
          })
          .returning()
          .get();
        writeAuditEvent(tx, {
          eventType: 'store.created',
          entityType: 'store',
          entityId: inserted.id,
          actorId: ctx.user.id,
          payload: { after: inserted },
        });
        return serializeStore(inserted);
      });
    }),

  update: managerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        location: z.string().min(1).max(200).optional(),
        timezone: z.string().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SerializedStore> => {
      return ctx.db.transaction((tx) => {
        const before = tx
          .select()
          .from(stores)
          .where(eq(stores.id, input.id))
          .get();
        if (!before) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
        }
        const patch: Partial<typeof stores.$inferInsert> = { updatedAt: new Date() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.location !== undefined) patch.location = input.location;
        if (input.timezone !== undefined) patch.timezone = input.timezone;
        if (input.active !== undefined) patch.active = input.active;

        const after = tx
          .update(stores)
          .set(patch)
          .where(eq(stores.id, input.id))
          .returning()
          .get();

        writeAuditEvent(tx, {
          eventType: 'store.updated',
          entityType: 'store',
          entityId: after.id,
          actorId: ctx.user.id,
          payload: { before, after },
        });
        return serializeStore(after);
      });
    }),
});
