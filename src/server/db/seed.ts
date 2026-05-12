/**
 * Seed script for the dynamic pricing demo.
 *
 * Generates a believable starting state for the demo:
 *   - 11 fictional thrift stores under a single fictional chain
 *   - 3 manager users for the approval workflow
 *   - ~80 items per store across donated-goods categories
 *   - 30 days of sales history with realistic per-item velocity
 *   - 5 starter pricing rules
 *   - ~12 pending price changes (as if the rule engine just ran)
 *
 * Run with: `npm run db:seed`
 *
 * The script is deterministic (seeded PRNG) so the demo state is reproducible
 * across resets. Reset with: `rm ./data/dev.db && npm run db:migrate && npm run db:seed`
 */

import { db, schema } from './index.js';
import type { RuleConditions, RuleAction } from './schema/rules.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic so the demo is reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const randChoice = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const randFloat = (min: number, max: number) => rng() * (max - min) + min;

// ---------------------------------------------------------------------------
// Static seed data
// ---------------------------------------------------------------------------

const STORE_LOCATIONS = [
  'Oakland — Grand Ave',
  'Oakland — Rockridge',
  'Berkeley — Shattuck',
  'San Francisco — Mission',
  'San Francisco — Richmond',
  'San Francisco — Castro',
  'Alameda — Park St',
  'San Mateo — Downtown',
  'Hayward — B St',
  'Fremont — Centerville',
  'Walnut Creek — Main',
];

const USERS = [
  { name: 'Alex Rivera', email: 'alex@handmeup.example', role: 'manager' as const },
  { name: 'Sam Chen', email: 'sam@handmeup.example', role: 'manager' as const },
  { name: 'Jordan Patel', email: 'jordan@handmeup.example', role: 'manager' as const },
];

type ItemTemplate = {
  category: string;
  names: string[];
  priceRangeCents: [number, number];
  // Mean daily sales rate, used to draw a per-item "true demand" with noise.
  baselineVelocity: number;
};

const ITEM_TEMPLATES: ItemTemplate[] = [
  {
    category: 'clothing',
    names: ["Men's flannel shirt", "Women's denim jacket", 'Wool sweater', 'Cotton t-shirt', 'Summer dress', "Kids' hoodie", 'Cargo pants', 'Leather belt'],
    priceRangeCents: [300, 2500],
    baselineVelocity: 1.2,
  },
  {
    category: 'books',
    names: ['Hardcover novel', 'Paperback mystery', 'Cookbook', "Children's picture book", 'Travel guide', 'Self-help book', 'Art monograph'],
    priceRangeCents: [100, 800],
    baselineVelocity: 0.8,
  },
  {
    category: 'furniture',
    names: ['Wooden chair', 'Floor lamp', 'Side table', 'Bookshelf', 'Coffee table', 'Dresser', 'Mirror'],
    priceRangeCents: [1500, 15000],
    baselineVelocity: 0.15,
  },
  {
    category: 'electronics',
    names: ['Bluetooth speaker', 'Desk lamp', 'Coffee maker', 'Toaster', 'Record player', 'Hair dryer', 'Vintage radio'],
    priceRangeCents: [500, 5000],
    baselineVelocity: 0.4,
  },
  {
    category: 'housewares',
    names: ['Ceramic mug', 'Dinner plate set', 'Glass vase', 'Picture frame', 'Cutting board', 'Throw pillow', 'Wall clock'],
    priceRangeCents: [200, 1500],
    baselineVelocity: 0.9,
  },
  {
    category: 'toys',
    names: ['Stuffed bear', 'Board game', 'Wooden puzzle', 'Action figure', 'Dollhouse', 'Building blocks'],
    priceRangeCents: [200, 2000],
    baselineVelocity: 0.5,
  },
];

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
// Bias toward 'good' — most donated stock is mid-condition.
const CONDITION_WEIGHTS = [0.05, 0.25, 0.55, 0.15];

