import type { PricingRule, RuleAction } from '../db/schema/rules.js';

/**
 * Pure-function pricing engine — shared input/output types.
 *
 * The engine never touches the database. Callers (routers) read state from
 * the DB, build these plain objects, and pass them in. `now: Date` is always
 * injected, never read from `Date.now()` inside the engine, so the engine
 * stays deterministic and unit-testable.
 */

export type EngineItem = {
  id: string;
  storeId: string;
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  inventory: number;
  currentPriceCents: number;
  /** Item creation time — used to compute `daysSinceListed`. */
  listedAt: Date;
};

export type EngineSalesEvent = {
  itemId: string;
  quantity: number;
  soldAt: Date;
};

export type ItemVelocity = {
  itemId: string;
  /** Raw unit count in the trailing 24 hours. */
  velocity24h: number;
  /** Units per day, averaged over the trailing 7 days. */
  velocity7d: number;
};

export type EvaluateInput = {
  items: EngineItem[];
  velocities: Map<string, ItemVelocity>;
  rules: PricingRule[];
  now: Date;
};

/**
 * A single proposal emitted by the engine. Persistence (creating a pending
 * `price_changes` row + audit event) is the caller's job; the engine is pure.
 */
export type ProposedChange = {
  itemId: string;
  fromPriceCents: number;
  toPriceCents: number;
  /** Rule whose price-shifting action produced the proposal (multiply/set). */
  ruleId: string;
  ruleName: string;
};
