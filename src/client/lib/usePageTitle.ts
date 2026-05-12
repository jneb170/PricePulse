import { useEffect } from 'react'

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `PricePulse — ${title}`
  }, [title])
}
