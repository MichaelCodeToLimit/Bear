import { useRef, useState } from 'react'
import { SLIDE_H, SLIDE_W } from '../model'
import type { InkStroke, InkTool } from './useShow'

const STYLE = {
  pen: { color: '#e11d48', width: 4, opacity: 1 },
  highlighter: { color: '#facc15', width: 22, opacity: 0.45 }
}

const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

/** Pen and highlighter on top of a slide, in slide coordinates. Drawing works when a tool is chosen. */
export function InkLayer({ strokes, tool, onChange, interactive }: { strokes: InkStroke[]; tool: InkTool; onChange?: (s: InkStroke[]) => void; interactive?: boolean }) {
  const svg = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<InkStroke | null>(null)
  const active = interactive && tool !== 'pointer'

  const point = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * SLIDE_W, ((e.clientY - r.top) / r.height) * SLIDE_H]
  }

  const eraseAt = (p: [number, number]) => {
    const near = (s: InkStroke) => s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 18)
    if (strokes.some(near)) onChange?.(strokes.filter((s) => !near(s)))
  }

  return (
    <svg
      ref={svg}
      data-ink
      className="absolute inset-0"
      width={SLIDE_W}
      height={SLIDE_H}
      viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`}
      style={{ pointerEvents: active ? 'auto' : 'none', cursor: active ? (tool === 'eraser' ? 'cell' : 'crosshair') : undefined, touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!active) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        if (tool === 'eraser') return eraseAt(point(e))
        setDrawing({ id: Date.now(), tool: tool as InkStroke['tool'], points: [point(e)] })
      }}
      onPointerMove={(e) => {
        if (!active || e.buttons !== 1) return
        if (tool === 'eraser') return eraseAt(point(e))
        setDrawing((d) => (d ? { ...d, points: [...d.points, point(e)] } : d))
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        if (drawing && drawing.points.length) onChange?.([...strokes, drawing])
        setDrawing(null)
      }}
      onClick={(e) => active && e.stopPropagation()}
    >
      {[...strokes, ...(drawing ? [drawing] : [])].map((s) => (
        <path key={s.id} d={path(s.points.length === 1 ? [s.points[0], [s.points[0][0] + 0.1, s.points[0][1]]] : s.points)} fill="none" stroke={STYLE[s.tool].color} strokeWidth={STYLE[s.tool].width} strokeOpacity={STYLE[s.tool].opacity} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}
