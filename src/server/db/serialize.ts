import type { Store } from './schema/stores.js';
import type { PricingRule } from './schema/rules.js';
import type { Item } from './schema/items.js';
import type { PriceChange } from './schema/prices.js';
import type { AuditEvent } from './schema/audit.js';

export const isoOrNull = (d: Date | null): string | null =>
  d ? d.toISOString() : null;

export type SerializedStore = Omit<Store, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export const serializeStore = (s: Store): SerializedStore => ({
  ...s,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

export type SerializedPricingRule = Omit<PricingRule, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export const serializePricingRule = (r: PricingRule): SerializedPricingRule => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export type SerializedItem = Omit<Item, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export const serializeItem = (i: Item): SerializedItem => ({
  ...i,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
});

export type SerializedPriceChange = Omit<
  PriceChange,
  'proposedAt' | 'decidedAt' | 'appliedAt'
> & {
  proposedAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
};
export const serializePriceChange = (p: PriceChange): SerializedPriceChange => ({
  ...p,
  proposedAt: p.proposedAt.toISOString(),
  decidedAt: isoOrNull(p.decidedAt),
  appliedAt: isoOrNull(p.appliedAt),
});

export type SerializedAuditEvent = Omit<AuditEvent, 'occurredAt'> & {
  occurredAt: string;
};
export const serializeAuditEvent = (e: AuditEvent): SerializedAuditEvent => ({
  ...e,
  occurredAt: e.occurredAt.toISOString(),
});
