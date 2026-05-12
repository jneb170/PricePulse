---
name: deployment-docker-fly
description: PricePulse ships as a single Docker container that serves both the API and SPA, with reset-on-boot wiping SQLite each start. Targets Fly.io with no persistent volume.
metadata:
  type: project
---

The deploy target is a single multi-stage Docker container (Node 22 bookworm-slim) that runs `npm start` — which is `start:reset-db && start:prod`. The reset script wipes `./data/dev.db` and re-seeds on every container boot. This is deliberate: the demo has **no persistent volume**, the reset is the safety net.

In production (`NODE_ENV=production`), `src/server/index.ts` mounts `express.static('dist/client')` after the `/trpc` middleware plus a regex catch-all `/^(?!\/trpc(?:\/|$)).*/` that serves `dist/client/index.html` so react-router deep links resolve on hard refresh. The `/` JSON response is only mounted when not in production.

Fly config (`fly.toml`):
- `internal_port = 8080`, server reads `PORT` env (default 3001 in dev, 8080 in container)
- `auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0`
- Health check on `/` with `grace_period = "30s"` because reset+seed takes a few seconds on boot
- No `[mounts]` — leaving it ephemeral is the design

**Why:** The user explicitly chose tsc over esbuild for the server build, and explicitly chose reset-on-boot over persistent storage for the demo. Both decisions are load-bearing for the deploy story.

**How to apply:** When changing build, runtime, or deployment, preserve: (1) no `src/` in the runtime image — only `dist/`, `node_modules/`, `package.json`, `drizzle/`; (2) `drizzle/` must be at `/app/drizzle` so `migrationsFolder: './drizzle'` resolves correctly; (3) better-sqlite3 native compile needs python3/make/g++ in the builder stage but NOT libsqlite3-dev (it bundles its own SQLite); (4) `npm prune --omit=dev` is done in the builder so the compiled `better_sqlite3.node` binding travels with the runtime stage.

Deploy commands the user runs locally:
- `fly launch --no-deploy --copy-config --name pricepulse-demo` (only the first time)
- `fly deploy`

Related: [[server-build-toolchain]] — the tsc build is what produces the artifacts copied into the runtime stage.
