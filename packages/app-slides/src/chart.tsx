import type { ChartElement } from './model'
import { fontFamily, type Theme } from './themes'

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100))

/** "Nice" axis maximum and step for values up to `max`. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  return { top: Math.ceil(max / step) * step, step }
}

/** A chart drawn as SVG at the element's size, in the theme's colours. */
export function ChartView({ el, theme }: { el: ChartElement; theme: Theme }) {
  const { w, h } = el
  const colors = theme.accents
  const font = fontFamily(theme, 'body')
  const titleH = el.title ? 36 : 8
  const legendH = el.legend && (el.series.length > 1 || el.chartType === 'pie' || el.chartType === 'doughnut') ? 28 : 0
  const text = theme.text

  const legendItems = el.chartType === 'pie' || el.chartType === 'doughnut' ? el.categories : el.series.map((s) => s.name)
  const legend = legendH > 0 && (
    <g transform={`translate(0 ${h - legendH + 6})`}>
      {legendItems.map((name, i) => {
        const x = (w / (legendItems.length + 1)) * (i + 1) - 40
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <rect width={12} height={12} rx={2} fill={colors[i % colors.length]} />
            <text x={18} y={11} fontSize={14} fill={text} fontFamily={font}>{name}</text>
          </g>
        )
      })}
    </g>
  )

  const plot = { x: 0, y: titleH, w, h: h - titleH - legendH }
  let body: React.ReactNode

  if (el.chartType === 'pie' || el.chartType === 'doughnut') {
    const values = el.series[0]?.values ?? []
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const r = Math.max(10, Math.min(plot.w, plot.h) / 2 - 8)
    const cx = plot.x + plot.w / 2
    const cy = plot.y + plot.h / 2
    let angle = -Math.PI / 2
    body = values.map((v, i) => {
      const frac = Math.max(0, v) / total
      const a2 = angle + frac * Math.PI * 2
      const large = frac > 0.5 ? 1 : 0
      const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`
      const inner = el.chartType === 'doughnut' ? r * 0.55 : 0
      const d = frac >= 0.9999
        ? `M ${p(0, r)} A ${r} ${r} 0 1 1 ${p(Math.PI, r)} A ${r} ${r} 0 1 1 ${p(0, r)} Z`
        : inner
          ? `M ${p(angle, r)} A ${r} ${r} 0 ${large} 1 ${p(a2, r)} L ${p(a2, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z`
          : `M ${cx} ${cy} L ${p(angle, r)} A ${r} ${r} 0 ${large} 1 ${p(a2, r)} Z`
      const mid = (angle + a2) / 2
      angle = a2
      return (
        <g key={i}>
          <path d={d} fill={colors[i % colors.length]} stroke="#ffffff" strokeWidth={2} />
          {frac > 0.04 && <text x={cx + (inner ? (r + inner) / 2 : r * 0.62) * Math.cos(mid)} y={cy + (inner ? (r + inner) / 2 : r * 0.62) * Math.sin(mid) + 5} textAnchor="middle" fontSize={14} fill="#ffffff" fontFamily={font}>{Math.round(frac * 100)}%</text>}
        </g>
      )
    })
    if (el.chartType === 'doughnut' && values.length === 0) body = null
  } else {
    const all = el.series.flatMap((s) => s.values)
    const { top, step } = niceScale(Math.max(0, ...all))
    const axisW = 48
    const catH = 24
    const area = { x: plot.x + axisW, y: plot.y + 6, w: plot.w - axisW - 8, h: plot.h - catH - 6 }
    const horizontal = el.chartType === 'bar'
    const ticks: number[] = []
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v)
    const n = Math.max(1, el.categories.length)
    const grid = ticks.map((v) => {
      if (horizontal) {
        const x = area.x + (v / top) * area.w
        return <g key={v}><line x1={x} y1={area.y} x2={x} y2={area.y + area.h} stroke={text} strokeOpacity={0.15} /><text x={x} y={area.y + area.h + 18} textAnchor="middle" fontSize={12} fill={text} fontFamily={font}>{fmt(v)}</text></g>
      }
      const y = area.y + area.h - (v / top) * area.h
      return <g key={v}><line x1={area.x} y1={y} x2={area.x + area.w} y2={y} stroke={text} strokeOpacity={0.15} /><text x={area.x - 8} y={y + 4} textAnchor="end" fontSize={12} fill={text} fontFamily={font}>{fmt(v)}</text></g>
    })
    const cats = el.categories.map((c, i) => {
      const band = (horizontal ? area.h : area.w) / n
      return horizontal
        ? <text key={i} x={area.x - 8} y={area.y + band * (i + 0.5) + 4} textAnchor="end" fontSize={13} fill={text} fontFamily={font}>{c}</text>
        : <text key={i} x={area.x + band * (i + 0.5)} y={area.y + area.h + 18} textAnchor="middle" fontSize={13} fill={text} fontFamily={font}>{c}</text>
    })
    let marks: React.ReactNode
    if (el.chartType === 'line') {
      const band = area.w / n
      marks = el.series.map((s, si) => {
        const pts = s.values.slice(0, n).map((v, i) => `${area.x + band * (i + 0.5)},${area.y + area.h - (Math.max(0, v) / top) * area.h}`)
        return (
          <g key={si}>
            <polyline points={pts.join(' ')} fill="none" stroke={colors[si % colors.length]} strokeWidth={3} strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p.split(',')[0]} cy={p.split(',')[1]} r={4} fill={colors[si % colors.length]} />)}
          </g>
        )
      })
    } else {
      const band = (horizontal ? area.h : area.w) / n
      const groupW = band * 0.72
      const barW = groupW / Math.max(1, el.series.length)
      marks = el.categories.map((_, ci) =>
        el.series.map((s, si) => {
          const v = Math.max(0, s.values[ci] ?? 0)
          const len = (v / top) * (horizontal ? area.w : area.h)
          const off = band * ci + (band - groupW) / 2 + barW * si
          return horizontal
            ? <rect key={`${ci}-${si}`} x={area.x} y={area.y + off} width={len} height={barW * 0.92} fill={colors[si % colors.length]} />
            : <rect key={`${ci}-${si}`} x={area.x + off} y={area.y + area.h - len} width={barW * 0.92} height={len} fill={colors[si % colors.length]} />
        })
      )
    }
    body = <>{grid}{cats}{marks}</>
  }

  return (
    <svg className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={el.title || 'Chart'}>
      {el.title && <text x={w / 2} y={26} textAnchor="middle" fontSize={20} fontWeight={600} fill={theme.title} fontFamily={fontFamily(theme, 'heading')}>{el.title}</text>}
      {body}
      {legend}
    </svg>
  )
}

/** A new chart with sample data. */
export function sampleChart(chartType: ChartElement['chartType']): Pick<ChartElement, 'chartType' | 'title' | 'categories' | 'series' | 'legend'> {
  const pie = chartType === 'pie' || chartType === 'doughnut'
  return {
    chartType,
    title: 'Chart title',
    categories: pie ? ['North', 'South', 'East', 'West'] : ['Q1', 'Q2', 'Q3', 'Q4'],
    series: pie ? [{ name: 'Sales', values: [42, 28, 18, 12] }] : [{ name: '2025', values: [12, 19, 15, 24] }, { name: '2026', values: [16, 22, 21, 30] }],
    legend: true
  }
}
