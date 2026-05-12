import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { users } from './users.js';

/**
 * Audit events — append-only domain event log.
 *
 * This table is the operational backbone of the system. Every state-changing
 * action writes an event here in the same transaction as the state change.
 * Treat it as immutable: no UPDATE, no DELETE in the application layer.
 *
 * The payload column holds the full pre/post context of what happened so
 * an event can be understood without joining back to the source table
 * (useful when a record is later deleted or modified).
 *
 * Event types follow `<domain>.<verb>` naming:
 *   - price_change.proposed
 *   - price_change.approved
 *   - price_change.rejected
 *   - price_change.applied
 *   - price_change.reverted
 *   - rule.created / rule.updated / rule.deleted
 *   - rule.enabled / rule.disabled
 *   - store.created / store.updated
 *   - item.created / item.updated
 */

export const AUDIT_EVENT_TYPES = [
  'price_change.proposed',
  'price_change.approved',
  'price_change.rejected',
  'price_change.applied',
  'price_change.reverted',
  'rule.created',
  'rule.updated',
  'rule.deleted',
  'rule.enabled',
  'rule.disabled',
  'store.created',
  'store.updated',
  'item.created',
  'item.updated',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_ENTITY_TYPES = ['price_change', 'rule', 'store', 'item'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    eventType: text('event_type').$type<AuditEventType>().notNull(),
    entityType: text('entity_type').$type<AuditEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    // Null actor = 'system' (rule engine). Otherwise references users.id.
    actorId: text('actor_id').references(() => users.id),
    // Full snapshot of relevant context: { before, after, reason, ruleId, ... }
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    occurredAtIdx: index('audit_events_occurred_at_idx').on(table.occurredAt),
    entityIdx: index('audit_events_entity_idx').on(table.entityType, table.entityId),
    eventTypeIdx: index('audit_events_event_type_idx').on(table.eventType),
  }),
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, {
    fields: [auditEvents.actorId],
    references: [users.id],
  }),
}));

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
