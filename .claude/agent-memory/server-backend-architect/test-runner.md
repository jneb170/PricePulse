---
name: test-runner
description: PricePulse has no vitest/jest dep — server-side tests use Node's built-in node:test runner via tsx
metadata:
  type: project
---

The PricePulse repo does not depend on vitest or jest. Server-side unit tests use Node's built-in `node:test` module with `node:assert/strict`, executed via `tsx --test`. The `npm test` script (added during initial resolver implementation) runs `tsx --test src/server/**/*.test.ts`.

**Why:** the existing package.json had no test runner installed. Adding vitest would have introduced a new top-level dependency, which the task scope didn't ask for. `node:test` works out of the box with tsx.

**How to apply:** when writing new server-side tests, import `{ describe, it }` from `node:test` and `assert` from `node:assert/strict`. Place test files under `src/server/**/__tests__/*.test.ts`. The engine pure-function tests under `src/server/engine/__tests__/` are the working pattern to copy.
