/**
 * Friendly user-facing message for a tRPC mutation error.
 *
 * Special-cases the rate-limiter response (`code: 'TOO_MANY_REQUESTS'`) so the
 * user sees "Too many requests. Try again in {N}s." rather than the raw server
 * message. Detection is by error code (`error.data.code`), NOT by string-
 * matching the message — the message is for humans, the code is the contract.
 *
 * Everything else falls back to the raw `error.message`, preserving existing
 * UX for validation, server, and network errors.
 */
export function getMutationErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === 'object') {
      const code = (data as { code?: unknown }).code
      if (code === 'TOO_MANY_REQUESTS') {
        const retryAfter = (data as { retryAfterSec?: unknown }).retryAfterSec
        if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
          return `Too many requests. Try again in ${Math.ceil(retryAfter)}s.`
        }
        return 'Too many requests. Try again in a moment.'
      }
    }
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return 'Something went wrong.'
}
