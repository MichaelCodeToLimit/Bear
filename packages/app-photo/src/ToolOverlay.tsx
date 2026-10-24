import { useMemo } from 'react'
import { traceEdges, type Mask } from './model/mask'
import type { ViewState } from './render/view'
import type { Overlay } from './tools/types'

/** SVG path data for the selection outline, in document pixels. */
export function outlinePath(m: Mask): string {
  return traceEdges(m)
    .map((loop) => `M${loop.map((p) => `${p[0]} ${p[1]}`).join('L')}Z`)
    .join('')
}

/** Black dashes over white, marching; stroke widths stay one CSS pixel at any zoom. */
function Ants({ d, transform }: { d: string; transform?: string }) {
  const common = { d, fill: 'none', vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1, transform }
  return (
    <>
      <path {...common} stroke="#fff" />
      <path {...common} stroke="#000" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" from="0" to="-8" dur="0.6s" repeatCount="indefinite" />
      </path>
    </>
  )
}

/**
 * Drawn over the canvas: the selection's marching ants and whatever the active tool is drawing.
 * The viewBox is the canvas's device-pixel size, so the view maps straight onto it. The outline is
 * traced only when the selection object changes; panning and zooming just change the transform.
 * The brush outline is drawn only while `hover` (the pointer is over the canvas with a brush tool).
 */
export function ToolOverlay({ selection, overlay, view, hover = true }: { selection: Mask | null; overlay: Overlay | null; view: ViewState; hover?: boolean }) {
  const outline = useMemo(() => (selection ? outlinePath(selection) : ''), [selection])
  const { zoom, panX, panY, viewW, viewH } = view
  const toView = `matrix(${zoom} 0 0 ${zoom} ${panX} ${panY})`
  const shift = overlay?.kind === 'move' ? ` translate(${overlay.dx} ${overlay.dy})` : ''
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return (
    <svg
      data-testid="photo-overlay"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${Math.max(1, viewW)} ${Math.max(1, viewH)}`}
      preserveAspectRatio="none"
    >
      {outline && (
        <g data-testid="photo-ants">
          <Ants d={outline} transform={toView + shift} />
        </g>
      )}
      {overlay?.kind === 'marquee' &&
        (overlay.ellipse ? (
          <Ants
            transform={toView}
            d={(() => {
              const { x, y, width: w, height: h } = overlay.rect
              const rx = w / 2
              const ry = h / 2
              return `M${x} ${y + ry}a${rx} ${ry} 0 1 0 ${w} 0a${rx} ${ry} 0 1 0 ${-w} 0Z`
            })()}
          />
        ) : (
          <Ants transform={toView} d={`M${overlay.rect.x} ${overlay.rect.y}h${overlay.rect.width}v${overlay.rect.height}h${-overlay.rect.width}Z`} />
        ))}
      {overlay?.kind === 'path' && overlay.points.length > 1 && (
        <Ants transform={toView} d={`M${overlay.points.map((p) => `${p[0]} ${p[1]}`).join('L')}`} />
      )}
      {overlay?.kind === 'crop' && <CropBox rect={overlay.rect} view={view} dpr={dpr} />}
      {overlay?.kind === 'brush' && hover && (
        <g data-testid="photo-brush-cursor" transform={toView}>
          {['#fff', '#000'].map((stroke, i) => (
            <circle key={stroke} cx={overlay.x} cy={overlay.y} r={Math.max(0.5, overlay.size / 2)} fill="none" stroke={stroke} strokeWidth={i ? 1 : 3} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}
    </svg>
  )
}

function CropBox({ rect, view, dpr }: { rect: { x: number; y: number; width: number; height: number }; view: ViewState; dpr: number }) {
  const L = rect.x * view.zoom + view.panX
  const T = rect.y * view.zoom + view.panY
  const W = rect.width * view.zoom
  const H = rect.height * view.zoom
  const hs = 7 * dpr
  const handles = [
    [L, T], [L + W / 2, T], [L + W, T], [L, T + H / 2], [L + W, T + H / 2], [L, T + H], [L + W / 2, T + H], [L + W, T + H]
  ]
  return (
    <g data-testid="photo-crop-box">
      {/* Shade everything outside the box. */}
      <path
        fillRule="evenodd"
        fill="rgba(0,0,0,0.45)"
        d={`M0 0H${view.viewW}V${view.viewH}H0Z M${L} ${T}h${W}v${H}h${-W}Z`}
      />
      <rect x={L} y={T} width={W} height={H} fill="none" stroke="#fff" strokeWidth={dpr} />
      {[1, 2].map((i) => (
        <g key={i} stroke="rgba(255,255,255,0.5)" strokeWidth={dpr * 0.75}>
          <line x1={L + (W * i) / 3} y1={T} x2={L + (W * i) / 3} y2={T + H} />
          <line x1={L} y1={T + (H * i) / 3} x2={L + W} y2={T + (H * i) / 3} />
        </g>
      ))}
      {handles.map(([x, y], i) => (
        <rect key={i} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#fff" stroke="#000" strokeWidth={dpr * 0.75} />
      ))}
    </g>
  )
}
