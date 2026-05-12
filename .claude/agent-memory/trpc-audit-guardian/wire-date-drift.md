---
name: wire-date-drift
description: tRPC v11 with no transformer lies about Date fields — inferred type says Date, runtime value is ISO string
metadata:
  type: feedback
---

The project uses tRPC v11 WITHOUT a superjson transformer. Drizzle's `timestamp_ms` columns infer as `Date` end-to-end, but JSON serialization converts to ISO string in flight. The inferred client type is wrong.

**Why:** Spotted in `src/client/screens/Audit.tsx` (~line 232–240) where the author already coerces defensively: `const occurred: unknown = event.occurredAt; const iso = occurred instanceof Date ? ... : typeof occurred === 'string' ? ...`. This is a band-aid over a real contract violation.

**How to apply:** Any procedure that returns a row with timestamp columns (`PriceChange`, `AuditEvent`, `Item`, `Store`, `PricingRule`) is affected on the client. Either:
1. Add a transformer (superjson) to the tRPC client/server so Dates survive the round-trip, OR
2. Make the procedure explicitly map Date fields to `toISOString()` and update the return type to `string` (the pattern used for `pendingChange.proposedAt` in `items.dashboard`).

When auditing future changes, flag any new procedure that returns a row with Date columns without doing one of the above.
