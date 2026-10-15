import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://michaelcodetolimit.github.io',
  base: '/Bear/',
  trailingSlash: 'always',
  // No image resizing at build (avoids the native `sharp` dependency); Bear.astro picks a pre-sized icon.
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [react()]
})
