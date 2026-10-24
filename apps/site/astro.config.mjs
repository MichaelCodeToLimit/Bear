import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// Defaults serve the GitHub Pages site (https://michaelcodetolimit.github.io/Bear/). The Render deploy builds the
// same code at the root of its own address with SITE_BASE=/ and SITE_URL=https://<name>.onrender.com.
const base = process.env.SITE_BASE || '/Bear/'
const site = process.env.SITE_URL || 'https://michaelcodetolimit.github.io'

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  // No image resizing at build (avoids the native `sharp` dependency); Bear.astro picks a pre-sized icon.
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [react()]
})
