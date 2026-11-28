import { defineConfig, devices } from '@playwright/test'

// Temporary diagnostics for Linux WebKit (removed before the PR is ready).
const port = Number(process.env.FC_DASH_PORT ?? 5281)

export default defineConfig({
  testDir: 'diag',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}/app/` },
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/app/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
