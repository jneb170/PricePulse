import { useState } from 'react'
import type { inferRouterOutputs } from '@trpc/server'
import { trpc } from '../trpc'
import { Button } from '../components/Button'
import { LoadingBlock } from '../components/Spinner'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { Badge } from '../components/Badge'
import {
  FieldError,
  FieldLabel,
  Input,
} from '../components/Input'
import { RulesList } from '../rules/RulesList'
import type { AppRouter } from '../../server/router'
import { useDemoUserContext } from '../context/DemoUserContext'
import { usePageTitle } from '../lib/usePageTitle'

type RouterOutput = inferRouterOutputs<AppRouter>
type Store = RouterOutput['stores']['list'][number]

type Tab = 'stores' | 'rules'

export function SettingsScreen() {
  usePageTitle('Settings')
  const [tab, setTab] = useState<Tab>('stores')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500">
          Manage the data the demo runs against.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'stores'} onClick={() => setTab('stores')}>
          Stores
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')}>
          Rules
        </TabButton>
      </div>

      {tab === 'stores' ? <StoresTab /> : <RulesList showActions={false} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function StoresTab() {
  const demoUser = useDemoUserContext()
  const utils = trpc.useUtils()
  const q = trpc.stores.list.useQuery()
  const [editing, setEditing] = useState<Store | null>(null)
  const [creating, setCreating] = useState(false)

  if (q.isLoading) return <LoadingBlock label="Loading stores…" />
  if (q.error)
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        title="Failed to load stores"
      />
    )

  const stores = q.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          disabled={!demoUser.userId}
          title={
            !demoUser.userId ? 'Select a demo user to create stores' : undefined
          }
        >
          + New store
        </Button>
      </div>

      {stores.length === 0 ? (
        <EmptyState
          title="No stores"
          description="Create a store to start adding inventory."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Location</th>
                <th className="px-3 py-2 text-left font-semibold">Timezone</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{s.location}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {s.timezone}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={s.active ? 'green' : 'slate'}>
                      {s.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(s)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <StoreEditModal
          store={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async () => {
            await utils.stores.list.invalidate()
            await utils.audit.list.invalidate()
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function StoreEditModal({
  store,
  onClose,
  onSaved,
}: {
  store: Store | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = store !== null
  const [name, setName] = useState(store?.name ?? '')
  const [location, setLocation] = useState(store?.location ?? '')
  const [timezone, setTimezone] = useState(
    store?.timezone ?? 'America/Los_Angeles',
  )
  const [active, setActive] = useState(store?.active ?? true)

  const create = trpc.stores.create.useMutation({ onSuccess: onSaved })
  const update = trpc.stores.update.useMutation({ onSuccess: onSaved })

  const busy = create.isPending || update.isPending
  const err = (create.error ?? update.error) as { message?: string } | null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isEditing && store) {
      update.mutate({ id: store.id, name, location, timezone, active })
    } else {
      create.mutate({ name, location, timezone })
    }
  }

  const fieldsValid = name.trim().length > 0 && location.trim().length > 0

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-md border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-slate-800">
          {isEditing ? `Edit store — ${store.name}` : 'New store'}
        </h2>

        <div>
          <FieldLabel htmlFor="store-name" required>
            Name
          </FieldLabel>
          <Input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="store-location" required>
            Location
          </FieldLabel>
          <Input
            id="store-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="store-timezone">Timezone</FieldLabel>
          <Input
            id="store-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        {isEditing ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Active
          </label>
        ) : null}

        {err ? <FieldError message={err.message ?? 'Save failed.'} /> : null}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !fieldsValid}
          >
            {busy ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
  )
}
