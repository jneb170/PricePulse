import { useMemo } from 'react'
import { trpc } from '../trpc'

export type KnownUser = { id: string; name: string }

/**
 * Fetch the list of demo users from the server.
 *
 * Backs the demo-user picker in the top bar. The server's `users.list`
 * procedure returns the seeded managers (Alex, Sam, Jordan) ordered by
 * name; we project to `{ id, name }` for the picker.
 *
 * Cached for 60s on the React Query side because the seeded user set
 * doesn't change during a session.
 */
export function useKnownUsers(): {
  users: KnownUser[]
  isLoading: boolean
  error: Error | null
} {
  const q = trpc.users.list.useQuery(undefined, { staleTime: 60_000 })

  const users = useMemo<KnownUser[]>(() => {
    if (!q.data) return []
    return q.data.map((u) => ({ id: u.id, name: u.name }))
  }, [q.data])

  return {
    users,
    isLoading: q.isLoading,
    error: q.error as Error | null,
  }
}
