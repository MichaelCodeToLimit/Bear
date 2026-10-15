import { DemoCss, Frame } from './Frame'

const CSS = `
.sl-row{display:flex;gap:8px;margin-bottom:10px}
.sl-thumb{flex:1;aspect-ratio:4/3;border-radius:6px;border:2px solid var(--surface-edge);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:1rem}
.sl-1{background:var(--c)}
.sl-2{background:#d97706;transform:translateX(calc(100% + 8px))}
.sl-3{background:#0d9488;transform:translateX(calc(-100% - 8px))}
.sl-4{background:#7c3aed}
.sl-hint{color:var(--ink-muted);text-align:center}
.is-playing .sl-2{animation:sl-right calc(5s * var(--motion-speed)) var(--ease-bounce) infinite}
.is-playing .sl-3{animation:sl-left calc(5s * var(--motion-speed)) var(--ease-bounce) infinite}
@keyframes sl-right{0%,15%{transform:none}35%,85%{transform:translateX(calc(100% + 8px))}100%{transform:none}}
@keyframes sl-left{0%,15%{transform:none}35%,85%{transform:translateX(calc(-100% - 8px))}100%{transform:none}}
`

export default function SlidesDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="slides" title="Slides" playing={playing}>
      <DemoCss css={CSS} />
      <div className="sl-row">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`sl-thumb sl-${n}`}>{n}</div>
        ))}
      </div>
      <div className="sl-hint">Slide sorter</div>
    </Frame>
  )
}
