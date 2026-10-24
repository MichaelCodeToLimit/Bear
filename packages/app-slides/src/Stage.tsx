import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Lock } from 'lucide-react'
import { PLACEHOLDER_PROMPT, SLIDE_H, SLIDE_W, hasText, type Box, type SlideElement, type TableElement, type TextElement } from './model'
import type { SlidesStore } from './store'
import { SlideView, textCss } from './SlideView'
import { buildSteps } from './animation'
import type { Theme } from './themes'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const SNAP = 6

type Drag =
  | { kind: 'move'; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean; wasSelected: boolean; target: string }
  | { kind: 'resize'; handle: Handle; start: { x: number; y: number }; orig: SlideElement }
  | { kind: 'groupResize'; handle: Handle; start: { x: number; y: number }; box: Box; originals: Map<string, Box> }
  | { kind: 'rotate'; center: { x: number; y: number }; ids: string[] }
  | { kind: 'marquee'; start: { x: number; y: number }; cur: { x: number; y: number } }

interface StageProps {
  store: SlidesStore
  version: number
  theme: Theme
  accent: string
  onKeyDown: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  onContextMenu: (x: number, y: number) => void
  /** Show numbered animation badges (Animations tab / animation pane). */
  animBadges?: boolean
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** A point in an element's own (unrotated) frame, relative to its centre. */
function toLocal(el: Box & { rotation?: number }, x: number, y: number) {
  const cx = el.x + el.w / 2
  const cy = el.y + el.h / 2
  const a = -rad(el.rotation ?? 0)
  const dx = x - cx
  const dy = y - cy
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }
}

/** Hit area: lines are thin, so give them some slack; rotation is taken into account. */
function contains(el: SlideElement, x: number, y: number) {
  if (el.hidden) return false
  const pad = el.kind === 'shape' && el.shape === 'line' ? 8 : 0
  const p = toLocal(el, x, y)
  return Math.abs(p.x) <= el.w / 2 + pad && Math.abs(p.y) <= el.h / 2 + pad
}

/** The selection forms one block (a single group) that resizes together. */
function asBlock(sel: SlideElement[]) {
  return sel.length > 1 && sel.every((e) => e.groupId && e.groupId === sel[0].groupId)
}

