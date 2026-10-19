import { useEffect, useRef, type ReactNode } from 'react'
import { intersectRect, type Rect } from './model/bitmap'
import type { PhotoDoc } from './model/doc'
import { createCompositor, type ManagedCompositor, type Preview } from './render/compositor'
import { fitView, screenToDoc, zoomAt, type Point, type ViewState } from './render/view'
import type { ToolPointer } from './tools/types'
import type { PhotoEditorState } from './usePhotoEditor'
import type { PointerPhase } from './useTools'

export type CanvasBackground = 'light' | 'dark'

/** Fit the document, but never start above 100%. */
export function initialView(docW: number, docH: number, viewW: number, viewH: number): ViewState {
  const fit = fitView(docW, docH, viewW, viewH)
  if (fit.zoom <= 1) return fit
  return { zoom: 1, panX: Math.round((viewW - docW) / 2), panY: Math.round((viewH - docH) / 2), viewW, viewH }
}

/** Re-upload the parts of layers that a pixel edit (in document coordinates) touched. */
function syncDirty(compositor: ManagedCompositor, doc: PhotoDoc, dirty: Rect): void {
  for (const l of doc.layers) {
    const hit = intersectRect(dirty, { x: l.x, y: l.y, width: l.pixels.width, height: l.pixels.height })
    if (hit) compositor.syncLayer(l, { x: hit.x - l.x, y: hit.y - l.y, width: hit.width, height: hit.height })
  }
}

interface CanvasViewProps {
  state: PhotoEditorState
  background: CanvasBackground
  /** Cursor position in document pixels, or null when the pointer leaves the canvas. */
  onCursor: (p: Point | null) => void
  /** GPU fallback and similar notices. */
  onNotice: (message: string) => void
  /** A live adjustment preview (Task 14). */
  preview?: Preview
  /** Tool pointer events: presses, drags, and moves while hovering. */
  onToolPointer?: (phase: PointerPhase, p: ToolPointer) => void
  /** The press in progress was cancelled by the system (pointercancel). */
  onToolCancel?: () => void
  /** CSS cursor for the active tool. */
  cursor?: string
  /** Overlays drawn above the canvas (selection outline, crop box…). */
  children?: ReactNode
}

/**
 * The document on a checkerboard. Pointer and wheel handlers live on the wrapping
 * `[data-photo-viewport]` element: after a GPU context loss the compositor swaps in a stand-in canvas,
 * which takes over `data-testid="photo-canvas"`.
 */
export function CanvasView({ state, background, onCursor, onNotice, preview, onToolPointer, onToolCancel, cursor, children }: CanvasViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const compositor = useRef<ManagedCompositor | null>(null)
  const latest = useRef({ state, preview, onCursor, onNotice, onToolPointer, onToolCancel })
  latest.current = { state, preview, onCursor, onNotice, onToolPointer, onToolCancel }
  const { editor, version, view, setView, loadId, subscribe, hasDoc } = state

  useEffect(() => {
    const c = createCompositor(canvas.current!, (reason) => latest.current.onNotice(reason))
    compositor.current = c
    return () => {
      c.dispose()
      compositor.current = null
    }
  }, [])

  useEffect(
    () =>
      subscribe((dirty, kind) => {
        const c = compositor.current
        if (c && dirty && kind !== 'load') syncDirty(c, latest.current.state.editor.doc, dirty)
      }),
    [subscribe]
  )

  // Track the viewport size in canvas (device) pixels.
  useEffect(() => {
    const el = wrap.current!
    const measure = () => {
      const dpr = window.devicePixelRatio || 1
      const viewW = Math.max(1, Math.round(el.clientWidth * dpr))
      const viewH = Math.max(1, Math.round(el.clientHeight * dpr))
      setView((v) => (v.viewW === viewW && v.viewH === viewH ? v : { ...v, viewW, viewH }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [setView])

  // Fit each newly loaded document once the viewport has a size.
  const fitted = useRef(0)
  useEffect(() => {
    if (!hasDoc || fitted.current === loadId || view.viewW <= 1) return
    fitted.current = loadId
    setView(initialView(editor.doc.width, editor.doc.height, view.viewW, view.viewH))
  }, [hasDoc, loadId, view.viewW, view.viewH, editor, setView])

  // Draw at most once per frame.
  useEffect(() => {
    if (!hasDoc) return
    const id = requestAnimationFrame(() => compositor.current?.render(editor.doc, view, latest.current.preview))
    return () => cancelAnimationFrame(id)
  }, [editor, version, view, preview, hasDoc])

  useEffect(() => {
    const el = wrap.current!
    const toScreen = (e: { clientX: number; clientY: number }): Point => {
      const r = el.getBoundingClientRect()
      const v = latest.current.state.view
      return { x: ((e.clientX - r.left) * v.viewW) / Math.max(1, r.width), y: ((e.clientY - r.top) * v.viewH) / Math.max(1, r.height) }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = toScreen(e)
      const dpr = window.devicePixelRatio || 1
      // Lines (Firefox-style) and pages are converted to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
      if (e.ctrlKey || e.metaKey) {
        latest.current.state.setView((v) => zoomAt(v, Math.exp((-e.deltaY * unit) / 300), s.x, s.y))
      } else {
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit * dpr
        const dy = (e.shiftKey ? 0 : e.deltaY) * unit * dpr
        latest.current.state.setView((v) => ({ ...v, panX: v.panX - dx, panY: v.panY - dy }))
      }
    }
    const toolPointer = (e: PointerEvent): ToolPointer => {
      const s = toScreen(e)
      const d = screenToDoc(latest.current.state.view, s)
      // Mice report a fixed 0.5 while pressed, so only pens count as pressure.
      const pressure = e.pointerType === 'pen' ? e.pressure : null
      return { x: d.x, y: d.y, sx: s.x, sy: s.y, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pressure }
    }
    let pressed: number | null = null
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !latest.current.state.hasDoc || pressed !== null) return
      // Leave option fields, so tool letters and Enter reach the tools again.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused !== document.body) focused.blur()
      e.preventDefault()
      pressed = e.pointerId
      el.setPointerCapture(e.pointerId)
      latest.current.onToolPointer?.('down', toolPointer(e))
    }
    const onMove = (e: PointerEvent) => {
      if (!latest.current.state.hasDoc) return
      const p = toolPointer(e)
      latest.current.onCursor({ x: Math.floor(p.x), y: Math.floor(p.y) })
      if (pressed === null || pressed === e.pointerId) latest.current.onToolPointer?.('move', p)
    }
    const onUp = (e: PointerEvent) => {
      if (pressed !== e.pointerId) return
      pressed = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      latest.current.onToolPointer?.('up', toolPointer(e))
    }
    // The system took the pointer away (a palm-rejected pen, a touch turned into a gesture): abandon the
    // drag, undoing its preview, instead of committing it as if it had been released there.
    const onCancel = (e: PointerEvent) => {
      if (pressed !== e.pointerId) return
      pressed = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      latest.current.onToolCancel?.()
    }
    const onLeave = () => latest.current.onCursor(null)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={wrap}
      data-photo-viewport
      style={{ cursor: hasDoc ? cursor : undefined, touchAction: 'none' }}
      // Styling stays on the wrapper: a stand-in canvas copies the canvas's attributes only once.
      className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${background === 'dark' ? 'bg-[#262626]' : 'bg-[#d4d4d4]'} ${hasDoc ? '' : '[&>canvas]:invisible'}`}
    >
      <canvas ref={canvas} data-testid="photo-canvas" className="photo-canvas absolute inset-0 h-full w-full" />
      {children}
    </div>
  )
}
