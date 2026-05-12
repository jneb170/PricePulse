# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What PricePulse is

A local-only dynamic pricing dashboard demo. Ingests simulated sales data for 11 fictional stores (donated-goods retail), applies configurable rule-based pricing, surfaces suggestions for manager approval, and logs every change as a domain event. Single-tenant, no auth beyond a stub, no deployment target — this is a demo, not a product.

## Architecture

Three layers, kept deliberately separable:

- **Frontend** — React + Tailwind SPA. Four screens: Dashboard (item × store table with current price, suggested price, 24h velocity, approve button), Rules Editor (form-driven rule definitions like `if velocity > X and inventory > Y, suggest price * 0.9`), Audit Log (chronological price changes with timestamp / old / new / reason / user), Settings (CRUD over stores and rules).
- **Backend** — Node + Express with tRPC as the API layer. Treat tRPC routers as the contract between FE and BE; types flow end-to-end.
- **Persistence** — SQLite via Drizzle ORM for local dev. Schema must stay Postgres-compatible (no SQLite-only column types or pragmas in migrations) so the database can swap later without rewrites.

### Pricing engine

Pure functions in TypeScript. Inputs (item state, store state, rule set) → suggested price. No I/O, no DB calls inside the engine — callers fetch state and pass it in. This keeps the engine trivially testable and forces rule logic to stay declarative. **No ML** — rule evaluation only. If a change feels like it wants to import a model or hit an API from inside the engine, that's a signal the boundary is being violated.

### Audit log

Domain-event driven. Every price change — whether a rule fired or a manager overrode — emits an event persisted with full context (who, when, old price, new price, triggering rule or override reason, item, store). The audit log screen is just a read view over this event stream. Do not mutate prices through any path that bypasses event emission.

### Sales data

Seeded simulated data for the 11 stores. No real-time websockets — the dashboard polls. "Last 24h velocity" is computed from the seeded sales table.

## Explicit non-goals

These were scoped out on purpose. Don't add them without the user asking:

- WebSockets / live push (polling is fine)
- Real authentication (stub user is enough)
- Multi-tenancy
- ML-based pricing
- Deployment / hosting config

## Commands

The project hasn't been scaffolded yet. Once `package.json` (or `pnpm-workspace.yaml` for a monorepo) exists, this section should list:

- Dev server start (frontend + backend, ideally one command)
- Drizzle migration generate + apply
- Seed command for the simulated sales data
- Test runner, including how to run a single test
- Typecheck and lint

Fill these in as scaffolding lands rather than guessing now.
