import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { trpc } from '../trpc'
import { LoadingBlock } from '../components/Spinner'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import {
  formatAbsoluteTime,
  formatCents,
  formatRelativeTime,
  formatVelocity,
} from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import { getMutationErrorMessage } from '../lib/trpcError'
import type { AppRouter } from '../../server/router'
import { useDemoUserContext } from '../context/DemoUserContext'

type RouterOutput = inferRouterOutputs<AppRouter>
type DashboardOutput = RouterOutput['items']['dashboard']
type DashboardRow = DashboardOutput['rows'][number]

type PendingChange = NonNullable<DashboardRow['pendingChange']>
type PendingReason = PendingChange['reason']

const REASON_TONE: Record<PendingReason, 'blue' | 'violet' | 'amber' | 'slate'> = {
  rule_fired: 'blue',
  manager_override: 'violet',
  manual_correction: 'amber',
  rollback: 'slate',
}

export function DashboardScreen() {
  usePageTitle('Dashboard')
  const [storeId, setStoreId] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [pendingOnly, setPendingOnly] = useState(false)

  const storesQ = trpc.stores.list.useQuery(undefined, { staleTime: 60_000 })
  const dashboardQ = trpc.items.dashboard.useQuery(
    {
      storeId: storeId || undefined,
      category: category || undefined,
      pendingOnly,
      limit: 200,
    },
    {
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of dashboardQ.data?.rows ?? []) set.add(r.category)
    return Array.from(set).sort()
  }, [dashboardQ.data])

  const hasFilters = !!storeId || !!category || pendingOnly
  const clearFilters = () => {
    setStoreId('')
    setCategory('')
    setPendingOnly(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">
            {dashboardQ.isFetching && !dashboardQ.isLoading
              ? 'Refreshing…'
              : 'Polling every 15s'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-store" className="text-xs text-slate-600">
            Store
          </label>
          <select
            id="filter-store"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">All stores</option>
            {storesQ.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-category" className="text-xs text-slate-600">
            Category
          </label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Pending only
        </label>
      </div>

      {dashboardQ.isLoading ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : dashboardQ.error ? (
        <ErrorState
          error={dashboardQ.error}
          onRetry={() => dashboardQ.refetch()}
          title="Failed to load dashboard"
        />
      ) : !dashboardQ.data || dashboardQ.data.rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No items match your filters"
            description="Try clearing your filters, or run the engine to generate suggestions."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No items to show"
            description="Run the engine from the Rules screen to generate pricing suggestions."
          />
        )
      ) : (
        <DashboardTable rows={dashboardQ.data.rows} />
      )}
    </div>
  )
}

function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Store</th>
            <th className="px-3 py-2 text-left font-semibold">SKU</th>
            <th className="px-3 py-2 text-left font-semibold">Item</th>
            <th className="px-3 py-2 text-left font-semibold">Category</th>
            <th className="px-3 py-2 text-left font-semibold">Cond.</th>
            <th className="px-3 py-2 text-right font-semibold">Inv.</th>
            <th className="px-3 py-2 text-right font-semibold">Current</th>
            <th className="px-3 py-2 text-right font-semibold">24h</th>
            <th className="px-3 py-2 text-right font-semibold">7d/day</th>
            <th className="px-3 py-2 text-right font-semibold">Days listed</th>
            <th className="px-3 py-2 text-left font-semibold">Suggested</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <DashboardRowView key={row.itemId} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DashboardRowView({ row }: { row: DashboardRow }) {
  const pending = row.pendingChange
  return (
    <tr className={pending ? 'bg-blue-50/30' : ''}>
      <td className="px-3 py-2 text-slate-700">{row.storeName}</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.sku}</td>
      <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
      <td className="px-3 py-2 text-slate-600">{row.category}</td>
      <td className="px-3 py-2">
        <Badge tone="slate">{row.condition.replace('_', ' ')}</Badge>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
        {row.inventory}
      </td>
      <td className="px-3 py-2">
        <OverrideCell row={row} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
        {row.velocity24h}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
        {formatVelocity(row.velocity7d)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
        {row.daysSinceListed}
      </td>
      <td className="px-3 py-2">
        {pending ? <PendingCell row={row} pending={pending} /> : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  )
}

function PendingCell({
  row,
  pending,
}: {
  row: DashboardRow
  pending: PendingChange
}) {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  const demoUser = useDemoUserContext()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const invalidate = async () => {
    await Promise.all([
      utils.items.dashboard.invalidate(),
      utils.prices.listPending.invalidate(),
      utils.prices.history.invalidate(),
      utils.audit.list.invalidate(),
    ])
  }

  const approve = trpc.prices.approve.useMutation({
    onMutate: async (vars) => {
      // Optimistic update: flip the row to its suggested price and drop the
      // pending badge before the round-trip completes. Filters mean several
      // dashboard query variants can be cached at once — patch each of them.
      await utils.items.dashboard.cancel()
      const snapshots = queryClient
        .getQueriesData<DashboardOutput>({
          queryKey: [['items', 'dashboard']],
        })
        .map(([key, data]) => ({ key, data }))

      for (const entry of snapshots) {
        if (!entry.data) continue
        const next: DashboardOutput = {
          ...entry.data,
          rows: entry.data.rows.map((r) =>
            r.pendingChange?.id === vars.priceChangeId
              ? {
                  ...r,
                  currentPriceCents: r.pendingChange.suggestedPriceCents,
                  pendingChange: null,
                }
              : r,
          ),
        }
        queryClient.setQueryData(entry.key, next)
      }
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      // Roll back any optimistic edits.
      ctx?.snapshots.forEach((entry) => {
        if (entry.data) queryClient.setQueryData(entry.key, entry.data)
      })
    },
    onSettled: () => {
      void invalidate()
    },
  })

  const reject = trpc.prices.reject.useMutation({
    onSettled: () => {
      void invalidate()
    },
  })

  const disabled = !demoUser.userId
  const busy = approve.isPending || reject.isPending

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-blue-700 tabular-nums">
          {formatCents(pending.suggestedPriceCents)}
        </span>
        <Badge tone={REASON_TONE[pending.reason]}>
          {pending.reason.replace('_', ' ')}
        </Badge>
        <span
          className="text-[10px] text-slate-400"
          title={formatAbsoluteTime(pending.proposedAt)}
        >
          {formatRelativeTime(pending.proposedAt)}
        </span>
      </div>
      {rejecting ? (
        <div className="flex items-center gap-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs"
          />
          <Button
            size="sm"
            variant="danger"
            disabled={disabled || busy}
            onClick={() =>
              reject.mutate(
                {
                  priceChangeId: pending.id,
                  note: note.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setRejecting(false)
                    setNote('')
                  },
                },
              )
            }
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRejecting(false)
              setNote('')
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || busy}
            onClick={() => approve.mutate({ priceChangeId: pending.id })}
            title={
              disabled
                ? 'Select a demo user to approve changes'
                : `Approve ${formatCents(pending.suggestedPriceCents)} for ${row.name}`
            }
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || busy}
            onClick={() => setRejecting(true)}
          >
            Reject
          </Button>
        </div>
      )}
      {approve.error ? (
        <span className="text-[10px] text-red-600">
          {getMutationErrorMessage(approve.error)}
        </span>
      ) : null}
      {reject.error ? (
        <span className="text-[10px] text-red-600">
          {getMutationErrorMessage(reject.error)}
        </span>
      ) : null}
    </div>
  )
}

