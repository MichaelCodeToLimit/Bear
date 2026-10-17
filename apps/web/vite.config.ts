import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// The web version reuses the desktop renderer (App, Launcher, styles and the Excalidraw fonts in its
// public folder). Only the entry point differs: it installs the browser version of window.bear.
const desktopRenderer = resolve(__dirname, '../desktop/src/renderer')

/** Copy Board's Excalidraw fonts into the shared public folder (the desktop build does the same). */
function excalidrawFonts(): Plugin {
  const src = resolve(__dirname, '../../packages/app-board/node_modules/@excalidraw/excalidraw/dist/prod/fonts')
  const dest = resolve(desktopRenderer, 'public/excalidraw/fonts')
  return {
    name: 'bear-excalidraw-fonts',
    buildStart() {
      if (!existsSync(dest) && existsSync(src)) cpSync(src, dest, { recursive: true })
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  // Relative, so the build works from any folder on any host (e.g. GitHub Pages under /Bear/app/).
  base: './',
  publicDir: resolve(desktopRenderer, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  resolve: {
    // App.tsx lives in apps/desktop, so make sure it and this entry share one copy of React.
    dedupe: ['react', 'react-dom']
  },
  plugins: [excalidrawFonts(), react(), tailwindcss()]
})
