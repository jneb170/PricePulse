import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router.js';
import { createContext } from './trpc.js';
import { createMutationRateLimiter } from './rateLimit.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === 'production';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[rate-limit] Invalid ${name}=${raw}; using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

const mutationsPerMin = parsePositiveIntEnv('RATE_LIMIT_MUTATIONS_PER_MIN', 10);
const burst = parsePositiveIntEnv('RATE_LIMIT_BURST', 20);

app.use(createMutationRateLimiter({ mutationsPerMin, burst }));

// Same-origin posture: in production this Express process serves both the
// built SPA (from `dist/client`) and the tRPC API at `/trpc`, so the browser
// sees them as the same origin and no CORS middleware is required. In dev,
// the Vite proxy in `vite.config.ts` (`^/trpc/` -> `http://localhost:3001`)
// makes the client appear same-origin from the Vite dev server too. Do not
// add `cors()` "just to be safe" — it would weaken the same-origin guarantee;
// any future cross-origin client should be added to an explicit allowlist
// instead. The rate limiter above is intentionally POST + `/trpc/`-only, so
// Fly's `GET /` healthcheck (`fly.toml`) is naturally excluded.
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

if (isProduction) {
  // Serve the built SPA. When running compiled code from `dist/server/index.js`,
  // `__dirname` resolves to `dist/server`, so `../client` points at `dist/client`.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.join(__dirname, '../client');

  app.use(express.static(staticDir));

  // SPA catch-all: any non-/trpc request that didn't match a static asset
  // gets the index.html so react-router can resolve the deep link.
  // Skip /trpc so a missing tRPC procedure returns the proper 404 instead of HTML.
  app.get(/^(?!\/trpc(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ name: 'PricePulse API', version: '0.0.0' });
  });
}

app.listen(port, () => {
  console.log(`PricePulse server listening on http://localhost:${port}`);
});
