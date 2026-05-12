import { router, publicProcedure } from './trpc.js';
import { storesRouter } from './routers/stores.js';
import { itemsRouter } from './routers/items.js';
import { pricesRouter } from './routers/prices.js';
import { rulesRouter } from './routers/rules.js';
import { auditRouter } from './routers/audit.js';
import { usersRouter } from './routers/users.js';

/**
 * App router — root composition of every sub-router.
 *
 * The exported `AppRouter` type is the contract between server and client.
 * The client imports `AppRouter` (type-only) to get end-to-end type safety
 * on every procedure call.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  stores: storesRouter,
  items: itemsRouter,
  prices: pricesRouter,
  rules: rulesRouter,
  audit: auditRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
