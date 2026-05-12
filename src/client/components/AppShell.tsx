import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { DemoUserPicker } from './DemoUserPicker'
import { DemoBanner } from './DemoBanner'
import { useDemoUserContext } from '../context/DemoUserContext'

const NAV: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/rules', label: 'Rules' },
  { to: '/audit', label: 'Audit log' },
  { to: '/settings', label: 'Settings' },
]

function NavItem({
  to,
  label,
  end,
}: {
  to: string
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const demoUser = useDemoUserContext()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 md:py-0">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1.5 rounded-sm bg-blue-600" aria-hidden />
            <span className="text-sm font-bold tracking-tight text-slate-900">
              PricePulse
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} end={n.end} />
            ))}
          </nav>
          <div className="ml-auto">
            <DemoUserPicker
              userId={demoUser.userId}
              setUserId={demoUser.setUserId}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children ?? <Outlet />}</main>
    </div>
  )
}