function OverrideCell({ row }: { row: DashboardRow }) {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  const demoUser = useDemoUserContext()
  const [editing, setEditing] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const hasOpenedRef = useRef(false)

  const invalidate = async () => {
    await Promise.all([
      utils.items.dashboard.invalidate(),
      utils.prices.listPending.invalidate(),
      utils.prices.history.invalidate(),
      utils.audit.list.invalidate(),
    ])
  }

  const override = trpc.prices.override.useMutation({
    onMutate: async (vars) => {
      // Optimistic update: patch only the row's currentPriceCents and preserve
      // its pendingChange (overrides are independent of pending suggestions).
      // Filters mean several dashboard query variants can be cached at once.
      await utils.items.dashboard.cancel()
      const snapshots = queryClient
        .getQueriesData<DashboardOutput>({
          queryKey: [['items', 'dashboard']],
        })
        .map(([key, data]) => ({ key, data }))

      for (const entry of snapshots) {
        if (!entry.data) continue
        const next: DashboardOutput = {
          ...entry.data,
          rows: entry.data.rows.map((r) =>
            r.itemId === vars.itemId
              ? { ...r, currentPriceCents: vars.toPriceCents }
              : r,
          ),
        }
        queryClient.setQueryData(entry.key, next)
      }
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach((entry) => {
        if (entry.data) queryClient.setQueryData(entry.key, entry.data)
      })
    },
    onSettled: () => {
      void invalidate()
    },
  })

  const parsedCents = useMemo(() => {
    const n = parseFloat(priceInput)
    if (Number.isNaN(n)) return null
    return Math.round(n * 100)
  }, [priceInput])

  const disabled = !demoUser.userId
  const noteEmpty = noteInput.trim().length === 0
  const saveDisabled =
    disabled ||
    override.isPending ||
    noteEmpty ||
    parsedCents === null ||
    parsedCents <= 0 ||
    parsedCents === row.currentPriceCents

  const openEditor = () => {
    setPriceInput((row.currentPriceCents / 100).toFixed(2))
    setNoteInput('')
    override.reset()
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setPriceInput('')
    setNoteInput('')
    override.reset()
  }

  const submit = () => {
    if (saveDisabled || parsedCents === null) return
    override.mutate(
      {
        itemId: row.itemId,
        toPriceCents: parsedCents,
        note: noteInput.trim(),
      },
      {
        onSuccess: () => {
          setEditing(false)
          setPriceInput('')
          setNoteInput('')
        },
      },
    )
  }

  // Auto-focus + select the price input when the editor opens; restore focus
  // to the pencil trigger when it closes. Skip the closing-side effect on the
  // initial mount so we don't steal focus before the user has ever opened it.
  useEffect(() => {
    if (editing) {
      hasOpenedRef.current = true
      priceRef.current?.focus()
      priceRef.current?.select()
    } else if (hasOpenedRef.current) {
      triggerRef.current?.focus()
    }
  }, [editing])

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div
          className="flex items-center justify-end gap-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
        >
          <span className="text-xs text-slate-400">$</span>
          <input
            ref={priceRef}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            inputMode="decimal"
            aria-label={`New price for ${row.name}`}
            className="w-20 rounded border border-slate-300 px-1.5 py-1 text-xs tabular-nums text-right"
          />
          <input
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Why are you overriding?"
            required
            maxLength={500}
            aria-label="Override reason"
            className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={saveDisabled}
            onClick={submit}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={override.isPending}
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>
        {override.error ? (
          <span className="text-right text-[10px] text-red-600">
            {getMutationErrorMessage(override.error)}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="tabular-nums font-medium text-slate-900">
        {formatCents(row.currentPriceCents)}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={openEditor}
        disabled={disabled}
        aria-label={`Override price for ${row.name}`}
        title={
          disabled
            ? 'Select a demo user to override price'
            : `Override price for ${row.name}`
        }
        className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:hover:text-slate-400"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
