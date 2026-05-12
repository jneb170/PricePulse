---
name: rate-limit-batching
description: The Express rate limiter at src/server/rateLimit.ts counts one token per HTTP request, but tRPC v11 httpBatchLink batches multiple mutations into a single POST.
metadata:
  type: project
---

The Express rate limiter (`createMutationRateLimiter` in `src/server/rateLimit.ts`) consumes exactly one token per POST to `/trpc/*`. The client uses `httpBatchLink` (`src/client/main.tsx`), which packs multiple concurrent mutations into a single POST whose path looks like `/trpc/prices.override,prices.approve?batch=1`.

**Why:** The bucket charges per HTTP request, not per tRPC call. A batch of N mutations costs 1 token instead of N. Conversely, when the batch is rate-limited, ALL N mutations are rejected together (no half-applied state — the tRPC handler never runs), but the rate is effectively N× too lenient.

**How to apply:** Flag this on any re-audit of the rate limiter. Two reasonable fixes — (a) split the URL on commas in `req.path` after `/trpc/` and charge `tokens -= procedureCount`, or (b) switch the client to `splitLink({ true: httpBatchLink, false: httpLink })` per-operation so mutations bypass the batch. Either is a HIGH-severity correctness gap if rate limiting is load-bearing; for the demo it's MEDIUM. Additionally, the 429 body is `{error:'rate_limited',retryAfterSec}` plain JSON, not a tRPC envelope, so the client surfaces a parse-failure message instead of a useful retry hint — see [[rate-limit-429-shape]].
