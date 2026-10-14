import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PLACEHOLDER_PROMPT, SLIDE_H, SLIDE_W, hasText, type SlideElement, type TextElement } from './model'
import type { SlidesStore } from './store'
import { SlideView, textCss } from './SlideView'
import type { Theme } from './themes'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const SNAP = 6

type Drag =
  | { kind: 'move'; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean; wasSelected: boolean; target: string }
  | { kind: 'resize'; handle: Handle; start: { x: number; y: number }; orig: SlideElement }
  | { kind: 'marquee'; start: { x: number; y: number }; cur: { x: number; y: number } }

interface StageProps {
  store: SlidesStore
  version: number
  theme: Theme
  accent: string
  onKeyDown: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  onContextMenu: (x: number, y: number) => void
}

/** Hit area: lines are thin, so give them some slack. */
function contains(el: SlideElement, x: number, y: number) {
  const pad = el.kind === 'shape' && el.shape === 'line' ? 8 : 0
  return x >= el.x - pad && x <= el.x + el.w + pad && y >= el.y - pad && y <= el.y + el.h + pad
}

export function Stage({ store, version, theme, accent, onKeyDown, onPaste, onContextMenu }: StageProps) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const slide = store.slide
  const scale = width / SLIDE_W

  // Fit the slide into the available space with a margin.
  useLayoutEffect(() => {
    const el = host.current!
    const fit = () => {
      const w = el.clientWidth - 48
      const h = el.clientHeight - 48
      setWidth(Math.max(200, Math.floor(Math.min(w, (h * SLIDE_W) / SLIDE_H))))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toSlide = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.querySelector('[data-stage]')!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const p = toSlide(e)
    host.current?.focus({ preventScroll: true })
    const handle = (e.target as HTMLElement).getAttribute('data-handle') as Handle | null
    if (handle && store.selection.length === 1) {
      e.preventDefault()
      store.beginLive()
      setDrag({ kind: 'resize', handle, start: p, orig: store.selection[0] })
      return
    }
    if ((e.target as HTMLElement).closest('[data-text-editor]')) return
    const hit = [...slide.elements].reverse().find((el) => contains(el, p.x, p.y))
    e.preventDefault()
    if (store.editing && hit?.id !== store.editing) store.startEditing(null)
    if (!hit) {
      if (!e.shiftKey) store.select([])
      setDrag({ kind: 'marquee', start: p, cur: p })
      return
    }
    const wasSelected = store.selected.includes(hit.id)
    if (e.shiftKey) store.toggleSelect(hit.id)
    else if (!wasSelected) store.select([hit.id])
    if (e.detail === 2 && hasText(hit)) {
      store.startEditing(hit.id)
      return
    }
    const orig = new Map(store.selection.map((el) => [el.id, { x: el.x, y: el.y }]))
    setDrag({ kind: 'move', start: p, orig, moved: false, wasSelected, target: hit.id })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current!
      const p = toSlide(e)
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      if (d.kind === 'marquee') {
        setDrag({ ...d, cur: p })
        return
      }
      if (d.kind === 'move') {
        if (!d.moved && Math.hypot(dx, dy) * scale < 3) return
        if (!d.moved) store.beginLive()
        // Snap the selection's edges and centre to the slide's edges and centre.
        const sel = store.selection
        const xs = sel.map((el) => d.orig.get(el.id)!.x)
        const ys = sel.map((el) => d.orig.get(el.id)!.y)
        const x1 = Math.min(...xs) + dx
        const y1 = Math.min(...ys) + dy
        const w = Math.max(...sel.map((el) => d.orig.get(el.id)!.x + el.w)) + dx - x1
        const h = Math.max(...sel.map((el) => d.orig.get(el.id)!.y + el.h)) + dy - y1
        let sx = 0
        let sy = 0
        const v: number[] = []
        const hz: number[] = []
        if (!e.altKey) {
          for (const [edge, target] of [[x1, 0], [x1 + w / 2, SLIDE_W / 2], [x1 + w, SLIDE_W]] as const) {
            if (!v.length && Math.abs(edge - target) < SNAP / scale) { sx = target - edge; v.push(target) }
          }
          for (const [edge, target] of [[y1, 0], [y1 + h / 2, SLIDE_H / 2], [y1 + h, SLIDE_H]] as const) {
            if (!hz.length && Math.abs(edge - target) < SNAP / scale) { sy = target - edge; hz.push(target) }
          }
        }
        setGuides({ v, h: hz })
        store.update(sel.map((el) => el.id), (el) => ({ x: Math.round(d.orig.get(el.id)!.x + dx + sx), y: Math.round(d.orig.get(el.id)!.y + dy + sy) }))
        if (!d.moved) setDrag({ ...d, moved: true })
        return
      }
      // Resize.
      const o = d.orig
      let { x, y, w, h } = o
      const hd = d.handle
      if (hd.includes('e')) w = o.w + dx
      if (hd.includes('s')) h = o.h + dy
      if (hd.includes('w')) { x = o.x + dx; w = o.w - dx }
      if (hd.includes('n')) { y = o.y + dy; h = o.h - dy }
      const keepRatio = (o.kind === 'image') !== e.shiftKey && hd.length === 2
      if (keepRatio) {
        const ratio = o.w / o.h
        if (Math.abs(w / o.w) > Math.abs(h / o.h)) h = w / ratio
        else w = h * ratio
        if (hd.includes('w')) x = o.x + o.w - w
        if (hd.includes('n')) y = o.y + o.h - h
      }
      const minW = 10
      const minH = o.kind === 'shape' && o.shape === 'line' ? 1 : 10
      if (w < minW) { if (hd.includes('w')) x -= minW - w; w = minW }
      if (h < minH) { if (hd.includes('n')) y -= minH - h; h = minH }
      store.update([o.id], { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
    }
    const onUp = () => {
      const d = dragRef.current
      if (d?.kind === 'marquee') {
        const x1 = Math.min(d.start.x, d.cur.x)
        const x2 = Math.max(d.start.x, d.cur.x)
        const y1 = Math.min(d.start.y, d.cur.y)
        const y2 = Math.max(d.start.y, d.cur.y)
        if (x2 - x1 > 2 || y2 - y1 > 2) {
          const ids = slide.elements.filter((el) => el.x < x2 && el.x + el.w > x1 && el.y < y2 && el.y + el.h > y1).map((el) => el.id)
          store.select(ids, true)
        }
      } else if (d?.kind === 'move') {
        if (d.moved) store.endLive()
        else if (d.wasSelected && store.selected.length === 1) {
          // Clicking an already-selected text box puts you into its text.
          const el = store.selection[0]
          if (el && hasText(el)) store.startEditing(el.id)
        }
      } else if (d?.kind === 'resize') store.endLive()
      setGuides({ v: [], h: [] })
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag?.kind, scale, store, slide]) // eslint-disable-line react-hooks/exhaustive-deps

  const editing = slide.elements.find((el) => el.id === store.editing)
  const marquee = drag?.kind === 'marquee' ? drag : null

  return (
    <div
      ref={host}
      tabIndex={0}
      data-slide-stage
      aria-label="Slide editor"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden outline-none"
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onContextMenu={(e) => {
        e.preventDefault()
        const p = toSlide(e)
        const hit = [...slide.elements].reverse().find((el) => contains(el, p.x, p.y))
        if (hit && !store.selected.includes(hit.id)) store.select([hit.id])
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      <div data-stage data-version={version} className="shadow-[0_2px_10px_rgba(0,0,0,0.18)]">
        <SlideView slide={slide} theme={theme} width={width} prompts editingId={store.editing}>
          {/* Selection outlines and handles, drawn in slide coordinates. */}
          {store.selection.map((el) => (
            <div
              key={el.id}
              data-selected={el.id}
              className="pointer-events-none absolute"
              style={{ left: el.x, top: el.y, width: el.w, height: el.h, outline: `${2 / scale}px solid ${accent}`, outlineOffset: 0 }}
            >
              {store.selection.length === 1 && !store.editing &&
                HANDLES.map((hd) => (
                  <div
                    key={hd}
                    data-handle={hd}
                    className="pointer-events-auto absolute rounded-full border bg-white"
                    style={{ ...handlePos(hd, 10 / scale), width: 10 / scale, height: 10 / scale, borderWidth: 1.5 / scale, borderColor: accent, cursor: CURSOR[hd] }}
                  />
                ))}
            </div>
          ))}
          {guides.v.map((x) => <div key={`v${x}`} className="pointer-events-none absolute top-0 h-full" style={{ left: x, width: 1 / scale, background: '#ec4899' }} />)}
          {guides.h.map((y) => <div key={`h${y}`} className="pointer-events-none absolute left-0 w-full" style={{ top: y, height: 1 / scale, background: '#ec4899' }} />)}
          {marquee && (
            <div
              className="pointer-events-none absolute border"
              style={{
                left: Math.min(marquee.start.x, marquee.cur.x), top: Math.min(marquee.start.y, marquee.cur.y),
                width: Math.abs(marquee.cur.x - marquee.start.x), height: Math.abs(marquee.cur.y - marquee.start.y),
                borderColor: accent, borderWidth: 1 / scale, background: 'color-mix(in srgb, var(--accent) 12%, transparent)'
              }}
            />
          )}
          {editing && hasText(editing) && <TextEditor el={editing} store={store} theme={theme} />}
        </SlideView>
      </div>
    </div>
  )
}

function handlePos(h: Handle, size: number): CSSProperties {
  const half = -size / 2
  const mid = `calc(50% - ${size / 2}px)`
  return {
    left: h.includes('w') ? half : h.includes('e') ? undefined : mid,
    right: h.includes('e') ? half : undefined,
    top: h.includes('n') ? half : h.includes('s') ? undefined : mid,
    bottom: h.includes('s') ? half : undefined
  }
}

/** In-place text editing: a textarea styled exactly like the text it replaces. */
function TextEditor({ el, store, theme }: { el: Extract<SlideElement, { text: string }>; store: SlidesStore; theme: Theme }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const placeholder = el.kind === 'text' ? (el as TextElement).placeholder : undefined
  useLayoutEffect(() => {
    const t = ref.current!
    t.focus()
    t.setSelectionRange(t.value.length, t.value.length)
  }, [el.id])

  const css = textCss(el.style, theme, placeholder, el.kind === 'shape' ? '#ffffff' : undefined)
  const valign = el.style.valign ?? (el.kind === 'shape' ? 'middle' : 'top')
  return (
    <div
      data-text-editor
      className="absolute flex flex-col p-[6px]"
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, justifyContent: valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start' }}
    >
      <textarea
        ref={ref}
        aria-label="Slide text"
        value={el.text}
        placeholder={placeholder ? PLACEHOLDER_PROMPT[placeholder] : ''}
        spellCheck
        rows={Math.max(1, el.text.split('\n').length)}
        onChange={(e) => store.setText(el.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            store.startEditing(null)
            store.select([el.id])
            ;(document.querySelector('[data-slide-stage]') as HTMLElement | null)?.focus()
          }
          e.stopPropagation()
        }}
        className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:opacity-45"
        style={{ ...css, paddingLeft: el.style.bullets ? '1.1em' : 0 }}
      />
    </div>
  )
}