export function Stage({ store, version, theme, accent, onKeyDown, onPaste, onContextMenu, animBadges }: StageProps) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const slide = store.slide
  const scale = width / SLIDE_W
  const layoutMode = !!store.masterTarget && store.masterTarget !== 'master'

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
    const target = e.target as HTMLElement
    const sel = store.selection
    if (target.getAttribute('data-rotate') && sel.length) {
      e.preventDefault()
      const b = sel.length === 1 ? sel[0] : store.boundsOf(sel)
      store.beginLive()
      setDrag({ kind: 'rotate', center: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, ids: sel.filter((s) => !s.locked).map((s) => s.id) })
      return
    }
    const handle = target.getAttribute('data-handle') as Handle | null
    if (handle && sel.length === 1 && !sel[0].locked) {
      e.preventDefault()
      store.beginLive()
      setDrag({ kind: 'resize', handle, start: p, orig: sel[0] })
      return
    }
    if (handle && asBlock(sel) && !sel.some((s) => s.locked)) {
      e.preventDefault()
      store.beginLive()
      setDrag({ kind: 'groupResize', handle, start: p, box: store.boundsOf(sel), originals: new Map(sel.map((s) => [s.id, { x: s.x, y: s.y, w: s.w, h: s.h }])) })
      return
    }
    if (target.closest('[data-text-editor]')) return
    const hit = [...slide.elements].reverse().find((el) => contains(el, p.x, p.y))
    e.preventDefault()
    // Format painter: the click paints instead of selecting.
    if (store.painter) {
      if (hit) store.applyFormat(store.withGroupIds([hit.id]))
      else store.cancelPainter()
      return
    }
    if (store.editing && hit?.id !== store.editing) store.startEditing(null)
    if (!hit) {
      if (!e.shiftKey) store.select([])
      setDrag({ kind: 'marquee', start: p, cur: p })
      return
    }
    const wasSelected = store.selected.includes(hit.id)
    if (e.shiftKey) store.toggleSelect(hit.id)
    else if (!wasSelected) store.select([hit.id])
    if (e.detail === 2 && (hasText(hit) || hit.kind === 'table') && !layoutMode) {
      store.startEditing(hit.id)
      return
    }
    const orig = new Map(store.selection.filter((el) => !el.locked).map((el) => [el.id, { x: el.x, y: el.y }]))
    setDrag({ kind: 'move', start: p, orig, moved: false, wasSelected, target: hit.id })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current!
      const p = toSlide(e)
      if (d.kind === 'marquee') {
        setDrag({ ...d, cur: p })
        return
      }
      if (d.kind === 'rotate') {
        let deg = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI + 90
        if (e.shiftKey) deg = Math.round(deg / 15) * 15
        store.setRotation(d.ids, deg)
        return
      }
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      if (d.kind === 'move') {
        if (!d.orig.size) return
        if (!d.moved && Math.hypot(dx, dy) * scale < 3) return
        if (!d.moved) store.beginLive()
        // Snap the selection's edges and centre to the slide's edges and centre.
        const sel = store.selection.filter((el) => d.orig.has(el.id))
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
      if (d.kind === 'groupResize') {
        const b = d.box
        let { x, y, w, h } = b
        if (d.handle.includes('e')) w = b.w + dx
        if (d.handle.includes('s')) h = b.h + dy
        if (d.handle.includes('w')) { x = b.x + dx; w = b.w - dx }
        if (d.handle.includes('n')) { y = b.y + dy; h = b.h - dy }
        if (e.shiftKey && d.handle.length === 2) {
          const r = b.w / b.h
          if (w / b.w > h / b.h) h = w / r
          else w = h * r
          if (d.handle.includes('w')) x = b.x + b.w - w
          if (d.handle.includes('n')) y = b.y + b.h - h
        }
        store.resizeTogether([...d.originals.keys()], b, { x, y, w: Math.max(10, w), h: Math.max(10, h) }, d.originals)
        return
      }
      // Resize one element, in its own (possibly rotated) frame.
      const o = d.orig
      const a = rad(o.rotation ?? 0)
      const ldx = dx * Math.cos(a) + dy * Math.sin(a)
      const ldy = -dx * Math.sin(a) + dy * Math.cos(a)
      let L = -o.w / 2
      let R = o.w / 2
      let T = -o.h / 2
      let B = o.h / 2
      const hd = d.handle
      if (hd.includes('e')) R += ldx
      if (hd.includes('w')) L += ldx
      if (hd.includes('s')) B += ldy
      if (hd.includes('n')) T += ldy
      const keepRatio = (o.kind === 'image' || o.kind === 'media') !== e.shiftKey && hd.length === 2
      if (keepRatio) {
        const ratio = o.w / o.h
        const w = R - L
        const h = B - T
        if (Math.abs(w / o.w) > Math.abs(h / o.h)) {
          const nh = w / ratio
          if (hd.includes('n')) T = B - nh
          else B = T + nh
        } else {
          const nw = h * ratio
          if (hd.includes('w')) L = R - nw
          else R = L + nw
        }
      }
      const minW = 10
      const minH = o.kind === 'shape' && o.shape === 'line' ? 1 : 10
      if (R - L < minW) { if (hd.includes('w')) L = R - minW; else R = L + minW }
      if (B - T < minH) { if (hd.includes('n')) T = B - minH; else B = T + minH }
      const w = R - L
      const h = B - T
      // The new centre, back in slide coordinates.
      const lcx = (L + R) / 2
      const lcy = (T + B) / 2
      const cx = o.x + o.w / 2 + lcx * Math.cos(a) - lcy * Math.sin(a)
      const cy = o.y + o.h / 2 + lcx * Math.sin(a) + lcy * Math.cos(a)
      store.update([o.id], { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) })
    }
    const onUp = () => {
      const d = dragRef.current
      if (d?.kind === 'marquee') {
        const x1 = Math.min(d.start.x, d.cur.x)
        const x2 = Math.max(d.start.x, d.cur.x)
        const y1 = Math.min(d.start.y, d.cur.y)
        const y2 = Math.max(d.start.y, d.cur.y)
        if (x2 - x1 > 2 || y2 - y1 > 2) {
          const ids = slide.elements.filter((el) => !el.hidden && el.x < x2 && el.x + el.w > x1 && el.y < y2 && el.y + el.h > y1).map((el) => el.id)
          store.select(ids, true)
        }
      } else if (d?.kind === 'move') {
        if (d.moved) store.endLive()
        else if (d.wasSelected && store.selected.length === 1 && !layoutMode) {
          // Clicking an already-selected text box puts you into its text.
          const el = store.selection[0]
          if (el && (hasText(el) || el.kind === 'table')) store.startEditing(el.id)
        }
      } else if (d) store.endLive()
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
  const sel = store.selection
  const block = asBlock(sel) ? store.boundsOf(sel) : null
  const single = sel.length === 1 ? sel[0] : null

  // Animation order numbers, as on the Animations tab.
  const badges = new Map<string, number[]>()
  if (animBadges && !store.masterTarget) {
    buildSteps(slide.animations).forEach((step, i) => step.forEach((t) => badges.set(t.anim.elementId, [...(badges.get(t.anim.elementId) ?? []), i])))
  }

  const handles = (locked: boolean, rotatable: boolean) => (
    <>
      {!locked && rotatable && (
        <>
          <div className="pointer-events-none absolute left-1/2" style={{ top: -26 / scale, height: 26 / scale, width: 1 / scale, background: accent }} />
          <div
            data-rotate="1"
            title="Rotate (Shift: 15° steps)"
            className="pointer-events-auto absolute left-1/2 rounded-full border bg-white"
            style={{ top: -34 / scale, width: 14 / scale, height: 14 / scale, marginLeft: -7 / scale, borderWidth: 1.5 / scale, borderColor: accent, cursor: 'grab' }}
          />
        </>
      )}
      {!locked && HANDLES.map((hd) => (
        <div
          key={hd}
          data-handle={hd}
          className="pointer-events-auto absolute rounded-full border bg-white"
          style={{ ...handlePos(hd, 10 / scale), width: 10 / scale, height: 10 / scale, borderWidth: 1.5 / scale, borderColor: accent, cursor: CURSOR[hd] }}
        />
      ))}
      {locked && <Lock className="pointer-events-none absolute" style={{ right: -22 / scale, top: -2 / scale, width: 16 / scale, height: 16 / scale, color: accent }} />}
    </>
  )

  return (
    <div
      ref={host}
      tabIndex={0}
      data-slide-stage
      aria-label="Slide editor"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden outline-none"
      style={{ cursor: store.painter ? 'copy' : undefined }}
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
        <SlideView
          slide={slide}
          theme={theme}
          width={width}
          prompts
          editingId={store.editing}
          deck={store.masterTarget ? undefined : { pres: store.pres, index: store.current }}
        >
          {/* The master's elements show faintly behind a layout being edited. */}
          {layoutMode && store.pres.master?.elements.map((el) => (
            <div key={el.id} className="pointer-events-none absolute border border-dashed opacity-30" style={{ left: el.x, top: el.y, width: el.w, height: el.h, borderColor: accent }} />
          ))}
          {/* Selection outlines and handles, drawn in slide coordinates. */}
          {sel.map((el) => (
            <div
              key={el.id}
              data-selected={el.id}
              className="pointer-events-none absolute"
              style={{
                left: el.x, top: el.y, width: el.w, height: el.h,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                outline: `${(block ? 1 : 2) / scale}px ${block ? 'dashed' : 'solid'} ${accent}`, outlineOffset: 0
              }}
            >
              {single && !store.editing && handles(!!el.locked, !layoutMode)}
            </div>
          ))}
          {block && !store.editing && (
            <div data-group-box className="pointer-events-none absolute" style={{ left: block.x, top: block.y, width: block.w, height: block.h, outline: `${2 / scale}px solid ${accent}` }}>
              {handles(sel.some((s) => s.locked), true)}
            </div>
          )}
          {[...badges].map(([id, steps]) => {
            const el = slide.elements.find((x) => x.id === id)
            if (!el) return null
            return (
              <div key={`b${id}`} data-anim-badge={id} className="pointer-events-none absolute flex gap-[2px]" style={{ left: el.x - 4 / scale, top: el.y - 4 / scale, transform: `translate(-100%, 0)` }}>
                {steps.map((n, i) => (
                  <span key={i} className="flex items-center justify-center rounded-sm font-semibold text-white" style={{ background: accent, fontSize: 11 / scale, minWidth: 16 / scale, height: 16 / scale, padding: `0 ${3 / scale}px` }}>{n}</span>
                ))}
              </div>
            )
          })}
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
          {editing && editing.kind === 'table' && <TableEditor el={editing} store={store} theme={theme} />}
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

const leaveEditing = (store: SlidesStore, id: string) => {
  store.startEditing(null)
  store.select([id])
  ;(document.querySelector('[data-slide-stage]') as HTMLElement | null)?.focus()
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
      style={{
        left: el.x, top: el.y, width: el.w, height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        justifyContent: valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start'
      }}
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
            leaveEditing(store, el.id)
          }
          e.stopPropagation()
        }}
        className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:opacity-45"
        style={{ ...css, paddingLeft: el.style.bullets || el.style.numbered ? '1.4em' : 0 }}
      />
    </div>
  )
}

