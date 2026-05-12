import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';

/**
 * Users router — read view over the seeded demo users.
 *
 * Backs the demo-user picker in the client. No auth in this demo, so this
 * is intentionally public; selecting a user is what the `x-demo-user-id`
 * header gets populated with so the audit log can attribute mutations.
 *
 * Read-only by design — there is no UI to create/edit users in the demo,
 * and per CLAUDE.md the audit log is scoped to price-change events, not
 * fixture management. No mutations belong in this router.
 */

export type ListedUser = {
  id: string;
  name: string;
  role: 'manager' | 'viewer';
};

// Mirrors `users.role` in db/schema/users.ts (enum: ['manager', 'viewer']).
// Kept inline because zod cannot infer a literal-tuple enum from the Drizzle
// column at the type system level — if the schema enum changes, update both.
const listedUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['manager', 'viewer']),
});

export const usersRouter = router({
  list: publicProcedure
    .output(z.array(listedUserSchema))
    .query(async ({ ctx }): Promise<ListedUser[]> => {
      const rows = await ctx.db.query.users.findMany({
        orderBy: (u, { asc }) => [asc(u.name)],
      });
      return rows.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));
    }),
});
