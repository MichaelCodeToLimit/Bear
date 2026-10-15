import { useRef, useState } from 'react'
import { IslandBoundary } from './IslandBoundary'

declare global {
  interface Window {
    PagefindUI?: new (opts: Record<string, unknown>) => unknown
  }
}

type Status = 'idle' | 'loading' | 'ready' | 'unavailable'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`could not load ${src}`))
    document.head.appendChild(s)
  })
}

function loadCss(href: string): void {
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = href
  document.head.appendChild(l)
}

function Search() {
  const [status, setStatus] = useState<Status>('idle')
  const mount = useRef<HTMLDivElement>(null)
  const stub = useRef<HTMLInputElement>(null)
  const started = useRef(false)

  async function start() {
    if (started.current) return
    started.current = true
    setStatus('loading')
    const base = import.meta.env.BASE_URL
    try {
      // The index only exists in the built site (pagefind runs after astro build); in `astro dev` this throws.
      loadCss(`${base}pagefind/pagefind-ui.css`)
      await loadScript(`${base}pagefind/pagefind-ui.js`)
      if (!window.PagefindUI || !mount.current) throw new Error('search UI missing')
      new window.PagefindUI({
        element: mount.current,
        baseUrl: base,
        showImages: false,
        showSubResults: false,
        autofocus: true,
        translations: { placeholder: 'Search the docs' }
      })
      // Carry over anything typed while the search was still loading.
      const typed = stub.current?.value ?? ''
      const real = mount.current.querySelector<HTMLInputElement>('input')
      if (typed && real) {
        real.value = typed
        real.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setStatus('ready')
    } catch {
      setStatus('unavailable')
    }
  }

  return (
    <div className="docs-search" data-docs-search onFocusCapture={() => void start()}>
      <input
        ref={stub}
        type="search"
        className="docs-search__stub"
        placeholder="Search the docs"
        aria-label="Search the docs"
        hidden={status === 'ready' || status === 'unavailable'}
      />
      {status === 'loading' && <p className="docs-search__note" role="status">Loading search...</p>}
      {status === 'unavailable' && <p className="docs-search__note" role="status">{import.meta.env.DEV ? 'Search works in the built site.' : "Search couldn't load. Try reloading."}</p>}
      <div ref={mount} />
    </div>
  )
}

export default function DocsSearch() {
  return (
    <IslandBoundary label="docs-search">
      <Search />
    </IslandBoundary>
  )
}
