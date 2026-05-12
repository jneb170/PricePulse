import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVelocities, daysSinceListed } from '../velocity';

const NOW = new Date('2026-05-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe('computeVelocities', () => {
  it('counts only sales within the trailing 24h for velocity24h', () => {
    const sales = [
      { itemId: 'a', quantity: 1, soldAt: hoursAgo(1) },
      { itemId: 'a', quantity: 2, soldAt: hoursAgo(12) },
      { itemId: 'a', quantity: 1, soldAt: hoursAgo(25) }, // outside 24h
    ];
    const v = computeVelocities(sales, ['a'], NOW);
    assert.equal(v.get('a')!.velocity24h, 3);
  });

  it('averages over 7 days for velocity7d (count/7)', () => {
    const sales = [
      // 14 units over the last 7 days = 2/day
      ...Array.from({ length: 14 }, (_, i) => ({
        itemId: 'a',
        quantity: 1,
        soldAt: hoursAgo(i + 1),
      })),
      // older than 7 days — excluded
      { itemId: 'a', quantity: 100, soldAt: daysAgo(8) },
    ];
    const v = computeVelocities(sales, ['a'], NOW);
    assert.equal(v.get('a')!.velocity7d, 2);
  });

  it('produces explicit zero entries for items with no sales', () => {
    const v = computeVelocities([], ['a', 'b'], NOW);
    assert.deepEqual(v.get('a'), { itemId: 'a', velocity24h: 0, velocity7d: 0 });
    assert.deepEqual(v.get('b'), { itemId: 'b', velocity24h: 0, velocity7d: 0 });
  });

  it('ignores future-dated sales events', () => {
    const sales = [
      { itemId: 'a', quantity: 5, soldAt: new Date(NOW.getTime() + 60_000) },
    ];
    const v = computeVelocities(sales, ['a'], NOW);
    assert.equal(v.get('a')!.velocity24h, 0);
  });
});

describe('daysSinceListed', () => {
  it('returns 0 for now-or-future timestamps', () => {
    assert.equal(daysSinceListed(NOW, NOW), 0);
    assert.equal(daysSinceListed(hoursAgo(-5), NOW), 0);
  });

  it('floors to whole days', () => {
    assert.equal(daysSinceListed(hoursAgo(23), NOW), 0);
    assert.equal(daysSinceListed(hoursAgo(25), NOW), 1);
    assert.equal(daysSinceListed(daysAgo(30), NOW), 30);
  });
});
