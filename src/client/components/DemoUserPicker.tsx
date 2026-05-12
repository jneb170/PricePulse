import { useKnownUsers } from '../lib/useKnownUsers'

/**
 * Top-bar dropdown for selecting the stub-authenticated demo user.
 *
 * The user list comes from `trpc.users.list`, which returns the seeded
 * managers. On a fresh seed the dropdown is populated immediately with
 * no user interaction required.
 */
export function DemoUserPicker({
  userId,
  setUserId,
}: {
  userId: string | null
  setUserId: (id: string | null) => void
}) {
  const { users, isLoading, error } = useKnownUsers()

  // If the selected id isn't in the list (or list is still loading), show
  // the id as the label so users see what's set.
  const selected = users.find((u) => u.id === userId)
  const labelForSelected = selected
    ? selected.name
    : userId
      ? `id: ${userId.slice(0, 8)}…`
      : 'No user selected'

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="demo-user" className="text-xs text-slate-500">
        Demo user
      </label>
      <select
        id="demo-user"
        value={userId ?? ''}
        onChange={(e) => {
          const v = e.target.value
          setUserId(v || null)
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        title={labelForSelected}
      >
        <option value="">
          {isLoading
            ? 'Loading…'
            : error
              ? 'Users unavailable'
              : users.length === 0
                ? 'No users'
                : 'Select a user'}
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
        {userId && !selected ? (
          <option value={userId}>{labelForSelected}</option>
        ) : null}
      </select>
    </div>
  )
}
