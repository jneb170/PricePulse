---
name: drizzle
description: Use when defining Drizzle schemas, writing type-safe queries, or generating migrations for this project.
---

# Drizzle conventions for this project

- Schemas live in `src/server/db/schema/`. One file per domain (stores.ts, prices.ts, rules.ts, audit.ts).
- Always export inferred types: `export type Store = typeof stores.$inferSelect`.
- Use `relations()` to declare relationships explicitly so query builder typing works.
- Generate migrations with `drizzle-kit generate`; never edit SQL files by hand.
- For queries with relations, prefer `db.query.stores.findMany({ with: { prices: true } })` over manual joins to keep N+1 visibility.
- Use transactions (`db.transaction(...)`) for any write that touches multiple tables — especially price changes that must also write an audit event.