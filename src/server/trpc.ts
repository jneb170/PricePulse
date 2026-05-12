import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { db } from './db/index.js';
import type { User } from './db/schema/users.js';

/**
 * Request context. Carries the db handle and the stub-authenticated user.
 *
 * The "user" in this demo is just selected from a header (`x-demo-user-id`)
 * — we're explicitly not building real auth. The audit log still needs a
 * named actor for every state change, which is what this provides.
 */
export type Context = {
  db: typeof db;
  user: User | null;
};

export async function createContext({
  req,
}: CreateExpressContextOptions): Promise<Context> {
  const userId = req.header('x-demo-user-id') ?? null;
  const user = userId
    ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId) })) ?? null
    : null;
  return { db, user };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure that requires a stub-authenticated user.
 *
 * Every write that hits the audit log needs an actor. Read procedures can
 * stay on `publicProcedure`; mutations (approve, reject, override, edit rules)
 * should use `managerProcedure` so the audit attribution can't be skipped.
 */
export const managerProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Demo user not selected. Set x-demo-user-id header.',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
