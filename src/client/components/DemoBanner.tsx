import { useState } from 'react'

const STORAGE_KEY = 'pricepulse:demo-banner-dismissed'
// TODO: replace with the actual repo URL before sharing.
export const DEMO_GITHUB_URL = 'https://github.com/PLACEHOLDER/pricepulse'
export const DEMO_BANNER_TEXT =
  'Public demo sandbox. Stub authentication — pick any manager. State is shared across visitors and resets when the container restarts.'

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function DemoBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed())
  if (dismissed) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // localStorage may be unavailable — dismissal still lives in component state.
    }
  }
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-xs">
        <p className="flex-1">
          {DEMO_BANNER_TEXT}{' '}
          <a
            href={DEMO_GITHUB_URL}
            className="font-semibold underline underline-offset-2 hover:text-amber-950"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="-m-1 rounded p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
