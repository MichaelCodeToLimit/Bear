import { DemoCss, Frame } from './Frame'

const CSS = `
.wr-title{font-weight:700;font-size:1rem;margin-bottom:8px;border-bottom:2px solid var(--c);padding-bottom:4px}
.wr-line{height:7px;border-radius:4px;background:var(--surface-edge);margin:7px 0}
.wr-text{line-height:1.6}
.wr-type{display:inline-block;vertical-align:bottom;white-space:nowrap}
.wr-bold{font-weight:700;color:var(--c)}
.wr-caret{display:inline-block;width:2px;height:1em;background:var(--ink);vertical-align:text-bottom;margin-left:1px;opacity:0}
.is-playing .wr-type{animation:wr-type calc(7s * var(--motion-speed)) steps(30,end) infinite}
.is-playing .wr-bold{animation:wr-bold calc(7s * var(--motion-speed)) linear infinite}
.is-playing .wr-caret{animation:wr-caret calc(7s * var(--motion-speed)) linear infinite}
@keyframes wr-type{0%{clip-path:inset(0 100% 0 0)}60%,100%{clip-path:inset(0 0 0 0)}}
@keyframes wr-bold{0%,70%{font-weight:400;color:var(--ink)}76%,100%{font-weight:700;color:var(--c)}}
@keyframes wr-caret{0%,60%{opacity:1}65%,100%{opacity:0}}
`

export default function WriteDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="write" title="Write" playing={playing}>
      <DemoCss css={CSS} />
      <div className="wr-title">Weekend plans</div>
      <div className="wr-text">
        <span className="wr-type">We will bake a very </span>
        <span className="wr-bold">cozy</span>
        <span className="wr-type"> loaf.</span>
        <span className="wr-caret" />
      </div>
      <div className="wr-line" style={{ width: '90%' }} />
      <div className="wr-line" style={{ width: '70%' }} />
    </Frame>
  )
}
