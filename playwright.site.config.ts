import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// Browser tests for the Bear website. Run `pnpm site:build` first.
export default defineConfig({
  testDir: 'e2e-site',
  // In CI, `github` turns failures into annotations readable on the run page without signing in.
  reporter: CI ? [['list'], ['github']] : 'list',
  // A hang in CI should fail in minutes, not hold the Pages deploy queue for hours.
  globalTimeout: CI ? 8 * 60_000 : undefined,
  use: { baseURL: 'http://127.0.0.1:4321/Bear/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm site:preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/Bear/',
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
})
