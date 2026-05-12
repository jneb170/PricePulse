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
const TOUCHED_KEY = 'pricepulse:demo-user-touched'

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function readTouched(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(TOUCHED_KEY) === '1'
  } catch {
    return false
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
  /**
   * True once the user has explicitly chosen a value via the picker (including
   * choosing the empty placeholder). Used to gate the first-load auto-default
   * so we don't undo an explicit deselection.
   */
  hasInteracted: boolean
  /**
   * Like `setUserId`, but does not flip `hasInteracted`. Reserved for the
   * first-load auto-default path.
   */
  setUserIdDefault: (id: string) => void
}

export function useDemoUser(): DemoUserState {
  const [userId, setUserIdState] = useState<string | null>(() => readStored())
  const [hasInteracted, setHasInteracted] = useState<boolean>(() => readTouched())
  const userIdRef = useRef<string | null>(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const persistId = useCallback((id: string | null) => {
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage may be unavailable — selection still lives in component state.
    }
  }, [])

  const setUserId = useCallback((id: string | null) => {
    setUserIdState(id)
    persistId(id)
    setHasInteracted(true)
    try {
      window.localStorage.setItem(TOUCHED_KEY, '1')
    } catch {
      // localStorage may be unavailable — touched flag still lives in component state.
    }
  }, [persistId])

  const setUserIdDefault = useCallback((id: string) => {
    setUserIdState(id)
    persistId(id)
  }, [persistId])

  return { userId, setUserId, userIdRef, hasInteracted, setUserIdDefault }
}
