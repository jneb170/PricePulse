import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { DemoUserState } from '../lib/useDemoUser'

/**
 * Surfaces the demo-user state to deep descendants (mainly the top-bar picker
 * and mutation buttons that gate on auth). The state itself is owned by
 * <Root /> in main.tsx so the same instance can drive both this context and
 * the tRPC client's `headers` getter.
 */
const Ctx = createContext<DemoUserState | null>(null)

export function DemoUserProvider({
  value,
  children,
}: {
  value: DemoUserState
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDemoUserContext(): DemoUserState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDemoUserContext used outside DemoUserProvider')
  return v
}
