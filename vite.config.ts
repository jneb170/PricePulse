import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    proxy: {
      // Anchor with ^ so this is a regex match — otherwise '/trpc' matches
      // '/trpc.ts' too and Vite's own source files get hijacked to the backend.
      '^/trpc/': 'http://localhost:3001',
    },
  },
  plugins: [react()],
})
