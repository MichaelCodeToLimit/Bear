import { DemoCss, Frame } from './Frame'

// A picture built from layers: a brush stroke paints across the canvas while its layer joins the top of the stack.
const CSS = `
.ph{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:10px;align-items:start}
.ph-canvas{display:block;width:100%;height:auto;border-radius:6px;border:1px solid var(--surface-edge);box-shadow:var(--shadow-sm)}
.ph-stroke{fill:none;stroke:var(--c);stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:0;opacity:.9}
.ph-h{font-weight:700;color:var(--ink-muted);margin-bottom:6px}
.ph-layers{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.ph-layer{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;border:1px solid var(--surface-edge);background:var(--surface);font-size:.7rem;white-space:nowrap;overflow:hidden}
.ph-thumb{width:16px;height:12px;border-radius:3px;flex:none;border:1px solid var(--surface-edge)}
.ph-new{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,var(--surface))}
.ph-new .ph-thumb{background:linear-gradient(135deg,transparent 40%,var(--c) 40% 60%,transparent 60%)}
.ph-sun{background:#fbbf24}.ph-sky{background:linear-gradient(#7dd3fc,#bae6fd 60%,#86efac 60%)}
.ph-op{margin-top:8px;height:5px;border-radius:999px;background:var(--surface-edge);overflow:hidden}
.ph-op i{display:block;height:100%;width:90%;background:var(--c);border-radius:inherit}
.is-playing .ph-stroke{animation:ph-paint calc(6s * var(--motion-speed)) ease-in-out infinite both}
.is-playing .ph-new{animation:ph-add calc(6s * var(--motion-speed)) var(--ease-bounce) infinite both}
.is-playing .ph-op i{animation:ph-op calc(6s * var(--motion-speed)) ease-in-out infinite both}
@keyframes ph-paint{0%,12%{stroke-dashoffset:1}50%,90%{stroke-dashoffset:0}100%{stroke-dashoffset:1}}
@keyframes ph-add{0%{opacity:0;transform:translateY(-8px)}10%,92%{opacity:1;transform:none}100%{opacity:0}}
@keyframes ph-op{0%,55%{width:100%}75%,92%{width:90%}100%{width:100%}}
`

export default function PhotoDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="photo" title="Photo" playing={playing}>
      <DemoCss css={CSS} />
      <div className="ph">
        <svg className="ph-canvas" viewBox="0 0 160 120" role="img" aria-label="A brush stroke painted on its own layer above a landscape">
          <defs>
            <linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#e0f2fe" />
            </linearGradient>
          </defs>
          <rect width="160" height="120" fill="url(#ph-sky)" />
          <circle cx="120" cy="34" r="16" fill="#fbbf24" />
          <path d="M0 92 C40 70 70 78 100 88 S140 84 160 80 V120 H0 Z" fill="#4ade80" />
          <path d="M0 104 C30 96 70 100 160 98 V120 H0 Z" fill="#16a34a" />
          <path className="ph-stroke" pathLength={1} d="M18 58 C38 30 58 74 80 48 S112 40 128 62" />
        </svg>
        <div>
          <div className="ph-h">Layers</div>
          <ul className="ph-layers">
            <li className="ph-layer ph-new">
              <span className="ph-thumb" />
              Brush
            </li>
            <li className="ph-layer">
              <span className="ph-thumb ph-sun" />
              Sun
            </li>
            <li className="ph-layer">
              <span className="ph-thumb ph-sky" />
              Background
            </li>
          </ul>
          <div className="ph-op" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>
    </Frame>
  )
}