function weightedCondition() {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < CONDITIONS.length; i++) {
    acc += CONDITION_WEIGHTS[i]!;
    if (r < acc) return CONDITIONS[i]!;
  }
  return 'good';
}

// ---------------------------------------------------------------------------
// Seed routine
// ---------------------------------------------------------------------------

export async function seed() {
  console.log('seeding database...');

  // Clear in reverse FK order so subsequent inserts are clean.
  db.delete(schema.auditEvents).run();
  db.delete(schema.salesEvents).run();
  db.delete(schema.priceChanges).run();
  db.delete(schema.items).run();
  db.delete(schema.stores).run();
  db.delete(schema.pricingRules).run();
  db.delete(schema.users).run();

  // --- Users -------------------------------------------------------------
  const insertedUsers = db.insert(schema.users).values(USERS).returning().all();
  console.log(`  ${insertedUsers.length} users`);

  // --- Stores ------------------------------------------------------------
  const insertedStores = db
    .insert(schema.stores)
    .values(
      STORE_LOCATIONS.map((location, i) => ({
        name: `Hand-Me-Up #${i + 1}`,
        location,
      })),
    )
    .returning()
    .all();
  console.log(`  ${insertedStores.length} stores`);

  // --- Items -------------------------------------------------------------
  // Each store gets ~80 items, sampled across categories.
  type ItemSeed = {
    item: typeof schema.items.$inferSelect;
    template: ItemTemplate;
    // Per-item "true" daily demand. Used to generate the sales history.
    trueVelocity: number;
    daysListed: number;
  };

  const itemSeeds: ItemSeed[] = [];

  for (const store of insertedStores) {
    const rows = [];
    for (let i = 0; i < 80; i++) {
      const tmpl = randChoice(ITEM_TEMPLATES);
      const baseName = randChoice(tmpl.names);
      const [minPrice, maxPrice] = tmpl.priceRangeCents;
      rows.push({
        storeId: store.id,
        sku: `${tmpl.category.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
        name: baseName,
        category: tmpl.category,
        condition: weightedCondition(),
        inventory: randInt(1, 25),
        currentPriceCents: randInt(minPrice, maxPrice),
      });
    }
    const inserted = db.insert(schema.items).values(rows).returning().all();
    inserted.forEach((item, idx) => {
      const tmpl = ITEM_TEMPLATES.find((t) => t.category === item.category)!;
      itemSeeds.push({
        item,
        template: tmpl,
        // Multiply baseline by a per-item factor in [0.1, 3.0] to create
        // genuine winners and losers — the rule engine needs both.
        trueVelocity: tmpl.baselineVelocity * randFloat(0.1, 3.0),
        daysListed: randInt(1, 60),
      });
    });
  }
  console.log(`  ${itemSeeds.length} items`);

  // --- Sales events ------------------------------------------------------
  // For each item, generate sales over the last 30 days using a coarse
  // Poisson-ish process: each day, flip a coin per "expected unit" with
  // some noise. Capped at inventory to keep things consistent.
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const salesRows: Array<typeof schema.salesEvents.$inferInsert> = [];

  for (const { item, trueVelocity, daysListed } of itemSeeds) {
    const days = Math.min(daysListed, 30);
    for (let d = 0; d < days; d++) {
      // Expected sales today = trueVelocity, noisy.
      const expected = Math.max(0, trueVelocity * randFloat(0.3, 1.7));
      const unitsToday = Math.min(item.inventory, Math.round(expected));
      for (let u = 0; u < unitsToday; u++) {
        // Random time within the day, weighted slightly toward afternoon.
        const dayStart = now - (d + 1) * DAY_MS;
        const offset = (0.3 + rng() * 0.6) * DAY_MS;
        salesRows.push({
          itemId: item.id,
          storeId: item.storeId,
          quantity: 1,
          // Sale price wobbles around current price ± 10% to simulate past changes.
          unitPriceCents: Math.round(item.currentPriceCents * randFloat(0.9, 1.1)),
          soldAt: new Date(dayStart + offset),
        });
      }
    }
  }

  // Batch insert in chunks to avoid SQLite parameter limits (~999 by default).
  const CHUNK = 500;
  for (let i = 0; i < salesRows.length; i += CHUNK) {
    db.insert(schema.salesEvents).values(salesRows.slice(i, i + CHUNK)).run();
  }
  console.log(`  ${salesRows.length} sales events`);

  // --- Pricing rules -----------------------------------------------------
  const RULES: Array<{
    name: string;
    description: string;
    conditions: RuleConditions;
    action: RuleAction;
    priority: number;
  }> = [
    {
      name: 'Mark down slow movers',
      description: 'Items with <0.5 sales/day in last 24h and >5 in stock get 10% off.',
      conditions: { velocity24hLt: 0.5, inventoryGt: 5, daysSinceListedGt: 7 },
      action: { type: 'multiply', factor: 0.9 },
      priority: 100,
    },
    {
      name: 'Aggressive markdown on dead stock',
      description: 'Items listed >30 days with almost no movement get 25% off.',
      conditions: { velocity7dLt: 0.1, daysSinceListedGt: 30 },
      action: { type: 'multiply', factor: 0.75 },
      priority: 90,
    },
    {
      name: 'Push hot books',
      description: 'Books moving >2/day get a 10% price bump.',
      conditions: { category: ['books'], velocity24hGt: 2 },
      action: { type: 'multiply', factor: 1.1 },
      priority: 80,
    },
    {
      name: 'Clear out fair-condition clothing',
      description: 'Fair-condition clothing gets 30% off to make room for new stock.',
      conditions: { category: ['clothing'], condition: ['fair'] },
      action: { type: 'multiply', factor: 0.7 },
      priority: 110,
    },
    {
      name: 'Minimum price floor',
      description: 'Never let any item drop below $1.',
      conditions: {},
      action: { type: 'floor', minCents: 100 },
      priority: 200,
    },
  ];

  const insertedRules = db.insert(schema.pricingRules).values(RULES).returning().all();
  console.log(`  ${insertedRules.length} pricing rules`);

  // --- Pending price changes --------------------------------------------
  // Simulate the rule engine running an hour ago and leaving suggestions
  // for the manager to approve. ~12 of them so the dashboard has work to do.
  const pendingTargets = itemSeeds
    .filter(({ trueVelocity, item }) => trueVelocity < 0.3 && item.inventory > 5)
    .slice(0, 12);

  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const markdownRule = insertedRules.find((r) => r.name === 'Mark down slow movers')!;

  for (const { item } of pendingTargets) {
    const newPrice = Math.round(item.currentPriceCents * 0.9);
    const change = db
      .insert(schema.priceChanges)
      .values({
        itemId: item.id,
        fromPriceCents: item.currentPriceCents,
        toPriceCents: newPrice,
        reason: 'rule_fired',
        ruleId: markdownRule.id,
        status: 'pending',
        proposedAt: oneHourAgo,
      })
      .returning()
      .get();

    // Every proposal writes a domain event.
    db.insert(schema.auditEvents).values({
      eventType: 'price_change.proposed',
      entityType: 'price_change',
      entityId: change.id,
      actorId: null, // system
      payload: {
        itemId: item.id,
        fromPriceCents: item.currentPriceCents,
        toPriceCents: newPrice,
        ruleId: markdownRule.id,
        ruleName: markdownRule.name,
      },
      occurredAt: oneHourAgo,
    }).run();
  }
  console.log(`  ${pendingTargets.length} pending price changes (with audit events)`);

  console.log('seed complete.');
}

// Only auto-execute when invoked directly as a script (e.g. `tsx seed.ts`).
// When imported (e.g. by reset-db.ts), the caller controls invocation.
import { pathToFileURL } from 'node:url';

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  seed().catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
}
