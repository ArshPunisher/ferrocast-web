import { defineConfig, devices } from '@playwright/test'

// Runs the BUILT dashboard (dist/dashboard, served at /app/ like the engine does) in demo
// mode. WebKit is closest to the macOS and Linux desktop webviews.
const port = Number(process.env.FC_DASH_PORT ?? 5281)

export default defineConfig({
  testDir: 'e2e',
  timeout: process.env.CI ? 45_000 : 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}/app/`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/app/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
      testIgnore: /a11y|mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
      // pro-foundation, history, tip-brand and cloud-backups check their Pro screens on a phone too (their 375 px tests also run on desktop).
      testMatch: /mobile|pro-foundation|history|tip-brand|cloud-backups/,
    },
  ],
})
