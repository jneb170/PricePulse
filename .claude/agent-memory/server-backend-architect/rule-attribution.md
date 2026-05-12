---
name: rule-attribution
description: Pricing engine attributes proposals to the last shifting (multiply/set) rule that fired; floor/ceiling clamp but never own attribution
metadata:
  type: project
---

The pricing engine in `src/server/engine/evaluate.ts` walks enabled rules sorted by `priority asc` (lower number = higher priority). It maintains a working price and tracks attribution: every `multiply`/`set` action that matches updates the working price AND becomes the new attribution; every `floor`/`ceiling` action that matches clamps the working price WITHOUT touching attribution.

A proposal is emitted only if (a) at least one shifting rule fired AND (b) the final price differs from `currentPriceCents`. A floor/ceiling rule that matches but has no shifter to clamp produces nothing — clamping a value to itself is a no-op.

**Why:** the seed includes a `Minimum price floor` rule (priority 200, empty conditions) that always matches. If floors owned attribution, every proposal would show "Minimum price floor" instead of the rule a manager actually cares about ("Mark down slow movers", etc).

**How to apply:**
- When adding new action types, decide whether they shift attribution (price-defining) or merely clamp (guardrails). Update `evaluateItem` in `engine/evaluate.ts` accordingly.
- Tie-breaking for equal priorities is by rule id ascending — stable and deterministic across runs.
- The engine never reads `Date.now()`. `now` is always injected through `EvaluateInput.now` — see [[sync-transactions]] for how routers construct it once per call.
