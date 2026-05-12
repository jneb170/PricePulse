import { useEffect } from 'react'
import { useKnownUsers } from '../lib/useKnownUsers'
import { useDemoUserContext } from '../context/DemoUserContext'

const DEFAULT_USER_NAME = 'Alex Rivera'

/**
 * Top-bar dropdown for selecting the stub-authenticated demo user.
 *
 * The user list comes from `trpc.users.list`, which returns the seeded
 * managers. On a fresh seed the dropdown is populated immediately with
 * no user interaction required.
 *
 * On first load (no prior selection persisted) the picker auto-selects
 * "Alex Rivera" once the user list resolves, so the demo is usable
 * without forcing a manual pick. Once the user touches the picker, that
 * choice is respected — including the empty placeholder.
 */
export function DemoUserPicker({
  userId,
  setUserId,
}: {
  userId: string | null
  setUserId: (id: string | null) => void
}) {
  const { users, isLoading, error } = useKnownUsers()
  const { hasInteracted, setUserIdDefault } = useDemoUserContext()

  useEffect(() => {
    if (hasInteracted || userId || users.length === 0) return
    const fallback = users.find((u) => u.name === DEFAULT_USER_NAME) ?? users[0]
    if (fallback) setUserIdDefault(fallback.id)
  }, [hasInteracted, userId, users, setUserIdDefault])

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
