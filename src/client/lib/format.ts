/**
 * Display helpers. The single source of truth for converting wire formats
 * (integer cents, ISO date strings) into human-readable text. UI code must
 * never render `currentPriceCents` as a number directly.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Integer cents → "$12.99". Never call this with dollars. */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** Units per day, formatted with appropriate precision. */
export function formatVelocity(perDay: number): string {
  if (!Number.isFinite(perDay) || perDay <= 0) return '0/day';
  if (perDay < 0.1) return '<0.1/day';
  if (perDay < 10) return `${perDay.toFixed(1)}/day`;
  return `${Math.round(perDay)}/day`;
}

const RTF = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** ISO date string → "5 minutes ago" / "2 days ago" / "just now". */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 5) return 'just now';
  if (abs < 60) return RTF.format(diffSec, 'second');
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 7) return RTF.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 30) return RTF.format(Math.round(diffSec / 86400 / 7), 'week');
  if (abs < 86400 * 365) return RTF.format(Math.round(diffSec / 86400 / 30), 'month');
  return RTF.format(Math.round(diffSec / 86400 / 365), 'year');
}

/** ISO date string → "May 11, 2026, 3:42 PM" (absolute, for tooltips). */
export function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
