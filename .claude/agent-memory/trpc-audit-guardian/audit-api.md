---
name: audit-api
description: Location and signature of the canonical audit-event writer
metadata:
  type: reference
---

The single audit-event writer is `writeAuditEvent(tx: AuditTx, event: AuditEventInput)` exported from `src/server/db/audit.ts`.

- First param is the active Drizzle transaction handle (or the bare db for tests via structural typing).
- `AuditEventInput` shape: `{ eventType, entityType, entityId, actorId, payload, occurredAt? }`.
- `actorId: null` is the explicit "system actor" sentinel — used by the rule engine in `rules.evaluate` when creating `price_change.proposed` events. Anywhere else, null actor on a mutation is a finding.
- Routers ALWAYS open a transaction with `ctx.db.transaction((tx) => { ... })` then call `writeAuditEvent(tx, ...)`. Calls with the bare `ctx.db` are a violation.

Allowed event types are listed in `src/server/db/schema/audit.ts` as the `AuditEventType` union.

See also: [[engine-purity]], [[rules-update-branch]].
