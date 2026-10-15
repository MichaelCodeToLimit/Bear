import type { CSSProperties } from 'react'
import { DemoCss, Frame } from './Frame'

const CSS = `
.st-hero{height:34px;border-radius:6px;background:var(--c);color:#fff;font-weight:700;display:flex;align-items:center;padding:0 10px;margin-bottom:8px}
.st-card{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--surface-edge);border-radius:6px;margin-bottom:6px;background:var(--surface)}
.st-pic{width:26px;height:26px;border-radius:5px;background:color-mix(in srgb,var(--c) 40%,transparent);flex:none}
.is-playing .st-card{animation:st-in calc(6s * var(--motion-speed)) var(--ease-bounce) infinite both;animation-delay:calc(var(--i) * 0.35s * var(--motion-speed))}
@keyframes st-in{0%{opacity:0;transform:translateX(60px)}14%,88%{opacity:1;transform:none}100%{opacity:0;transform:translateX(60px)}}
`

const NEWS = ['New honey shelf opens', 'Team picnic on Friday', 'Docs library is live']

export default function SitesDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="sites" title="Sites" playing={playing}>
      <DemoCss css={CSS} />
      <div className="st-hero">Team home</div>
      {NEWS.map((text, i) => (
        <div className="st-card" key={text} style={{ '--i': i } as CSSProperties}>
          <span className="st-pic" />
          <span>{text}</span>
        </div>
      ))}
    </Frame>
  )
}