/** Editing a table: every cell becomes a text field; Tab and Shift+Tab move between them. */
function TableEditor({ el, store, theme }: { el: TableElement; store: SlidesStore; theme: Theme }) {
  const ref = useRef<HTMLTableElement>(null)
  const css = textCss(el.style, theme)
  useLayoutEffect(() => {
    ;(ref.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus()
  }, [el.id])
  const cols = el.rows[0]?.length ?? 1
  return (
    <div data-text-editor className="absolute" style={{ left: el.x, top: el.y, width: el.w, height: el.h }}>
      <table ref={ref} className="h-full w-full table-fixed border-collapse bg-white/90" style={css}>
        <tbody>
          {el.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-dashed border-slate-400 p-0">
                  <textarea
                    aria-label={`Cell ${r + 1}, ${c + 1}`}
                    data-cell-editor={`${r}:${c}`}
                    value={cell}
                    onFocus={() => { store.tableCell = [r, c] }}
                    onChange={(e) => store.setCell(el.id, r, c, e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        leaveEditing(store, el.id)
                      }
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        const i = r * cols + c + (e.shiftKey ? -1 : 1)
                        if (i >= el.rows.length * cols && !e.shiftKey) {
                          // Tab in the last cell adds a row, as in other apps.
                          store.insertRow(el.id, el.rows.length)
                          setTimeout(() => (ref.current?.querySelector(`[data-cell-editor="${r + 1}:0"]`) as HTMLTextAreaElement | null)?.focus())
                          return
                        }
                        const ni = Math.max(0, i)
                        ;(ref.current?.querySelector(`[data-cell-editor="${Math.floor(ni / cols)}:${ni % cols}"]`) as HTMLTextAreaElement | null)?.focus()
                      }
                    }}
                    className="h-full w-full resize-none border-0 bg-transparent px-[8px] py-[4px] outline-none"
                    style={{ font: 'inherit', color: css.color }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
