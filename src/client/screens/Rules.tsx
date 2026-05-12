import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Drawer } from '../components/Drawer'
import { RuleForm } from '../rules/RuleForm'
import { RulesList } from '../rules/RulesList'
import type { Rule } from '../rules/RulesList'
import { useDemoUserContext } from '../context/DemoUserContext'
import { usePageTitle } from '../lib/usePageTitle'
import { trpc } from '../trpc'

export function RulesScreen() {
  usePageTitle('Rules')
  const demoUser = useDemoUserContext()
  const utils = trpc.useUtils()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [evaluateResult, setEvaluateResult] = useState<{
    evaluatedItemCount: number
    proposedCount: number
    skippedExistingCount: number
  } | null>(null)

  const open = (rule: Rule | null) => {
    setEditing(rule)
    setDrawerOpen(true)
  }

  const close = () => {
    setDrawerOpen(false)
    // Defer clearing until the drawer is hidden so the close animation isn't
    // jarring — for the simple drawer here we clear immediately.
    setEditing(null)
  }

  const evaluateMut = trpc.rules.evaluate.useMutation({
    onSuccess: async (data) => {
      setEvaluateResult(data)
      // Refresh anything that depends on pending price changes / audit so the
      // dashboard's pending count grows within ~1s of clicking.
      await Promise.all([
        utils.items.dashboard.invalidate(),
        utils.prices.listPending.invalidate(),
        utils.audit.list.invalidate(),
      ])
    },
  })

  // Auto-fade the success banner after ~8s. The codebase has no toast/dismiss
  // primitive, so we just clear the local state.
  useEffect(() => {
    if (!evaluateResult) return
    const t = setTimeout(() => setEvaluateResult(null), 8_000)
    return () => clearTimeout(t)
  }, [evaluateResult])

  const runDisabled = !demoUser.userId || evaluateMut.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rules</h1>
          <p className="text-xs text-slate-500">
            Declarative pricing rules evaluated by the engine.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEvaluateResult(null)
                evaluateMut.mutate(undefined)
              }}
              disabled={runDisabled}
              title={
                !demoUser.userId
                  ? 'Select a demo user to run the engine'
                  : 'Evaluate all enabled rules across all stores'
              }
            >
              {evaluateMut.isPending ? 'Running…' : 'Run engine'}
            </Button>
            <Button
              variant="primary"
              onClick={() => open(null)}
              disabled={!demoUser.userId}
              title={
                !demoUser.userId
                  ? 'Select a demo user to create rules'
                  : 'Create a new rule'
              }
            >
              + New rule
            </Button>
          </div>
          {evaluateResult ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
              Engine evaluated {evaluateResult.evaluatedItemCount} items →{' '}
              {evaluateResult.proposedCount} new suggestion
              {evaluateResult.proposedCount === 1 ? '' : 's'},{' '}
              {evaluateResult.skippedExistingCount} skipped (already pending).
            </div>
          ) : null}
          {evaluateMut.error ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
              {evaluateMut.error.message}
            </div>
          ) : null}
        </div>
      </div>

      <RulesList onEdit={(r) => open(r)} onNew={() => open(null)} />

      <Drawer
        open={drawerOpen}
        onClose={close}
        title={editing ? `Edit rule — ${editing.name}` : 'New rule'}
      >
        {!demoUser.userId ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Select a demo user from the top bar to save rule changes.
          </div>
        ) : null}
        <RuleForm rule={editing} onCancel={close} onSaved={close} />
      </Drawer>
    </div>
  )
}
