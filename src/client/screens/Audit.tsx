import { useMemo, useState } from 'react'
import type { inferRouterOutputs } from '@trpc/server'
import { trpc } from '../trpc'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { LoadingBlock } from '../components/Spinner'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import {
  formatAbsoluteTime,
  formatCents,
  formatRelativeTime,
} from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import type { AppRouter } from '../../server/router'

type RouterOutput = inferRouterOutputs<AppRouter>
type AuditPage = RouterOutput['audit']['list']
type AuditEvent = AuditPage['events'][number]

// Keep in sync with AUDIT_EVENT_TYPES / AUDIT_ENTITY_TYPES in
// src/server/db/schema/audit.ts. Duplicated deliberately so the client
// never runtime-imports from the server.
const EVENT_TYPES = [
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
] as const

type EventType = (typeof EVENT_TYPES)[number]

const ENTITY_TYPES = ['price_change', 'rule', 'store', 'item'] as const
type EntityType = (typeof ENTITY_TYPES)[number]

const EVENT_TONE: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'slate' | 'cyan'> = {
  'price_change.proposed': 'blue',
  'price_change.approved': 'green',
  'price_change.applied': 'green',
  'price_change.rejected': 'red',
  'price_change.reverted': 'amber',
  'rule.created': 'violet',
  'rule.updated': 'violet',
  'rule.deleted': 'red',
  'rule.enabled': 'green',
  'rule.disabled': 'slate',
  'store.created': 'cyan',
  'store.updated': 'cyan',
  'item.created': 'cyan',
  'item.updated': 'cyan',
}

