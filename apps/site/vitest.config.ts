import { getViteConfig } from 'astro/config'

// Component render tests: they import .astro files, so they need Astro's Vite pipeline.
// Astro's config type does not know Vitest's `test` key, hence the cast.
const config = {
  test: {
    name: 'site-render',
    include: ['src/**/*.render.test.ts'],
    environment: 'node'
  }
} as Parameters<typeof getViteConfig>[0]

export default getViteConfig(config)
