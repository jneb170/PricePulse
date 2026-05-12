---
name: sync-transactions
description: Drizzle's better-sqlite3 transactions are synchronous — callbacks must return values directly, not Promises
metadata:
  type: project
---

This project uses `drizzle-orm/better-sqlite3`, which is the sync flavor of Drizzle. `db.transaction(cb)` runs `cb` synchronously and returns its return value directly (no Promise wrapping). The transaction handle `tx` only exposes sync builders — `.run()`, `.get()`, `.all()` on insert/update/delete/select.

**Why:** better-sqlite3 itself is synchronous, so Drizzle inherits that. Trying to `await` inside a transaction callback would break Drizzle's runtime contract (the framework checks that the callback didn't return a Promise).

**How to apply:** in tRPC resolvers, wrap the sync transaction inside an async resolver and use `.get()`/`.all()`/`.run()` instead of `await`. Example: `async ({ ctx, input }) => ctx.db.transaction((tx) => { const row = tx.insert(...).returning().get(); writeAuditEvent(tx, ...); return row; })`. Never use `async (tx) => …` as the transaction callback. The `writeAuditEvent` writer is also sync for this reason — it returns `void`, not `Promise<void>`.
