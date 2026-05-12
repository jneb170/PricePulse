---
name: audit-writer
description: writeAuditEvent in src/server/db/audit.ts is the sole runtime write path to audit_events; seed.ts is the documented exception
metadata:
  type: project
---

`src/server/db/audit.ts` exports a single function `writeAuditEvent(tx, event)` that inserts into `audit_events`. Every runtime mutation path in the routers funnels through this function inside a `db.transaction((tx) => …)` callback.

**Why:** the demo's value proposition is that "nothing changes price outside this contract." The audit log is the single source of truth, so concentrating all writes in one place keeps the no-bypass guarantee credible and greppable.

**How to apply:**
- Never `tx.insert(auditEvents)...` directly outside `writeAuditEvent`. Search for `auditEvents` usage outside `db/audit.ts` and `db/schema/audit.ts` should return only `db/seed.ts` (fixture loader, exempt) and `routers/audit.ts` (read-only).
- Never call `writeAuditEvent` outside an active transaction. Resolvers always wrap state-change + audit-write inside `db.transaction((tx) => { … writeAuditEvent(tx, …); … })`.
- Approve/override flows write TWO audit events in a single txn: `price_change.approved` + `price_change.applied` (approve) or `price_change.proposed` + `price_change.applied` (manager override). See [[sync-transactions]] for the txn shape.
- The `actorId` field is `null` for system actors (rule engine evaluating proposals). Manager-initiated changes pass `ctx.user.id`.
