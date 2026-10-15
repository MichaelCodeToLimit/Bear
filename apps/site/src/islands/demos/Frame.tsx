import type { CSSProperties, ReactNode } from 'react'

const BASE = `
.demo{--c:var(--accent);position:relative;width:100%;max-width:340px;margin:0 auto;overflow:hidden;
  background:var(--glass);border:1px solid var(--edge);border-radius:var(--r-lg);
  box-shadow:var(--shadow-sm),0 0 40px -16px var(--glow);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  font-size:.78rem;color:var(--ink);user-select:none}
.demo__bar{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.5rem .75rem;
  border-bottom:1px solid var(--edge);color:var(--ink);font-weight:600;font-size:.74rem}
.demo__tabs{display:flex;gap:.6rem;color:var(--ink-muted);font-weight:500;font-size:.68rem}
.demo__tabs .is-on{color:var(--ink);box-shadow:0 2px 0 var(--accent)}
.demo__body{padding:12px;min-height:130px;position:relative}
`

/** Shared mock-window chrome. `playing` adds `is-playing`, which each demo's keyframes hang off. */
export function Frame({ id, title, playing, children }: { id: string; title: string; playing: boolean; children: ReactNode }) {
  return (
    <div
      className={`demo${playing ? ' is-playing' : ''}`}
      data-demo={id}
      style={{ ...(id === 'sleeping' ? { '--c': 'var(--ink-muted)', '--demo-ink': 'var(--surface)' } : { '--c': `var(--app-${id})` }) } as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: BASE }} />
      <div className="demo__bar">
        <span>← {title}</span>
        <span className="demo__tabs" aria-hidden="true">
          <span className="is-on">Home</span>
          <span>Insert</span>
        </span>
      </div>
      <div className="demo__body">{children}</div>
    </div>
  )
}

/** Inline stylesheet for one demo. Written via innerHTML so selectors and quotes are not HTML-escaped. */
export function DemoCss({ css }: { css: string }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
