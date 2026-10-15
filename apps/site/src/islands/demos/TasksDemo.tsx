import { DemoCss, Frame } from './Frame'

const CSS = `
.tk{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tk-h{font-weight:700;color:var(--ink-muted);margin-bottom:6px}
.tk-card{padding:7px 8px;border-radius:6px;border:1px solid var(--surface-edge);background:var(--surface);margin-bottom:6px;box-shadow:var(--shadow-sm)}
.tk-move{position:relative;z-index:1;border-color:var(--c);transform:translateX(calc(100% + 10px));background:color-mix(in srgb,var(--c) 16%,var(--surface))}
.is-playing .tk-move{animation:tk-slide calc(5s * var(--motion-speed)) var(--ease-bounce) infinite}
@keyframes tk-slide{0%,20%{transform:none}45%,88%{transform:translateX(calc(100% + 10px))}100%{transform:none}}
`

export default function TasksDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="tasks" title="Tasks" playing={playing}>
      <DemoCss css={CSS} />
      <div className="tk">
        <div>
          <div className="tk-h">To do</div>
          <div className="tk-card tk-move">Pack the picnic</div>
          <div className="tk-card">Book the cabin</div>
        </div>
        <div>
          <div className="tk-h">Done</div>
        </div>
      </div>
    </Frame>
  )
}
