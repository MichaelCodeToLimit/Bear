import { useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { curvesLut } from '../ops/adjust'
import { addPoint, movePoint, type CurvePoint } from './curvePoints'

export { MAX_CURVE_POINTS, type CurvePoint } from './curvePoints'

/** Size of the graph on screen, in CSS pixels (one per input level). */
const SIZE = 256
/** How close (in CSS pixels) a press must be to pick up a point. */
const HIT = 8
/** How far outside the graph an inner point must be dragged to be deleted. */
const OFF = 16
const PAD = 4
const VIEW = 255 + 2 * PAD

/** Index of the point nearest to (x, y) in value units, if within `HIT` pixels. */
function hitPoint(points: CurvePoint[], x: number, y: number, scale: number): number {
  let best = -1
  let bestD = (HIT * scale) ** 2
  points.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2
    if (d <= bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

/**
 * The Curves graph: input level across, output level up. Click to add a point (up to 16), drag to
 * move one, and drag an inner point off the graph or double-click it to delete it. The two end
 * points always stay.
 */
export function CurvesEditor({ points, onChange }: { points: CurvePoint[]; onChange: (p: CurvePoint[]) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  /** The drag in progress: the dragged point's index and the list with it in place. */
  const drag = useRef<{ index: number; points: CurvePoint[]; off: boolean } | null>(null)

  const toValue = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    // The view box is VIEW units wide and starts at -PAD, so the end points' circles fit.
    const scale = VIEW / Math.max(1, r.width)
    return {
      x: (e.clientX - r.left) * scale - PAD,
      y: 255 - ((e.clientY - r.top) * VIEW) / Math.max(1, r.height) + PAD,
      scale,
      outside: e.clientX < r.left - OFF || e.clientX > r.right + OFF || e.clientY < r.top - OFF || e.clientY > r.bottom + OFF
    }
  }

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const v = toValue(e)
    let index = hitPoint(points, v.x, v.y, v.scale)
    let next = points
    if (index < 0) {
      const added = addPoint(points, v.x, v.y)
      if (!added) return
      next = added.points
      index = added.index
      onChange(next)
    }
    drag.current = { index, points: next, off: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const v = toValue(e)
    const inner = d.index > 0 && d.index < d.points.length - 1
    d.off = inner && v.outside
    if (d.off) return onChange(d.points.filter((_, i) => i !== d.index))
    d.points = movePoint(d.points, d.index, v.x, v.y)
    onChange(d.points)
  }

  const onUp = () => {
    drag.current = null
  }

  const onDouble = (e: ReactMouseEvent<SVGSVGElement>) => {
    const v = toValue(e)
    const i = hitPoint(points, v.x, v.y, v.scale)
    if (i > 0 && i < points.length - 1) onChange(points.filter((_, k) => k !== i))
  }

  const curve = useMemo(() => {
    const lut = curvesLut(points)
    let d = ''
    for (let x = 0; x < 256; x++) d += `${x ? 'L' : 'M'}${x} ${255 - lut[x]}`
    return d
  }, [points])

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svg}
        data-testid="curves-graph"
        viewBox={`${-PAD} ${-PAD} ${VIEW} ${VIEW}`}
        width={SIZE}
        height={SIZE}
        className="mx-auto cursor-crosshair touch-none select-none rounded border border-line bg-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDouble}
      >
        {[64, 128, 192].map((g) => (
          <g key={g} className="stroke-line" strokeWidth={1}>
            <line x1={g} y1={0} x2={g} y2={255} />
            <line x1={0} y1={g} x2={255} y2={g} />
          </g>
        ))}
        <line x1={0} y1={255} x2={255} y2={0} className="stroke-line" strokeDasharray="3 3" />
        <path d={curve} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {points.map(([x, y], i) => (
          <circle key={i} data-testid="curves-point" cx={x} cy={255 - y} r={4} className="fill-surface" stroke="var(--accent)" strokeWidth={1.5} />
        ))}
      </svg>
      <p className="text-center text-[11px] text-muted">Click to add a point. Drag a point off the graph or double-click it to remove it.</p>
    </div>
  )
}
