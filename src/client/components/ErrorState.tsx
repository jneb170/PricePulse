type Errorish = { message?: string } | Error | null | undefined

/** Loading/empty/error are first-class screen states. This is the error one. */
export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: Errorish
  onRetry?: () => void
  title?: string
}) {
  const message =
    (error && 'message' in error && error.message) ||
    'Unknown error from the server.'

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 break-words">{message}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
