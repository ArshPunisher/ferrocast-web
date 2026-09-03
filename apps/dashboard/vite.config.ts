import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

/**
 * On `pnpm dev` and `vite preview` nothing real answers `/api/v1/status`, and the
 * dashboard asks it at start to tell a real engine (401 with our error body) from a plain
 * web server. Answer it here like the demo engine would (200, never 401), so the console
 * stays clean instead of logging a 404 on every start.
 */
function demoStatus(): Plugin {
  const answer: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/api/v1/status') return next()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(
      JSON.stringify({
        demo: true,
        message: 'No Ferrocast engine here; the dashboard runs its demo.',
      }),
    )
  }
  return {
    name: 'ferrocast-demo-status',
    configureServer: (server) => void server.middlewares.use(answer),
    configurePreviewServer: (server) => void server.middlewares.use(answer),
  }
}

// The engine serves the build at /app/ (SPA fallback for extensionless paths, API.md §6
// build notes); the desktop window loads that URL. `pnpm dev` serves the same path against
// the in-browser demo engine: http://localhost:5280/app/
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwind(), demoStatus()],
  clearScreen: false,
  server: { port: 5280, strictPort: true, open: false },
  preview: { port: 5281, strictPort: true },
  build: {
    outDir: '../../dist/dashboard',
    emptyOutDir: true,
    target: ['safari15', 'chrome103', 'firefox115'],
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
})
