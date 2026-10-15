import type { CSSProperties } from 'react'
import { DemoCss, Frame } from './Frame'

const CSS = `
.nt-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--surface-edge)}
.nt-box{width:16px;height:16px;border-radius:4px;border:2px solid var(--c);display:inline-flex;flex:none;background:var(--c)}
.nt-box svg{width:100%;height:100%;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.nt-tick{stroke-dasharray:1;stroke-dashoffset:0}
.nt-text{text-decoration:line-through;color:var(--ink-muted)}
.is-playing .nt-box,.is-playing .nt-tick,.is-playing .nt-text{animation-duration:calc(6s * var(--motion-speed));animation-timing-function:ease-out;animation-iteration-count:infinite;animation-fill-mode:both;animation-delay:calc(var(--i) * 0.9s * var(--motion-speed))}
.is-playing .nt-box{animation-name:nt-box}
.is-playing .nt-tick{animation-name:nt-tick}
.is-playing .nt-text{animation-name:nt-text}
@keyframes nt-box{0%,10%{background:transparent}20%,88%{background:var(--c)}100%{background:transparent}}
@keyframes nt-tick{0%,10%{stroke-dashoffset:1}25%,88%{stroke-dashoffset:0}100%{stroke-dashoffset:1}}
@keyframes nt-text{0%,10%{text-decoration-color:transparent;color:var(--ink)}20%,88%{text-decoration-color:currentColor;color:var(--ink-muted)}100%{text-decoration-color:transparent;color:var(--ink)}}
`

const ITEMS = ['Buy honey', 'Call the vet', 'Water the ferns']

export default function NotesDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="notes" title="Notes" playing={playing}>
      <DemoCss css={CSS} />
      {ITEMS.map((text, i) => (
        <div className="nt-item" key={text} style={{ '--i': i } as CSSProperties}>
          <span className="nt-box">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path className="nt-tick" pathLength={1} d="M3.5 8.5l3 3 6-7" />
            </svg>
          </span>
          <span className="nt-text">{text}</span>
        </div>
      ))}
    </Frame>
  )
}
