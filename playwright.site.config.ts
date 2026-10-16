import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// Browser tests for the Bear website. Run `pnpm site:build` first.
export default defineConfig({
  testDir: 'e2e-site',
  // In CI, `github` turns failures into annotations readable on the run page without signing in.
  reporter: CI ? [['list'], ['github']] : 'list',
  // A hang in CI should fail in minutes, not hold the Pages deploy queue for hours.
  globalTimeout: CI ? 8 * 60_000 : undefined,
  // Observed flaky locally at the default worker count (different unrelated tests failed in some runs); two workers
  // was stable over repeated runs. CI gets one retry. A "flaky" line in the CI log means a retry happened and should be investigated.
  workers: 2,
  retries: CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4321/Bear/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Start Astro directly: through the pnpm wrappers the server outlived Playwright's
    // shutdown on Linux and teardown hung ("Timed out waiting ... for the teardown").
    command: 'node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4321',
    cwd: 'apps/site',
    url: 'http://127.0.0.1:4321/Bear/',
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
})
