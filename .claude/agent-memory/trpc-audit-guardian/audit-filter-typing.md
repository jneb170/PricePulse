---
name: audit-filter-typing
description: audit.list uses z.custom<T>() without a validator — TS type passes but no runtime check
metadata:
  type: feedback
---

In `src/server/routers/audit.ts`, the input validators for `eventType` and `entityType` use:

```
eventType: z.custom<AuditEventType>().optional(),
entityType: z.custom<AuditEntityType>().optional(),
```

`z.custom<T>()` with no check function performs ZERO runtime validation — it just asserts the TS type. A client can send any string and Zod will accept it, then it flows directly into Drizzle's `eq()` builder.

**Why:** Drizzle parameterizes, so SQL injection isn't the risk; the risk is type-contract erosion. The procedure is `publicProcedure` (read-only), so blast radius is small, but the pattern is a footgun if copied to a write path.

**How to apply:** Replace with `z.enum([...AUDIT_EVENT_TYPES])` driven off a single source of truth. Same for `entityType`. Flag any future `z.custom<T>()` at the tRPC boundary unless paired with a validating second argument.
