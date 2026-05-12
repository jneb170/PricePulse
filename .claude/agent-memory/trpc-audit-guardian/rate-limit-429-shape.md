---
name: rate-limit-429-shape
description: The 429 response from rateLimit.ts is plain JSON, not a tRPC error envelope, so tRPC's httpBatchLink surfaces it as an opaque parse error in the UI.
metadata:
  type: project
---

`src/server/rateLimit.ts` responds to rate-limited requests with `res.status(429).json({ error: 'rate_limited', retryAfterSec })`. The Express middleware short-circuits before the tRPC handler runs, so the body is NOT a tRPC `TRPCResponse[]` envelope.

**Why:** `httpBatchLink` parses every response body as a tRPC envelope. A 429 plain-JSON response either throws inside the link or produces a generic error message like "Unexpected end of JSON input" or "Cannot read properties of undefined". The user sees that string in `mutation.error.message`, not the intended "Too many requests, retry in N seconds." See [[rate-limit-batching]] for the related batching gap.

**How to apply:** When auditing this path, recommend one of: (a) shape the 429 body as a tRPC error envelope per batch entry, (b) use a custom tRPC link on the client that detects 429 + Retry-After before the batch parser runs, or (c) accept the rough UX and document it as a demo limitation. The half-applied-state risk is zero (limiter runs before the tRPC handler, which means the transaction never opens) — this is purely a user-facing error-message issue. MEDIUM severity for the demo, HIGH if shipped to real users.
