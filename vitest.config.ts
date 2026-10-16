import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          // Component render tests import .astro files and run in the site's own project below.
          exclude: ['**/node_modules/**', 'apps/site/src/**/*.render.test.ts'],
          environment: 'node'
        }
      },
      'apps/site/vitest.config.ts'
    ]
  }
})
