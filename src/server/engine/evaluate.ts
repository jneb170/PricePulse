import type { PricingRule, RuleAction, RuleConditions } from '../db/schema/rules.js';
import { daysSinceListed } from './velocity.js';
import type {
  EngineItem,
  EvaluateInput,
  ItemVelocity,
  ProposedChange,
} from './types.js';

/**
 * Pure rule evaluator.
 *
 * For every item we walk the rules in priority order (lower number first).
 * Matching multiply/set actions shift a "working price"; matching floor/
 * ceiling actions clamp it. The proposal is attributed to the LAST shifting
 * rule that fired — that's the rule a manager sees in the approval queue.
 *
 * Returns an array of proposals where the final price differs from the
 * current price. Order matches the input items.
 *
 * Pure: no I/O, no clock access. `now` is taken from `input.now`.
 *
 * Silent skip branches — by design, no audit event is written:
 *   1. No velocity row for the item → skipped silently.
 *      Reason: the engine can't evaluate velocity-based conditions without
 *      data; the caller is responsible for providing a velocity entry per
 *      item it wants evaluated (even if zero-valued).
 *   2. Only floor/ceiling rules matched (no shifter) → no proposal emitted.
 *      Reason: clamping a price to itself is a no-op; without a shifter
 *      there's nothing to attribute the change to and no state change to
 *      record.
 *   3. Final price equals current price after rounding → no proposal.
 *      Reason: a price change worth zero cents is not a state change.
 *
 * The project's audit-log contract is "every state change writes an event."
 * These three branches produce no state change, so no event is correct.
 * If you need per-item evaluation observability, return it from the
 * engine alongside `ProposedChange[]` — do not emit audit events.
 */
export function evaluate(input: EvaluateInput): ProposedChange[] {
  const proposals: ProposedChange[] = [];

  // Filter to enabled rules and sort by priority asc. Stable sort on (priority, id)
  // so ties resolve deterministically.
  const rules = input.rules
    .filter((r) => r.enabled)
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  for (const item of input.items) {
    const velocity = input.velocities.get(item.id);
    if (!velocity) continue; // skip items with no velocity row at all
    const proposal = evaluateItem(item, velocity, rules, input.now);
    if (proposal) proposals.push(proposal);
  }

  return proposals;
}

function evaluateItem(
  item: EngineItem,
  velocity: ItemVelocity,
  rules: PricingRule[],
  now: Date,
): ProposedChange | null {
  let working = item.currentPriceCents;
  let attributionRuleId: string | null = null;
  let attributionRuleName: string | null = null;

  const days = daysSinceListed(item.listedAt, now);

  for (const rule of rules) {
    if (!matches(rule.conditions, item, velocity, days)) continue;
    const next = applyAction(rule.action, working);
    const isShift = rule.action.type === 'multiply' || rule.action.type === 'set';
    if (isShift) {
      working = next;
      attributionRuleId = rule.id;
      attributionRuleName = rule.name;
    } else {
      // floor / ceiling — clamp the working price without changing attribution
      working = next;
    }
  }

  // No shifting rule fired → no proposal even if a clamp matched.
  if (!attributionRuleId || !attributionRuleName) return null;

  // Round to whole cents and forbid <= 0 prices.
  const finalPrice = Math.max(1, Math.round(working));
  if (finalPrice === item.currentPriceCents) return null;

  return {
    itemId: item.id,
    fromPriceCents: item.currentPriceCents,
    toPriceCents: finalPrice,
    ruleId: attributionRuleId,
    ruleName: attributionRuleName,
  };
}

function matches(
  c: RuleConditions,
  item: EngineItem,
  velocity: ItemVelocity,
  daysListed: number,
): boolean {
  if (c.velocity24hLt !== undefined && !(velocity.velocity24h < c.velocity24hLt)) return false;
  if (c.velocity24hGt !== undefined && !(velocity.velocity24h > c.velocity24hGt)) return false;
  if (c.velocity7dLt !== undefined && !(velocity.velocity7d < c.velocity7dLt)) return false;
  if (c.velocity7dGt !== undefined && !(velocity.velocity7d > c.velocity7dGt)) return false;
  if (c.inventoryLt !== undefined && !(item.inventory < c.inventoryLt)) return false;
  if (c.inventoryGt !== undefined && !(item.inventory > c.inventoryGt)) return false;
  if (c.daysSinceListedGt !== undefined && !(daysListed > c.daysSinceListedGt)) return false;
  if (c.category !== undefined && c.category.length > 0 && !c.category.includes(item.category)) {
    return false;
  }
  if (
    c.condition !== undefined &&
    c.condition.length > 0 &&
    !c.condition.includes(item.condition)
  ) {
    return false;
  }
  return true;
}

function applyAction(action: RuleAction, working: number): number {
  switch (action.type) {
    case 'multiply':
      return working * action.factor;
    case 'set':
      return action.valueCents;
    case 'floor':
      return working < action.minCents ? action.minCents : working;
    case 'ceiling':
      return working > action.maxCents ? action.maxCents : working;
  }
}
