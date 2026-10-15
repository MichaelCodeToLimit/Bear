import type { CSSProperties } from 'react'
import { DemoCss, Frame } from './Frame'

const CSS = `
.sb{display:flex;justify-content:center;position:relative;height:120px}
.sb svg{width:110px;height:110px;align-self:flex-end}
.sb-z{position:absolute;left:58%;bottom:56px;font-weight:700;color:var(--ink-muted);opacity:.8}
.sb-z1{font-size:.9rem}.sb-z2{font-size:1.15rem;left:64%;bottom:72px}.sb-z3{font-size:1.4rem;left:70%;bottom:90px}
.is-playing .sb-z{animation:sb-z calc(3.6s * var(--motion-speed)) ease-in-out infinite both;animation-delay:calc(var(--i) * 0.9s * var(--motion-speed))}
.is-playing .sb svg{animation:sb-breathe calc(3.6s * var(--motion-speed)) ease-in-out infinite}
@keyframes sb-z{0%{opacity:0;transform:translate(0,10px)}30%{opacity:.9}100%{opacity:0;transform:translate(14px,-26px)}}
@keyframes sb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
`

export default function SleepingBear({ playing }: { playing: boolean }) {
  return (
    <Frame id="sleeping" title="Coming soon" playing={playing}>
      <DemoCss css={CSS} />
      <div className="sb">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="24" cy="26" r="12" fill="#b9814f" />
          <circle cx="76" cy="26" r="12" fill="#b9814f" />
          <ellipse cx="50" cy="62" rx="40" ry="32" fill="#c8915c" />
          <ellipse cx="50" cy="72" rx="16" ry="11" fill="#f1d9b8" />
          <ellipse cx="50" cy="66" rx="5" ry="3.5" fill="#3b2a1a" />
          <path d="M28 54 q7 6 14 0 M58 54 q7 6 14 0" stroke="#3b2a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`sb-z sb-z${n}`} style={{ '--i': n } as CSSProperties}>z</span>
        ))}
      </div>
    </Frame>
  )
}
