# PricePulse

A dynamic pricing dashboard for a donated-goods retail chain. Ingests simulated sales data across 11 fictional stores, applies configurable rule-based pricing, surfaces suggestions for manager approval, and records every state change as a domain event in an append-only audit log.

The architecture story is the point of the project: a pure-function pricing engine, manager-attributed mutations gated at the type level, every price change written atomically with its audit event. The UI is the surface that lets you see those guarantees hold under real interaction.

> See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for a screen-by-screen walkthrough.

## Running it locally

Requires Node 22 LTS.

```bash
npm install
npm run db:generate           # produce migration SQL from the Drizzle schema
npm run db:migrate            # apply migrations to ./data/dev.db
npm run db:seed               # 11 stores, ~880 items, 30 days of sales, 5 rules, 12 pending suggestions
npm run dev:server            # API on http://localhost:3001
npm run dev:client            # SPA on http://localhost:5180 (Vite proxies /trpc/ to :3001)
```

Open `http://localhost:5180`. From the demo-user dropdown in the top bar, pick a manager (Alex, Sam, or Jordan). Every mutation gets attributed to that user; without one selected, the backend's `managerProcedure` rejects with `UNAUTHORIZED`.

To reset the demo state at any time: `rm ./data/dev.db && npm run db:migrate && npm run db:seed`. The seed is deterministic (seeded PRNG) so the demo always lands in the same shape.

## Running it in production

Production is a single Express process that serves both the built SPA and the tRPC API on one port.

```bash
npm run build                 # builds dist/client (Vite) and dist/server (tsc)
npm start                     # resets the DB, applies migrations, seeds, then serves
```

`npm start` calls a reset-on-boot script before serving — the SQLite database is deliberately ephemeral. Every container restart produces a clean demo state, which is appropriate for a public sandbox where state is shared across visitors.

The container is deployable as-is to any Docker host. The included `Dockerfile` is a multi-stage build that compiles `better-sqlite3` against Node 22 and produces a slim runtime image.

## Screens

**Dashboard.** Items across stores with current price, suggested price (when a rule has fired), 24h velocity, 7-day velocity per day, days listed, and inline Approve / Reject controls. Each row also exposes a manager-override input so a price can be set directly without going through the approval queue. Polls every 15 seconds; refetches on window focus.

**Rules.** Declarative pricing rules with priority, enabled toggle, JSON conditions (velocity thresholds, inventory thresholds, category/condition filters), and JSON actions (multiply, set, floor, ceiling). Form-driven create/edit with `react-hook-form` and a zod schema mirroring the server's input shape. A "Run engine" control evaluates all enabled rules against current state and persists the resulting pending suggestions.

**Audit log.** Chronological view of the append-only `audit_events` table. Filters by event type, entity type, actor, and date range. Cursor pagination keyed on `(occurredAt, id)` so inserts during browsing don't cause skipped or duplicate rows.

**Settings.** CRUD on stores and rules.

## Architecture decisions worth knowing

**The pricing engine is a pure function.** `src/server/engine/` exports `computeVelocities` and `evaluate` — no DB access, no `new Date()`, no I/O. Callers fetch state, pass it in, persist the result. Rule logic that touches the world is impossible to test and impossible to reason about. The seam between data and engine lives in `rules.evaluate` on the tRPC layer.

**Every state-changing mutation writes an audit event in the same transaction.** `src/server/db/audit.ts` exports `writeAuditEvent(tx, event)`, which only accepts an active Drizzle transaction. There is no public API to write audit events outside this function, and no public API to mutate prices, rules, items, or stores without writing one. The "no bypass" guarantee is enforced by code shape, not convention.

**Approve writes two events, not one.** `price_change.approved` (the human decision) and `price_change.applied` (the state effect) are distinct domain events emitted in the same transaction. The separation matters when counting manager decisions independently of state effects — for example, comparing decision throughput between managers without conflating it with how many of those decisions actually moved prices.

**Money is integer cents on the wire and in storage.** Floats accumulate rounding error; cents don't. Formatting to dollars happens at the client edge in `src/client/lib/format.ts`.

**The tRPC AppRouter type is the contract.** Every procedure has an explicit return-type annotation. The client imports `AppRouter` as `type` only and gets end-to-end inference. If the server's implementation drifts from the annotation, the type check fails — not the runtime.

**Manager attribution is a type-level guarantee.** Read procedures use `publicProcedure`. Mutations that need an actor use `managerProcedure`, which throws `UNAUTHORIZED` if no `x-demo-user-id` header resolves to a user. "Did a manager approve this?" cannot return `false` at runtime without a type error being raised at the procedure boundary.

**Schema is Postgres-compatible.** Drizzle's SQLite dialect is used for local dev and the deployed sandbox, but every column type, index, and constraint is chosen so the schema can move to Postgres without rewrites. cuid2 IDs (not autoincrement integers), integer timestamps (not SQLite-specific date types), no SQLite pragmas in migrations.

**Production is same-origin by design.** The deployed Express process serves both the SPA and `/trpc/*`. The browser sees them as the same origin, so no CORS middleware is needed. The rate limiter on mutations (in-memory token bucket, per IP, configurable via env vars) is intentionally `POST + /trpc/`-only so healthchecks and queries are never throttled.

## Explicit non-goals (v1)

These were scoped out on purpose:

- **Real authentication.** A stub demo-user picker is enough to demonstrate the actor-attribution pattern. Anyone visiting the sandbox can act as any seeded manager.
- **WebSockets / live push.** Polling at 15 seconds is enough for a demo and keeps the backend trivially testable.
- **Multi-tenancy.** Single demo tenant. Trying to demonstrate multi-tenant correctness in a v1 demo would dilute the architecture story.
- **ML-based pricing.** Rule evaluation is the right v1 surface for any pricing system. ML is a v3 problem and adds operational risk that a rules-based system doesn't.
- **Persistent state across container restarts.** Deliberate. The deployed sandbox uses ephemeral SQLite and reseeds on boot so anyone can experiment freely without poisoning the demo for the next visitor.

## Trade-offs and what I'd do for v1.5

See [`FOLLOWUPS.md`](./FOLLOWUPS.md) for the running list of non-blocking items, including the still-open badge formatting tweak on the audit log. The major ones identified during build have all been addressed: the chicken-and-egg in the demo-user picker is resolved (now backed by a `users.list` procedure), and the manager-override UI is wired through the dashboard.
