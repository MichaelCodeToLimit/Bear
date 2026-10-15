import type { CSSProperties } from 'react'
import { DemoCss, Frame } from './Frame'

const CSS = `
@property --sh-n{syntax:'<integer>';inherits:false;initial-value:60}
.sh-grid{display:grid;grid-template-columns:28px 1fr 1fr;border:1px solid var(--surface-edge);font-variant-numeric:tabular-nums}
.sh-grid span{padding:4px 6px;border:1px solid var(--surface-edge);min-height:24px}
.sh-h{background:var(--surface-edge);font-weight:700;text-align:center;color:var(--ink-muted)}
.sh-total{background:color-mix(in srgb,var(--c) 18%,transparent);font-weight:700}
.sh-sum{counter-reset:sh-n var(--sh-n)}
.sh-sum::after{content:counter(sh-n)}
.is-playing .sh-cell{animation:sh-in calc(6s * var(--motion-speed)) ease-out infinite both;animation-delay:calc(var(--i) * 0.28s * var(--motion-speed))}
.is-playing .sh-sum{animation:sh-count calc(6s * var(--motion-speed)) ease-out infinite both;animation-delay:calc(1.8s * var(--motion-speed))}
@keyframes sh-in{0%{opacity:0;transform:scale(.7)}8%,90%{opacity:1;transform:none}100%{opacity:0}}
@keyframes sh-count{0%{--sh-n:0}30%,100%{--sh-n:60}}
`

const ROWS: Array<[string, number]> = [['Flour', 25], ['Honey', 15], ['Oats', 20]]

export default function SheetsDemo({ playing }: { playing: boolean }) {
  return (
    <Frame id="sheets" title="Sheets" playing={playing}>
      <DemoCss css={CSS} />
      <div className="sh-grid">
        <span className="sh-h" />
        <span className="sh-h">A</span>
        <span className="sh-h">B</span>
        {ROWS.map(([name, qty], r) => (
          <Row key={name} row={r + 1} name={name} qty={qty} />
        ))}
        <span className="sh-h">4</span>
        <span className="sh-total">Total</span>
        <span className="sh-total sh-sum" />
      </div>
      <div style={{ marginTop: 8, color: 'var(--ink-muted)' }}>=SUM(B1:B3)</div>
    </Frame>
  )
}

function Row({ row, name, qty }: { row: number; name: string; qty: number }) {
  const i = row * 2
  return (
    <>
      <span className="sh-h">{row}</span>
      <span className="sh-cell" style={{ '--i': i } as CSSProperties}>{name}</span>
      <span className="sh-cell" style={{ '--i': i + 1 } as CSSProperties}>{qty}</span>
    </>
  )
}
