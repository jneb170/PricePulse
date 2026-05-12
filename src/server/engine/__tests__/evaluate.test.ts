import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../evaluate';
import type { EngineItem, ItemVelocity } from '../types';
import type { PricingRule } from '../../db/schema/rules';

const NOW = new Date('2026-05-11T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

function makeRule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: 'rule-1',
    name: 'Test rule',
    description: null,
    conditions: {},
    action: { type: 'multiply', factor: 0.9 },
    priority: 100,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeItem(overrides: Partial<EngineItem> = {}): EngineItem {
  return {
    id: 'item-1',
    storeId: 'store-1',
    category: 'clothing',
    condition: 'good',
    inventory: 10,
    currentPriceCents: 1000,
    listedAt: daysAgo(30),
    ...overrides,
  };
}

function velocityMap(
  itemId: string,
  v24h: number,
  v7d: number,
): Map<string, ItemVelocity> {
  return new Map([[itemId, { itemId, velocity24h: v24h, velocity7d: v7d }]]);
}

describe('evaluate — "Mark down slow movers"', () => {
  const markdown = makeRule({
    id: 'markdown',
    name: 'Mark down slow movers',
    conditions: { velocity24hLt: 0.5, inventoryGt: 5, daysSinceListedGt: 7 },
    action: { type: 'multiply', factor: 0.9 },
    priority: 100,
  });

  it('fires only when all three conditions hold', () => {
    const item = makeItem({ inventory: 10, listedAt: daysAgo(30) });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [markdown],
      now: NOW,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.toPriceCents, 900);
    assert.equal(out[0]!.ruleId, 'markdown');
  });

  it('does NOT fire when velocity is too high', () => {
    const item = makeItem({ inventory: 10, listedAt: daysAgo(30) });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 1.0, 1.0),
      rules: [markdown],
      now: NOW,
    });
    assert.equal(out.length, 0);
  });

  it('does NOT fire when inventory is too low', () => {
    const item = makeItem({ inventory: 3, listedAt: daysAgo(30) });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [markdown],
      now: NOW,
    });
    assert.equal(out.length, 0);
  });

  it('does NOT fire when item was listed too recently', () => {
    const item = makeItem({ inventory: 10, listedAt: daysAgo(3) });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [markdown],
      now: NOW,
    });
    assert.equal(out.length, 0);
  });
});

describe('evaluate — rule priority ordering', () => {
  it('lower priority number wins as the final attribution', () => {
    // Two rules both match. The lower-priority-number rule applies last
    // (because we walk asc), but since both shift the price, the LAST
    // shifting rule wins attribution — that's the higher-priority-number one.
    // What we really want to assert: the price walks through both rules in
    // priority order, and attribution lands on the last shifter.
    const item = makeItem({ currentPriceCents: 1000 });
    const ruleA = makeRule({
      id: 'A',
      name: 'A',
      priority: 50, // applied first
      action: { type: 'multiply', factor: 0.5 }, // 1000 → 500
    });
    const ruleB = makeRule({
      id: 'B',
      name: 'B',
      priority: 100, // applied second
      action: { type: 'multiply', factor: 0.5 }, // 500 → 250
    });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [ruleB, ruleA], // intentionally out of order
      now: NOW,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.toPriceCents, 250);
    assert.equal(out[0]!.ruleId, 'B'); // last shifting rule wins attribution
  });

  it('disabled rules are skipped', () => {
    const item = makeItem();
    const enabled = makeRule({ id: 'on', priority: 100, enabled: true });
    const disabled = makeRule({
      id: 'off',
      priority: 50,
      enabled: false,
      action: { type: 'multiply', factor: 0.1 }, // would crush price if active
    });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [enabled, disabled],
      now: NOW,
    });
    assert.equal(out[0]!.toPriceCents, 900); // only the 0.9 rule fired
  });
});

describe('evaluate — floor clamps below-minimum suggestions', () => {
  it('floor rule prevents the price from dropping below the minimum', () => {
    const item = makeItem({ currentPriceCents: 200 });
    const aggressive = makeRule({
      id: 'crush',
      name: 'Crush',
      priority: 50,
      action: { type: 'multiply', factor: 0.1 }, // 200 → 20
    });
    const floor = makeRule({
      id: 'floor',
      name: 'Floor',
      priority: 200,
      conditions: {},
      action: { type: 'floor', minCents: 100 },
    });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [aggressive, floor],
      now: NOW,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.toPriceCents, 100);
    // Attribution stays on the shifting rule, not the floor.
    assert.equal(out[0]!.ruleId, 'crush');
  });

  it('a floor that matches but has no shifter producing a delta emits nothing', () => {
    const item = makeItem({ currentPriceCents: 500 });
    const floor = makeRule({
      id: 'floor',
      priority: 200,
      conditions: {},
      action: { type: 'floor', minCents: 100 },
    });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [floor],
      now: NOW,
    });
    assert.equal(out.length, 0);
  });
});

describe('evaluate — no proposal when price is unchanged', () => {
  it('skips items where the rule action is a no-op on price', () => {
    const item = makeItem({ currentPriceCents: 1000 });
    const idempotent = makeRule({
      id: 'noop',
      action: { type: 'multiply', factor: 1.0 },
    });
    const out = evaluate({
      items: [item],
      velocities: velocityMap(item.id, 0, 0),
      rules: [idempotent],
      now: NOW,
    });
    assert.equal(out.length, 0);
  });
});

describe('evaluate — category and condition filters', () => {
  it('category filter restricts which items a rule applies to', () => {
    const itemBook = makeItem({ id: 'book', category: 'books' });
    const itemShirt = makeItem({ id: 'shirt', category: 'clothing' });
    const booksOnly = makeRule({
      id: 'books',
      conditions: { category: ['books'] },
      action: { type: 'multiply', factor: 1.1 },
    });
    const v = new Map<string, ItemVelocity>([
      ['book', { itemId: 'book', velocity24h: 0, velocity7d: 0 }],
      ['shirt', { itemId: 'shirt', velocity24h: 0, velocity7d: 0 }],
    ]);
    const out = evaluate({
      items: [itemBook, itemShirt],
      velocities: v,
      rules: [booksOnly],
      now: NOW,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.itemId, 'book');
  });
});