export function AuditScreen() {
  usePageTitle('Audit log')
  const [eventType, setEventType] = useState<EventType | ''>('')
  const [entityType, setEntityType] = useState<EntityType | ''>('')
  const [since, setSince] = useState<string>('')
  const [until, setUntil] = useState<string>('')

  // ISO bounds — input type=date gives YYYY-MM-DD; expand to start/end of day.
  const sinceIso = useMemo(
    () => (since ? new Date(since + 'T00:00:00').toISOString() : undefined),
    [since],
  )
  const untilIso = useMemo(
    () => (until ? new Date(until + 'T23:59:59.999').toISOString() : undefined),
    [until],
  )

  const q = trpc.audit.list.useInfiniteQuery(
    {
      limit: 50,
      eventType: eventType || undefined,
      entityType: entityType || undefined,
      since: sinceIso,
      until: untilIso,
    },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  )

  const allEvents = useMemo(
    () => q.data?.pages.flatMap((p) => p.events) ?? [],
    [q.data],
  )

  const hasFilters = !!eventType || !!entityType || !!since || !!until
  const clearFilters = () => {
    setEventType('')
    setEntityType('')
    setSince('')
    setUntil('')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Audit log</h1>
        <p className="text-xs text-slate-500">
          Append-only event stream. Every state change appears here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <label htmlFor="filter-event" className="block text-xs text-slate-600">
            Event type
          </label>
          <select
            id="filter-event"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType | '')}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-entity" className="block text-xs text-slate-600">
            Entity type
          </label>
          <select
            id="filter-entity"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType | '')}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-since" className="block text-xs text-slate-600">
            Since
          </label>
          <input
            id="filter-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label htmlFor="filter-until" className="block text-xs text-slate-600">
            Until
          </label>
          <input
            id="filter-until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          />
        </div>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading audit log…" />
      ) : q.error ? (
        <ErrorState
          error={q.error}
          onRetry={() => q.refetch()}
          title="Failed to load audit events"
        />
      ) : allEvents.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No events match these filters"
            description={`Active filters: ${[
              eventType && `event "${eventType}"`,
              entityType && `entity "${entityType}"`,
              since && `since ${since}`,
              until && `until ${until}`,
            ]
              .filter(Boolean)
              .join(', ')}.`}
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No audit events yet"
            description="Approve, reject, or override a price on the Dashboard to see events appear here."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-32 px-3 py-2 text-left font-semibold">When</th>
                <th className="w-44 px-3 py-2 text-left font-semibold">Event</th>
                <th className="w-32 px-3 py-2 text-left font-semibold">Actor</th>
                <th className="px-3 py-2 text-left font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allEvents.map((ev) => (
                <AuditRow key={ev.id} event={ev} />
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
            {q.hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <span className="text-xs text-slate-500">
                End of audit history.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <tr>
      <td className="px-3 py-2 align-top text-xs text-slate-600">
        <span title={formatAbsoluteTime(event.occurredAt)}>
          {formatRelativeTime(event.occurredAt)}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge tone={EVENT_TONE[event.eventType] ?? 'slate'}>
          {event.eventType}
        </Badge>
      </td>
      <td className="px-3 py-2 align-top text-xs text-slate-700">
        {event.actorName ?? (
          <span className="italic text-slate-400">system</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-xs text-slate-700">
        {summarizeEvent(event)}
      </td>
    </tr>
  )
}

/**
 * Derive a single-line summary from the event payload. The payload is a typed
 * JSON blob whose shape varies per event type — we narrow with `in` checks
 * rather than casting to any.
 */
function summarizeEvent(event: AuditEvent): string {
  const p = event.payload as Record<string, unknown>
  switch (event.eventType) {
    case 'price_change.proposed':
    case 'price_change.applied': {
      const from = numericField(p, 'fromPriceCents')
      const to = numericField(p, 'toPriceCents')
      const reason = stringField(p, 'reason')
      const ruleName = stringField(p, 'ruleName')
      const base =
        from !== null && to !== null
          ? `${formatCents(from)} → ${formatCents(to)}`
          : `change ${event.entityId.slice(0, 6)}`
      const tail = ruleName
        ? ` (rule: ${ruleName})`
        : reason
          ? ` (${reason})`
          : ''
      return `${base}${tail}`
    }
    case 'price_change.approved': {
      const after = nestedField(p, 'after') as Record<string, unknown> | null
      const from =
        (after && numericField(after, 'fromPriceCents')) ??
        numericField(p, 'fromPriceCents')
      const to =
        (after && numericField(after, 'toPriceCents')) ??
        numericField(p, 'toPriceCents')
      const note = stringField(p, 'note')
      const base =
        from !== null && to !== null
          ? `Approved ${formatCents(from)} → ${formatCents(to)}`
          : 'Approved price change'
      return note ? `${base} — “${note}”` : base
    }
    case 'price_change.rejected': {
      const note = stringField(p, 'note')
      return note
        ? `Rejected price change — “${note}”`
        : 'Rejected price change'
    }
    case 'price_change.reverted': {
      const restored = numericField(p, 'restoredPriceCents')
      return restored !== null
        ? `Reverted to ${formatCents(restored)}`
        : 'Reverted price change'
    }
    case 'rule.created':
    case 'rule.deleted':
    case 'rule.enabled':
    case 'rule.disabled':
    case 'rule.updated': {
      const after = nestedField(p, 'after') as Record<string, unknown> | null
      const before = nestedField(p, 'before') as Record<string, unknown> | null
      const ref = after ?? before
      const name = ref ? stringField(ref, 'name') : null
      const verb = event.eventType.split('.')[1]
      return name ? `${verb}: ${name}` : `${verb} rule`
    }
    case 'store.created':
    case 'store.updated': {
      const after = nestedField(p, 'after') as Record<string, unknown> | null
      const before = nestedField(p, 'before') as Record<string, unknown> | null
      const ref = after ?? before
      const name = ref ? stringField(ref, 'name') : null
      return name ?? 'store change'
    }
    case 'item.created':
    case 'item.updated': {
      const after = nestedField(p, 'after') as Record<string, unknown> | null
      const before = nestedField(p, 'before') as Record<string, unknown> | null
      const ref = after ?? before
      const name = ref ? stringField(ref, 'name') : null
      return name ?? 'item change'
    }
    default:
      return event.entityId
  }
}

function numericField(o: Record<string, unknown>, k: string): number | null {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function stringField(o: Record<string, unknown>, k: string): string | null {
  const v = o[k]
  return typeof v === 'string' && v.length > 0 ? v : null
}
function nestedField(o: Record<string, unknown>, k: string): unknown {
  const v = o[k]
  return v && typeof v === 'object' ? v : null
}
