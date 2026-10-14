import { defineConfig } from '@playwright/test'

// End-to-end tests drive the built Electron app. Run `pnpm build` first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list'
})
