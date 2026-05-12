import type { Request, RequestHandler } from 'express';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';

/**
 * Per-IP token-bucket rate limiter for tRPC mutations.
 *
 * Trade-offs (deliberate for v1):
 * - In-memory and per-instance: state does not survive process restarts and
 *   does not coordinate across multiple Fly machines. The alternative is a
 *   Redis-backed bucket; not worth the dependency for a demo. Swap to Redis
 *   if/when the deployment runs multiple replicas.
 * - X-Forwarded-For is trusted unconditionally. Fly's edge proxy sets it from
 *   the actual client, so trusting it is fine on Fly. In environments without
 *   a trusted reverse proxy in front, the header is spoofable and effectively
 *   lets a caller pick their own bucket.
 *
 * Batch accounting:
 * - The client uses tRPC v11 `httpBatchLink`, which packs N procedure calls
 *   into one POST: `/trpc/a.x,b.y?batch=1`. Charging 1 token per HTTP request
 *   would let a batch of N effectively multiply the configured ceiling by N.
 *   This limiter parses the comma-separated procedure list and charges one
 *   token per procedure. Single-procedure POSTs (count=1) behave identically
 *   to the pre-batching implementation.
 * - All-or-nothing: a batch that would overdraw the bucket is rejected as a
 *   whole. tRPC's batch link expects a single response array; partial-allow
 *   would force us to inject success entries we can't actually fulfill.
 */

export interface RateLimitOptions {
  /** Sustained refill rate (tokens added per minute). */
  mutationsPerMin: number;
  /** Bucket capacity; also the initial token count for a new bucket. */
  burst: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const MAX_BUCKETS = 10_000;

const TRPC_PATH_PREFIX = '/trpc/';
const TOO_MANY_REQUESTS_CODE = TRPC_ERROR_CODES_BY_KEY.TOO_MANY_REQUESTS;

/**
 * Parse the procedure count from a tRPC batch URL path.
 *
 * Path shape (after the `/trpc/` prefix): `a.x,b.y` (batch) or `a.x` (single).
 * The procedure list is the first path segment; anything after a stray `/`
 * is ignored defensively. Empty segments (from leading/trailing/duplicate
 * commas) are filtered. A malformed path that yields zero procedures still
 * costs one token — the request will reach the tRPC handler which returns
 * its own error, and we want to keep accounting for the bucket pressure.
 */
function countBatchProcedures(reqPath: string): number {
  const afterPrefix = reqPath.slice(TRPC_PATH_PREFIX.length);
  const firstSegment = afterPrefix.split('/')[0] ?? '';
  if (firstSegment.length === 0) return 1;
  const procedures = firstSegment.split(',').filter((p) => p.length > 0);
  return procedures.length === 0 ? 1 : procedures.length;
}

function extractClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (Array.isArray(fwd)) {
    const first = fwd[0];
    if (first && first.trim()) return first.trim();
  } else if (typeof fwd === 'string' && fwd.length > 0) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const remote = req.socket.remoteAddress;
  if (remote && remote.length > 0) return remote;
  return 'unknown';
}

export function createMutationRateLimiter(opts: RateLimitOptions): RequestHandler {
  const { mutationsPerMin, burst } = opts;
  const refillPerSec = mutationsPerMin / 60;
  const buckets = new Map<string, Bucket>();

  return function mutationRateLimiter(req, res, next) {
    // Predicate first: only POSTs to /trpc/* are subject to the limit.
    // Healthchecks (GET /), tRPC queries (GET /trpc/*), and static assets
    // skip the bucket entirely with zero overhead.
    if (req.method !== 'POST' || !req.path.startsWith('/trpc/')) {
      return next();
    }

    const now = Date.now();
    const ip = extractClientIp(req);

    let bucket = buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: burst, lastRefillMs: now };
      buckets.set(ip, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(burst, bucket.tokens + elapsedSec * refillPerSec);
      bucket.lastRefillMs = now;
    }

    // Lazy GC: when the map grows past the cap, drop entries that have
    // fully refilled — they carry no useful state.
    if (buckets.size > MAX_BUCKETS) {
      for (const [key, b] of buckets) {
        const elapsedSec = (now - b.lastRefillMs) / 1000;
        const refilled = Math.min(burst, b.tokens + elapsedSec * refillPerSec);
        if (refilled >= burst) buckets.delete(key);
      }
    }

    const procedureCount = countBatchProcedures(req.path);

    if (bucket.tokens >= procedureCount) {
      bucket.tokens -= procedureCount;
      return next();
    }

    const deficit = procedureCount - bucket.tokens;
    const retryAfterSec = Math.max(1, Math.min(60, Math.ceil(deficit / refillPerSec)));

    // tRPC error envelope (JSON-RPC shape) so the client can surface a
    // structured error instead of choking on an opaque body. The shape is
    // sensitive to batching mode:
    //   - httpBatchLink (`?batch=1`): response must be an array of N envelopes
    //   - httpLink (no batch flag): response must be a single envelope object
    // Detect via the query flag since req.path is already query-stripped.
    const isBatch = req.query['batch'] === '1';
    const envelope = {
      error: {
        json: {
          message: `Rate limit exceeded. Retry in ${retryAfterSec}s.`,
          code: TOO_MANY_REQUESTS_CODE,
          data: {
            code: 'TOO_MANY_REQUESTS',
            httpStatus: 429,
            retryAfterSec,
          },
        },
      },
    };
    const body = isBatch
      ? Array.from({ length: procedureCount }, () => envelope)
      : envelope;

    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json(body);
  };
}
