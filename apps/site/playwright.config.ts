import { defineConfig, devices } from '@playwright/test'

// Tests run against the built site (`astro build` first), served by `astro preview`.
const port = Number(process.env.SITE_TEST_PORT ?? 5301)

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // --ignore-lock: astro allows one preview at a time, and a dev preview may already run.
    command: `pnpm exec astro preview --ignore-lock --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
})
