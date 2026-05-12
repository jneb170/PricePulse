import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { BrowserRouter } from 'react-router-dom'
import { trpc } from './trpc'
import App from './App'
import { useDemoUser } from './lib/useDemoUser'
import { DemoUserProvider } from './context/DemoUserContext'
import './index.css'

function Root() {
  const demoUser = useDemoUser()

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Demo polls — don't burn CPU on retries when the backend is half-built.
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  }))

  // The headers function MUST be a getter, not a static object — when the
  // operator switches demo users the next batch needs to pick up the new id
  // without us reconstructing the tRPC client (which would blow the cache).
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/trpc',
          headers: () => {
            const id = demoUser.userIdRef.current
            return id ? { 'x-demo-user-id': id } : {}
          },
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <DemoUserProvider value={demoUser}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DemoUserProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')

createRoot(rootEl).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
