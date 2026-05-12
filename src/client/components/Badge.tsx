import type { ReactNode } from 'react'

type Tone =
  | 'slate'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'violet'
  | 'cyan'

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-100 text-blue-800 ring-blue-200',
  green: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  violet: 'bg-violet-100 text-violet-800 ring-violet-200',
  cyan: 'bg-cyan-100 text-cyan-800 ring-cyan-200',
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
