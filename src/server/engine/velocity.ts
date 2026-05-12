import type { EngineSalesEvent, ItemVelocity } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure velocity computation.
 *
 *   velocity24h — raw unit count sold in the trailing 24 hours, ending at `now`.
 *   velocity7d  — average units per day over the trailing 7 days (count / 7).
 *
 * No I/O. `now` is injected so tests can pin the clock.
 *
 * The returned Map covers every itemId in `itemIds` with explicit zeros for
 * items that have no sales — callers can do `velocities.get(item.id)!`
 * without nullability dances.
 */
export function computeVelocities(
  sales: readonly EngineSalesEvent[],
  itemIds: readonly string[],
  now: Date,
): Map<string, ItemVelocity> {
  const nowMs = now.getTime();
  const cutoff24h = nowMs - DAY_MS;
  const cutoff7d = nowMs - 7 * DAY_MS;

  const v24h = new Map<string, number>();
  const v7d = new Map<string, number>();
  for (const id of itemIds) {
    v24h.set(id, 0);
    v7d.set(id, 0);
  }

  for (const e of sales) {
    const t = e.soldAt.getTime();
    if (t > nowMs) continue; // future events are ignored
    if (t > cutoff7d) {
      v7d.set(e.itemId, (v7d.get(e.itemId) ?? 0) + e.quantity);
    }
    if (t > cutoff24h) {
      v24h.set(e.itemId, (v24h.get(e.itemId) ?? 0) + e.quantity);
    }
  }

  const out = new Map<string, ItemVelocity>();
  for (const id of itemIds) {
    out.set(id, {
      itemId: id,
      velocity24h: v24h.get(id) ?? 0,
      velocity7d: (v7d.get(id) ?? 0) / 7,
    });
  }
  return out;
}

/** Whole days between `listedAt` and `now`, floored, never negative. */
export function daysSinceListed(listedAt: Date, now: Date): number {
  const diff = now.getTime() - listedAt.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}
