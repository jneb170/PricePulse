---
name: no-trpc-transformer
description: PricePulse tRPC server is configured with no transformer (no superjson), so Date columns are typed as Date but arrive as ISO strings at runtime
metadata:
  type: project
---

`src/server/index.ts` constructs the Express middleware with no `transformer:` option, and `src/server/trpc.ts`'s `initTRPC.create()` similarly has no transformer. JSON is the wire format.

**Why:** Plain JSON keeps the demo simple, but it creates a runtime/type mismatch: tRPC's `inferRouterOutputs` reports `Date` for any field the server returns as a `Date` instance, while the client actually receives an ISO string.

**How to apply:** When rendering any date-typed field, coerce defensively: `typeof x === 'string' ? x : x instanceof Date ? x.toISOString() : String(x)`. Where the server already converts to ISO inside the resolver (e.g. `proposedAt` in `items.dashboard`), the types match reality and no coercion is needed. The mismatch only bites for resolvers that return raw Drizzle rows (e.g. `audit.list` returning `occurredAt: Date`). See `src/client/screens/Audit.tsx` AuditRow.
