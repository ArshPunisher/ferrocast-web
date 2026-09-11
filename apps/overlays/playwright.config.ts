import { defineConfig, devices } from '@playwright/test'

// Serves the BUILT bundle (dist/overlays), exactly what the engine embeds, with ?demo.
const port = Number(process.env.FERRO_OVERLAY_PORT ?? 5291)

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1920, height: 1080 } },
  webServer: {
    command: `pnpm exec vite build --configLoader runner --logLevel warn && pnpm exec vite preview --configLoader runner --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } },
    },
  ],
})
