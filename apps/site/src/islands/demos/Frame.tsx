import type { CSSProperties, ReactNode } from 'react'

const BASE = `
.demo{--c:var(--accent);position:relative;width:100%;max-width:340px;margin:0 auto;overflow:hidden;
  background:var(--surface);border:1px solid var(--surface-edge);border-radius:var(--r-md);box-shadow:var(--shadow-sm);
  font-size:.78rem;color:var(--ink);user-select:none}
.demo__bar{display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--c);color:var(--demo-ink,#fff);font-weight:700;font-size:.72rem}
.demo__dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.7)}
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
        <span className="demo__dot" />
        <span className="demo__dot" />
        <span className="demo__dot" />
        <span style={{ marginLeft: 6 }}>{title}</span>
      </div>
      <div className="demo__body">{children}</div>
    </div>
  )
}

/** Inline stylesheet for one demo. Written via innerHTML so selectors and quotes are not HTML-escaped. */
export function DemoCss({ css }: { css: string }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
