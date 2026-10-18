import type { RGBA } from '../model/bitmap'
import { getLayer, type Layer, type PhotoDoc, type TextData } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import { editableLayer } from './guard'
import type { Tool, ToolContext, ToolPointer } from './types'

export const FONTS = ['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New', 'Segoe UI']
const ALIGNS = ['Left', 'Center', 'Right']
const DOUBLE_CLICK_MS = 400
/** How far apart (CSS px) two clicks of a double-click may be. */
const DOUBLE_CLICK_DIST = 5

/** A text box being edited, before it is committed. */
interface Pending {
  editor: PhotoEditor
  x: number
  y: number
  /** The text layer being edited, or null for a new one. */
  layerId: string | null
  text: string
  color: RGBA
  /** Reads the box's text as shown (set by the app's box, so a commit mid-IME-composition gets the final text). */
  read?: () => string
}

let pending: Pending | null = null
let lastClick: { editor: PhotoEditor; t: number; sx: number; sy: number } | null = null
let session = 0

/** A text layer's automatic name: the first 20 characters of its text, on one line. */
export const textLayerName = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 20)

/** The topmost visible text layer with a painted pixel at document (x, y). */
function textLayerAt(doc: PhotoDoc, x: number, y: number): Layer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]
    if (l.kind !== 'text' || !l.visible || !l.text) continue
    const lx = Math.floor(x) - l.x
    const ly = Math.floor(y) - l.y
    if (lx < 0 || ly < 0 || lx >= l.pixels.width || ly >= l.pixels.height) continue
    if (l.pixels.data[(ly * l.pixels.width + lx) * 4 + 3] > 0) return l
  }
  return null
}

function style(ctx: ToolContext): Omit<TextData, 'text' | 'color'> {
  const align = String(ctx.options.align ?? 'Left').toLowerCase()
  return {
    font: String(ctx.options.font ?? FONTS[0]),
    size: Math.max(1, Number(ctx.options.size) || 48),
    align: align === 'center' || align === 'right' ? align : 'left'
  }
}

function open(ctx: ToolContext, p: Omit<Pending, 'editor'>): void {
  pending = { editor: ctx.editor, ...p }
  ctx.setOverlay({ kind: 'text', x: p.x, y: p.y, text: p.text, color: p.color, session: ++session })
}

/** Reopen an existing text layer's box with its text and style. */
function reopen(ctx: ToolContext, layer: Layer): void {
  const t = layer.text!
  ctx.setOption('font', t.font)
  ctx.setOption('size', t.size)
  ctx.setOption('align', t.align[0].toUpperCase() + t.align.slice(1))
  open(ctx, { x: layer.x, y: layer.y, layerId: layer.id, text: t.text, color: [...t.color] })
}

/** The app's box registers how to read its current text; commit then prefers it over the last input. */
export function attachTextSource(ctx: ToolContext, read: () => string): void {
  if (pending && pending.editor === ctx.editor) pending.read = read
}

/** The box's current text (the box reports every change). */
export function textInput(ctx: ToolContext, text: string): void {
  if (pending && pending.editor === ctx.editor) pending.text = text
}

/**
 * Commit the open box. New text becomes a `kind: 'text'` layer above the active one, named after
 * its text and placed at the click; an edited layer gets its new text and pixels in one "Edit Text"
 * step. Empty text commits nothing.
 */
export function commitText(ctx: ToolContext): void {
  const p = pending
  pending = null
  lastClick = null
  ctx.setOverlay(null)
  if (!p || p.editor !== ctx.editor) return
  const text = (p.read ? p.read() : p.text).replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!text.trim()) return
  const data: TextData = { text, color: p.color, ...style(ctx) }
  const editor = ctx.editor
  if (!p.layerId) {
    editor.addLayer({ name: textLayerName(text), kind: 'text', text: data, pixels: ctx.rasterizeText(data), x: p.x, y: p.y, label: 'Text' })
    return
  }
  const layer = getLayer(editor.doc, p.layerId)
  const old = layer?.text
  if (!layer || !old) return // removed while the box was open (undo)
  if (old.text === data.text && old.font === data.font && old.size === data.size && old.align === data.align) return
  const rename = layer.name === textLayerName(old.text)
  const pixels = ctx.rasterizeText(data)
  editor.editStructure('Edit Text', () => {
    layer.text = data
    layer.pixels = pixels
    if (rename) layer.name = textLayerName(text)
  })
}

function isDoubleClick(ctx: ToolContext, p: ToolPointer): boolean {
  const now = Date.now()
  const prev = lastClick
  lastClick = { editor: ctx.editor, t: now, sx: p.sx, sy: p.sy }
  if (!prev || prev.editor !== ctx.editor || now - prev.t > DOUBLE_CLICK_MS) return false
  if (Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > DOUBLE_CLICK_DIST * ctx.dpr) return false
  lastClick = null
  return true
}

/**
 * Click to place a text box (a contentEditable overlay drawn by the app). Clicking elsewhere or
 * Ctrl+Enter commits, Escape cancels; clicking elsewhere with an empty box moves it there. Double-clicking a text layer's pixels reopens it. Font, size
 * and alignment come from the options; the colour is the foreground (an edited layer keeps its own).
 */
export const text: Tool = {
  id: 'text',
  label: 'Text',
  key: 'T',
  cursor: 'text',
  options: [
    { id: 'font', label: 'Font', type: 'select', choices: FONTS, default: FONTS[0] },
    { id: 'size', label: 'Size', type: 'range', min: 6, max: 500, step: 1, default: 48 },
    { id: 'align', label: 'Align', type: 'select', choices: ALIGNS, default: 'Left' }
  ],
  down(ctx, p) {
    const mine = pending && pending.editor === ctx.editor ? pending : null
    const fresh = mine && !mine.layerId && mine.text === ''
    if (isDoubleClick(ctx, p)) {
      const hit = textLayerAt(ctx.editor.doc, p.x, p.y)
      if (hit) {
        if (ctx.editor.doc.activeLayerId !== hit.id) {
          ctx.editor.doc.activeLayerId = hit.id
          ctx.refresh()
        }
        if (!editableLayer(ctx, { allowText: true })) return
        if (fresh) pending = null // the empty box the first click opened
        else if (mine) commitText(ctx)
        return reopen(ctx, hit)
      }
      if (fresh) return // keep the box the first click opened
    }
    if (mine && !fresh) {
      // Clicking elsewhere commits; it doesn't start another box.
      const t = lastClick
      commitText(ctx)
      lastClick = t
      return
    }
    // A new box; an empty one just moves here.
    open(ctx, { x: Math.round(p.x), y: Math.round(p.y), layerId: null, text: '', color: [...ctx.colors.fg] })
  },
  move() {},
  up() {},
  onKey(ctx, e) {
    if (!pending) return false
    if (e.key === 'Escape') {
      text.cancel!(ctx)
      return true
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      commitText(ctx)
      return true
    }
    return false
  },
  /** Tool switch, undo/redo/History and save keep the text. */
  commit(ctx) {
    if (pending) commitText(ctx)
  },
  cancel(ctx) {
    pending = null
    lastClick = null
    ctx.setOverlay(null)
  }
}
