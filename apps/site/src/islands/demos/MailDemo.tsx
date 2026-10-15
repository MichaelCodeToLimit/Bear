import { DemoCss, Frame } from './Frame'

const CSS = `
.ml{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ml-row{padding:6px 8px;border-radius:6px;border:1px solid var(--surface-edge);margin-bottom:5px;background:var(--surface)}
.ml-row b{display:block}
.ml-row span{color:var(--ink-muted);font-size:.7rem}
.ml-new{background:color-mix(in srgb,var(--c) 16%,var(--surface));border-color:var(--c)}
.ml-pane{border:1px solid var(--surface-edge);border-radius:6px;padding:8px}
.ml-line{height:6px;border-radius:3px;background:var(--surface-edge);margin:6px 0}
.is-playing .ml-new{animation:ml-drop calc(6s * var(--motion-speed)) var(--ease-bounce) infinite}
.is-playing .ml-pane{animation:ml-open calc(6s * var(--motion-speed)) ease-out infinite}
@keyframes ml-drop{0%,5%{opacity:0;transform:translateY(-40px)}20%,100%{opacity:1;transform:none}}
@keyframes ml-open{0%,40%{opacity:.25;transform:scale(.96)}55%,100%{opacity:1;transform:none}}
`

export default function MailDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="mail" title="Mail" playing={playing}>
      <DemoCss css={CSS} />
      <div className="ml">
        <div>
          <div className="ml-row ml-new"><b>Hello from the forest</b><span>Bramble, just now</span></div>
          <div className="ml-row"><b>Lunch on Friday?</b><span>Maple, 9:12</span></div>
          <div className="ml-row"><b>Your honey order</b><span>Hive Co, Mon</span></div>
        </div>
        <div className="ml-pane">
          <b>Hello from the forest</b>
          <div className="ml-line" style={{ width: '90%' }} />
          <div className="ml-line" style={{ width: '75%' }} />
          <div className="ml-line" style={{ width: '60%' }} />
        </div>
      </div>
    </Frame>
  )
}
