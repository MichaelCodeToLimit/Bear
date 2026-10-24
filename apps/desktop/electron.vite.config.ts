import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// Workspace packages ship TypeScript source, so they must be bundled rather than externalized.
const bundled = ['@bear/core']

// Which apps this build shows: all, office or studio. Set BEAR_EDITION when building; unset means all,
// and an unknown value stops the build (the same rule as electron-builder's config).
const { parseBuildEdition } = createRequire(__filename)('./build-config/editions.cjs') as {
  parseBuildEdition: (value: string | undefined) => 'all' | 'office' | 'studio'
}
const define = { __BEAR_EDITION__: JSON.stringify(parseBuildEdition(process.env.BEAR_EDITION)) }

/**
 * Board's whiteboard (Excalidraw) normally fetches its fonts from a CDN, which Bear's security
 * policy blocks and which wouldn't work offline. Copy them into the renderer's public folder so
 * they ship inside the app.
 */
function excalidrawFonts(): Plugin {
  const src = resolve(__dirname, '../../packages/app-board/node_modules/@excalidraw/excalidraw/dist/prod/fonts')
  const dest = resolve(__dirname, 'src/renderer/public/excalidraw/fonts')
  return {
    name: 'bear-excalidraw-fonts',
    buildStart() {
      if (!existsSync(dest) && existsSync(src)) cpSync(src, dest, { recursive: true })
    }
  }
}

export default defineConfig({
  main: {
    define,
    plugins: [externalizeDepsPlugin({ exclude: bundled })]
  },
  preload: {
    define,
    plugins: [externalizeDepsPlugin({ exclude: bundled })]
  },
  renderer: {
    define,
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    },
    plugins: [excalidrawFonts(), react(), tailwindcss()]
  }
})
