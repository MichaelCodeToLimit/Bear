import { defineConfig, type Plugin, type Rollup } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The web version reuses the desktop renderer (App, Launcher, styles) and, on phones, the Android
// app's phone UI. Only the entry point differs: it installs the browser version of window.bear.
const desktopRenderer = resolve(__dirname, '../desktop/src/renderer')
const phoneUi = resolve(__dirname, '../mobile/src/phone')
const entry = resolve(__dirname, 'src/main.tsx')

/** Copy Board's Excalidraw fonts into the public folder so they're served from Bear, not a CDN. */
function excalidrawFonts(): Plugin {
  const src = resolve(__dirname, '../../packages/app-board/node_modules/@excalidraw/excalidraw/dist/prod/fonts')
  const dest = resolve(__dirname, 'public/excalidraw/fonts')
  return {
    name: 'bear-excalidraw-fonts',
    buildStart() {
      if (!existsSync(dest) && existsSync(src)) cpSync(src, dest, { recursive: true })
    }
  }
}

/**
 * Packages imported by the desktop renderer's and the phone UI's files resolve as if this app
 * imported them. Hosts install only the web app and its dependencies (pnpm --filter "@bear/web..."),
 * not the desktop or Android app's, so those apps have no node_modules there. The phone UI's file
 * helpers use Android's file storage, so the browser version (src/phone-files.ts) replaces them.
 */
function resolveFromWeb(): Plugin {
  const shared = [desktopRenderer, phoneUi].map((d) => d.replace(/\\/g, '/'))
  const phoneFiles = resolve(phoneUi, 'files.ts').replace(/\\/g, '/')
  return {
    name: 'bear-resolve-from-web',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null
      const from = importer.replace(/\\/g, '/')
      if (!shared.some((d) => from.startsWith(d))) return null
      if (source.startsWith('.')) {
        const target = resolve(importer, '..', source).replace(/\\/g, '/')
        return target === phoneFiles || `${target}.ts` === phoneFiles ? resolve(__dirname, 'src/phone-files.ts') : null
      }
      if (source.startsWith('/')) return null
      return this.resolve(source, entry, { ...options, skipSelf: true })
    }
  }
}

/**
 * Writes sw.js, the service worker that makes Bear load instantly on repeat visits, work offline
 * and install as an app. It precaches only the launcher (the entry chunk, its imports and CSS);
 * each app's code is cached the first time it's opened.
 */
function serviceWorker(): Plugin {
  return {
    name: 'bear-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle).filter((f): f is Rollup.OutputChunk => f.type === 'chunk')
      const byName = new Map(chunks.map((c) => [c.fileName, c]))
      const shell = new Set<string>()
      const add = (c: Rollup.OutputChunk) => {
        if (shell.has(c.fileName)) return
        shell.add(c.fileName)
        c.viteMetadata?.importedCss.forEach((css) => shell.add(css))
        c.imports.forEach((i) => byName.get(i) && add(byName.get(i)!))
      }
      chunks.filter((c) => c.isEntry).forEach(add)
      const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/'))
      const source = readFileSync(resolve(__dirname, 'src/sw.js'), 'utf8')
        .replace('self.__SHELL__', JSON.stringify(['./', 'manifest.webmanifest', 'icons/icon-64.png', ...shell]))
        .replace('self.__ASSETS__', JSON.stringify(assets))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  // Relative, so the build works from any folder on any host (e.g. GitHub Pages under /Bear/app/).
  base: './',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    // Each app is its own lazy chunk by design; the biggest (Board's Excalidraw) loads only when opened.
    chunkSizeWarningLimit: 2500
  },
  resolve: {
    // App.tsx lives in apps/desktop, so make sure it and this entry share one copy of React.
    dedupe: ['react', 'react-dom']
  },
  plugins: [resolveFromWeb(), excalidrawFonts(), serviceWorker(), react(), tailwindcss()]
})
