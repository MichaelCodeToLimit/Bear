import { DemoCss, Frame } from './Frame'

const CSS = `
.bd{display:block;width:100%;height:auto;background:repeating-linear-gradient(0deg,transparent 0 17px,var(--surface-edge) 17px 18px)}
.bd path,.bd ellipse{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:0}
.bd-a{stroke:var(--c)}.bd-b{stroke:#d97706}.bd-c{stroke:#7c3aed}
.bd-note{fill:#fde68a;stroke:none}
.is-playing .bd-s{animation:bd-draw calc(7s * var(--motion-speed)) ease-in-out infinite both}
.is-playing .bd-b{animation-delay:calc(1.4s * var(--motion-speed))}
.is-playing .bd-c{animation-delay:calc(2.8s * var(--motion-speed))}
@keyframes bd-draw{0%{stroke-dashoffset:1}25%,90%{stroke-dashoffset:0}100%{stroke-dashoffset:1}}
`

export default function BoardDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="board" title="Board" playing={playing}>
      <DemoCss css={CSS} />
      <svg className="bd" viewBox="0 0 220 120" role="img" aria-label="A whiteboard sketch drawing itself">
        <rect className="bd-note" x="150" y="12" width="56" height="44" rx="4" />
        <ellipse className="bd-s bd-a" pathLength={1} cx="52" cy="44" rx="34" ry="22" />
        <path className="bd-s bd-b" pathLength={1} d="M88 52 C112 56 120 78 108 98" />
        <path className="bd-s bd-b" pathLength={1} d="M100 92 L108 99 L114 90" />
        <path className="bd-s bd-c" pathLength={1} d="M16 104 C40 86 60 116 84 100 S140 90 200 104" />
      </svg>
    </Frame>
  )
}
