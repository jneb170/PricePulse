import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Demo user selection. Persists the chosen user id in localStorage and exposes
 * a stable ref (`userIdRef`) so the tRPC httpBatchLink `headers` function can
 * read the latest value on every request without re-creating the client.
 *
 * The header injection is the contract:
 *   headers: () => ({ 'x-demo-user-id': demoUser.userIdRef.current ?? '' })
 *
 * That getter form is required — passing a static value would freeze the
 * header to the user selected at mount.
 */

const STORAGE_KEY = 'pricepulse:demo-user-id'

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export type DemoUserState = {
  userId: string | null
  setUserId: (id: string | null) => void
  /**
   * Latest selected id; safe to read from inside non-React callbacks like
   * the tRPC headers function.
   */
  userIdRef: React.MutableRefObject<string | null>
}

export function useDemoUser(): DemoUserState {
  const [userId, setUserIdState] = useState<string | null>(() => readStored())
  const userIdRef = useRef<string | null>(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const setUserId = useCallback((id: string | null) => {
    setUserIdState(id)
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage may be unavailable — selection still lives in component state.
    }
  }, [])

  return { userId, setUserId, userIdRef }
}
