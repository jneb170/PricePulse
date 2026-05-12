import { trpc } from '../trpc'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { LoadingBlock } from '../components/Spinner'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { ACTION_LABELS, CONDITION_LABELS } from './schema'
import { formatCents } from '../lib/format'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../server/router'
import { useDemoUserContext } from '../context/DemoUserContext'

type RouterOutput = inferRouterOutputs<AppRouter>
type Rule = RouterOutput['rules']['list'][number]

function summarizeAction(action: Rule['action']): string {
  switch (action.type) {
    case 'multiply':
      return `${ACTION_LABELS.multiply} ${action.factor}`
    case 'set':
      return `${ACTION_LABELS.set.replace(' (cents)', '')} → ${formatCents(action.valueCents)}`
    case 'floor':
      return `${ACTION_LABELS.floor.replace(' (cents)', '')} → ${formatCents(action.minCents)}`
    case 'ceiling':
      return `${ACTION_LABELS.ceiling.replace(' (cents)', '')} → ${formatCents(action.maxCents)}`
  }
}

function summarizeConditions(c: Rule['conditions']): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(c)) {
    const label = CONDITION_LABELS[k as keyof typeof CONDITION_LABELS]
    if (Array.isArray(v)) parts.push(`${label} {${v.join(', ')}}`)
    else parts.push(`${label} ${v}`)
  }
  return parts.length ? parts.join(', ') : 'No conditions'
}

export function RulesList({
  onEdit,
  onNew,
  showActions = true,
}: {
  onEdit?: (rule: Rule) => void
  onNew?: () => void
  showActions?: boolean
}) {
  const demoUser = useDemoUserContext()
  const utils = trpc.useUtils()
  const q = trpc.rules.list.useQuery()

  const toggle = trpc.rules.update.useMutation({
    onSuccess: async () => {
      await utils.rules.list.invalidate()
      await utils.audit.list.invalidate()
    },
  })

  const remove = trpc.rules.delete.useMutation({
    onSuccess: async () => {
      await utils.rules.list.invalidate()
      await utils.audit.list.invalidate()
    },
  })

  if (q.isLoading) return <LoadingBlock label="Loading rules…" />
  if (q.error)
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        title="Failed to load rules"
      />
    )

  const rules = q.data ?? []

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No rules yet"
        description="Create a rule to start generating pricing suggestions."
        action={
          onNew ? (
            <Button variant="primary" onClick={onNew}>
              + New rule
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Pri.</th>
            <th className="px-3 py-2 text-left font-semibold">Name</th>
            <th className="px-3 py-2 text-left font-semibold">Conditions</th>
            <th className="px-3 py-2 text-left font-semibold">Action</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            {showActions ? (
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 tabular-nums text-slate-500">
                {r.priority}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-900">{r.name}</div>
                {r.description ? (
                  <div className="text-xs text-slate-500">{r.description}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {summarizeConditions(r.conditions)}
              </td>
              <td className="px-3 py-2 text-xs text-slate-700">
                {summarizeAction(r.action)}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  disabled={!demoUser.userId || toggle.isPending}
                  onClick={() =>
                    toggle.mutate({ id: r.id, enabled: !r.enabled })
                  }
                  className="inline-flex"
                  title={
                    !demoUser.userId
                      ? 'Select a demo user'
                      : r.enabled
                        ? 'Click to disable'
                        : 'Click to enable'
                  }
                >
                  <Badge tone={r.enabled ? 'green' : 'slate'}>
                    {r.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </button>
              </td>
              {showActions ? (
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onEdit ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onEdit(r)}
                      >
                        Edit
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!demoUser.userId || remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(`Delete rule "${r.name}"?`)
                        ) {
                          remove.mutate({ id: r.id })
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type { Rule }
