import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// The Android app reuses the desktop renderer (App, Launcher, styles and the Excalidraw fonts in its
// public folder). Only the entry point differs: it installs the Android version of window.bear.
const desktopRenderer = resolve(__dirname, '../desktop/src/renderer')

export default defineConfig({
  root: resolve(__dirname, 'src'),
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
  plugins: [react(), tailwindcss(), dropCjkHandwritingFont()]
})

/**
 * Excalidraw's Xiaolai font (hand-drawn Chinese/Japanese/Korean) is about 13 MB, two thirds of the
 * APK. It only loads when a board has CJK text, and Android's own Noto CJK fonts stand in for it,
 * so the phone build leaves it out. The desktop app keeps it.
 */
function dropCjkHandwritingFont(): Plugin {
  return {
    name: 'bear-drop-xiaolai',
    closeBundle() {
      rmSync(resolve(__dirname, 'dist/excalidraw/fonts/Xiaolai'), { recursive: true, force: true })
    }
  }
}
