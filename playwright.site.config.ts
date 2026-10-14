import { defineConfig, devices } from '@playwright/test'

// Browser tests for the Bear website. Run `pnpm site:build` first.
export default defineConfig({
  testDir: 'e2e-site',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4321/Bear/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm site:preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/Bear/',
    reuseExistingServer: !process.env.CI
  }
})
