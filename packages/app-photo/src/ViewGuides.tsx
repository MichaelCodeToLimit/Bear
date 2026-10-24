import { gridSpacing, gridValues, rulerTicks } from './rulerMath'
import type { Point, ViewState } from './render/view'

/** Thickness of a ruler, in CSS pixels. */
export const RULER_SIZE = 18

/** The view in CSS pixels: the canvas works in device pixels, these overlays in CSS ones. */
function cssView(view: ViewState) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return { z: view.zoom / dpr, px: view.panX / dpr, py: view.panY / dpr, w: Math.max(1, view.viewW / dpr), h: Math.max(1, view.viewH / dpr) }
}

const svgProps = (w: number, h: number) =>
  ({ className: 'pointer-events-none absolute inset-0 h-full w-full', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' }) as const

/** A thin grid every 100 document pixels (wider when zoomed out), over the document only. */
export function GridOverlay({ docW, docH, view }: { docW: number; docH: number; view: ViewState }) {
  const { z, px, py, w, h } = cssView(view)
  const step = gridSpacing(z)
  const xs = gridValues(Math.max(0, -px / z), Math.min(docW, (w - px) / z), step)
  const ys = gridValues(Math.max(0, -py / z), Math.min(docH, (h - py) / z), step)
  const top = Math.max(0, py)
  const bottom = Math.min(h, docH * z + py)
  const left = Math.max(0, px)
  const right = Math.min(w, docW * z + px)
  const path = (off: number) =>
    xs.map((x) => `M${Math.round(x * z + px) + off} ${top}V${bottom}`).join('') + ys.map((y) => `M${left} ${Math.round(y * z + py) + off}H${right}`).join('')
  return (
    <svg data-testid="photo-grid" data-spacing={step} {...svgProps(w, h)} shapeRendering="crispEdges">
      <path d={path(1.5)} stroke="#fff" strokeOpacity={0.4} fill="none" />
      <path d={path(0.5)} stroke="#000" strokeOpacity={0.4} fill="none" />
    </svg>
  )
}

const TEXT = { fontSize: 9, fill: '#c8c8c8', fontFamily: 'system-ui, sans-serif' } as const

/** Rulers along the top and left edges of the viewport, in document pixels; they overlay the edges. */
export function Rulers({ view, cursor }: { view: ViewState; cursor: Point | null }) {
  const { z, px, py, w, h } = cssView(view)
  const top = rulerTicks(-px / z, (w - px) / z, z)
  const left = rulerTicks(-py / z, (h - py) / z, z)
  const R = RULER_SIZE
  const mark = 'var(--accent, #e11d48)'
  return (
    <svg data-testid="photo-rulers" {...svgProps(w, h)}>
      <rect x={0} y={0} width={w} height={R} fill="#2b2b2b" />
      <rect x={0} y={0} width={R} height={h} fill="#2b2b2b" />
      <g stroke="#8a8a8a" strokeWidth={1} shapeRendering="crispEdges">
        {top.map((t) => {
          const x = Math.round(t.value * z + px) + 0.5
          return <line key={t.value} x1={x} x2={x} y1={t.major ? 6 : 13} y2={R} />
        })}
        {left.map((t) => {
          const y = Math.round(t.value * z + py) + 0.5
          return <line key={t.value} y1={y} y2={y} x1={t.major ? 6 : 13} x2={R} />
        })}
      </g>
      {top.filter((t) => t.major).map((t) => (
        <text key={t.value} x={t.value * z + px + 2} y={9} {...TEXT}>{t.value}</text>
      ))}
      {left.filter((t) => t.major).map((t) => {
        const x = 8
        const y = t.value * z + py - 2
        return <text key={t.value} x={x} y={y} transform={`rotate(-90 ${x} ${y})`} {...TEXT}>{t.value}</text>
      })}
      <rect x={0} y={0} width={R} height={R} fill="#2b2b2b" />
      <line x1={0} x2={w} y1={R + 0.5} y2={R + 0.5} stroke="#555" />
      <line y1={0} y2={h} x1={R + 0.5} x2={R + 0.5} stroke="#555" />
      {cursor && (
        <g data-testid="photo-ruler-cursor" stroke={mark} strokeWidth={1} shapeRendering="crispEdges">
          <line x1={Math.round((cursor.x + 0.5) * z + px) + 0.5} x2={Math.round((cursor.x + 0.5) * z + px) + 0.5} y1={0} y2={R} />
          <line y1={Math.round((cursor.y + 0.5) * z + py) + 0.5} y2={Math.round((cursor.y + 0.5) * z + py) + 0.5} x1={0} x2={R} />
        </g>
      )}
    </svg>
  )
}
