import type { CSSProperties } from 'react'
import { mergeAt, usedRange } from './model'
import type { SheetStore } from './store'
import { defaultAlign } from './values'

/**
 * The active sheet's used range as an HTML table. Hidden on screen; it is what gets printed and
 * exported to PDF (the canvas grid only shows what fits in the window).
 */
export function PrintView({ store, version }: { store: SheetStore; version: number }) {
  const used = usedRange(store.sheet)
  if (!used) return <div className="hidden print:block" data-version={version} />
  const sheet = store.sheet
  const rows = []
  for (let r = used.r1; r <= used.r2; r++) {
    const cells = []
    for (let c = used.c1; c <= used.c2; c++) {
      const m = mergeAt(sheet, r, c)
      if (m && (m.r1 !== r || m.c1 !== c)) continue
      const cell = store.cell(r, c)
      const s = cell?.style
      const style: CSSProperties = {
        background: s?.fill,
        color: s?.color,
        fontWeight: s?.bold ? 700 : undefined,
        fontStyle: s?.italic ? 'italic' : undefined,
        textDecoration: [s?.underline && 'underline', s?.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
        fontSize: s?.fontSize ? `${s.fontSize}pt` : undefined,
        textAlign: s?.align ?? defaultAlign(store.value(r, c)),
        whiteSpace: s?.wrap ? 'pre-wrap' : 'pre'
      }
      cells.push(
        <td key={c} rowSpan={m ? m.r2 - m.r1 + 1 : undefined} colSpan={m ? m.c2 - m.c1 + 1 : undefined} style={style}>
          {store.display(r, c)}
        </td>
      )
    }
    rows.push(<tr key={r} style={{ height: store.rowHeight(r) }}>{cells}</tr>)
  }
  return (
    <div className="sheet-print hidden print:block" data-version={version}>
      <table>
        <colgroup>
          {Array.from({ length: used.c2 - used.c1 + 1 }, (_, i) => (
            <col key={i} style={{ width: store.colWidth(used.c1 + i) }} />
          ))}
        </colgroup>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}
