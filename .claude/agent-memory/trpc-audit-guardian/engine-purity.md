---
name: engine-purity
description: Pricing engine under src/server/engine must be pure — no I/O, no clock, no random
metadata:
  type: project
---

Code under `src/server/engine/` (currently `evaluate.ts`, `velocity.ts`, `types.ts`, `index.ts`) is a pure-function pricing engine. No DB calls, no `new Date()` (time is passed in as `now: Date`), no `Math.random()`.

**Why:** Determinism for unit tests and clean separation between rule logic and persistence. The router (`rules.evaluate` in `src/server/routers/rules.ts`) is responsible for fetching state, calling the engine, and persisting proposals + audit events.

**How to apply:** Grep `src/server/engine` for `new Date()`, `Date.now()`, `Math.random`, or any DB import. A finding there is CRITICAL. Engine logging is also intentionally absent — rule decisions are persisted as `price_change.proposed` audit events from the router, only when a proposal is actually emitted. Rules that match but produce no shift (e.g. floor-only) leave no audit trail; this is a known scope decision, not a bug.
