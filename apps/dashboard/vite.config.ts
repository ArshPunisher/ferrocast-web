import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// The engine serves the build at /app/ (SPA fallback for extensionless paths, API.md §6
// build notes); the desktop window loads that URL. `pnpm dev` serves the same path against
// the in-browser demo engine: http://localhost:5280/app/
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwind()],
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
