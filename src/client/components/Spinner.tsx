export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'
  return (
    <span
      aria-label="Loading"
      role="status"
      className={`inline-block ${dim} animate-spin rounded-full border-2 border-slate-300 border-t-blue-600`}
    />
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-8 text-slate-600">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  )
}
