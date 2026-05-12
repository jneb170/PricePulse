import type { DB } from './index.js';
import { auditEvents } from './schema/audit.js';
import type {
  AuditEntityType,
  AuditEventType,
  NewAuditEvent,
} from './schema/audit.js';

/**
 * Single point of truth for writing to the `audit_events` table.
 *
 * EVERY domain mutation must funnel through this function inside the
 * transaction that performed the mutation. Never call this outside a
 * transaction, and never INSERT into `audit_events` from anywhere else.
 *
 * The `tx` parameter is the Drizzle transaction handle (or, for tests,
 * the bare db handle — they share the same shape via BaseSQLiteDatabase).
 * Refusing to accept the bare db type in normal code is enforced by
 * convention: callers in routers always start with `db.transaction((tx) => …)`.
 */

export type AuditEventInput = {
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string;
  /** Null = system actor (e.g. the rule engine). */
  actorId: string | null;
  /** Full pre/post context so the event can be understood in isolation. */
  payload: Record<string, unknown>;
  /** Defaults to "now" if omitted. */
  occurredAt?: Date;
};

/** A Drizzle transaction is structurally a DB minus the `transaction` method. */
type AuditTx = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

export function writeAuditEvent(tx: AuditTx, event: AuditEventInput): void {
  const row: NewAuditEvent = {
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    payload: event.payload,
    occurredAt: event.occurredAt ?? new Date(),
  };
  tx.insert(auditEvents).values(row).run();
}
