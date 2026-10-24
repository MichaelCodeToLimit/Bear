import type { Bitmap, Rect, RGBA } from '../model/bitmap'
import type { TextData } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import type { ViewState } from '../render/view'

export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'eraser' | 'fill' | 'gradient' | 'eyedropper' | 'text' | 'shape' | 'hand' | 'zoom'

/** One pointer sample. `x/y` are document coordinates (float); `sx/sy` are canvas (device) pixels. */
export interface ToolPointer {
  x: number
  y: number
  sx: number
  sy: number
  shift: boolean
  alt: boolean
  /** Ctrl, or Cmd on macOS. */
  ctrl: boolean
  /** Pen pressure 0..1; null for a mouse or touch, which report no real pressure. */
  pressure: number | null
}

export interface ToolColors {
  fg: RGBA
  bg: RGBA
}

/**
 * Something a tool draws over the canvas while it works, in document coordinates.
 * `move` shifts the existing selection outline while the Move tool drags it.
 */
export type Overlay =
  | { kind: 'marquee'; rect: Rect; ellipse: boolean }
  | { kind: 'path'; points: [number, number][] }
  | { kind: 'crop'; rect: Rect }
  | { kind: 'move'; dx: number; dy: number }
  /** The brush outline under the pointer; `size` is the diameter in document px. */
  | { kind: 'brush'; x: number; y: number; size: number }
  /** An open text box: its top-left in the document and the text it starts with. `session` changes for each new box. */
  | { kind: 'text'; x: number; y: number; text: string; color: RGBA; session: number }

export interface ToolContext {
  editor: PhotoEditor
  /** The active tool's option values, keyed by `OptionSpec.id`. */
  options: Record<string, unknown>
  /** Change one of the active tool's options (`[`/`]` brush size, a reopened text layer's font). */
  setOption(id: string, value: unknown): void
  colors: ToolColors
  setColors(c: ToolColors): void
  view: ViewState
  setView(v: ViewState): void
  /** Device pixels per CSS pixel: scale screen-space hit zones (sx/sy are device pixels) by it. */
  dpr: number
  setOverlay(o: Overlay | null): void
  /** A short message in the status bar. */
  status(msg: string): void
  /** Redraw after changing the document outside history (live previews). `dirty` is in document coordinates. */
  refresh(dirty?: Rect | null): void
  rasterizeText(t: TextData): Bitmap
}

export type OptionSpec = { id: string; label: string } & (
  | { type: 'range'; min: number; max: number; step: number; default: number }
  | { type: 'select'; choices: string[]; default: string }
  | { type: 'toggle'; default: boolean }
)

/** The keyboard fields a tool looks at; a DOM KeyboardEvent satisfies it. */
export type ToolKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>

export interface Tool {
  id: ToolId
  label: string
  /** The shortcut letter as shown in tooltips. */
  key: string
  /** A CSS cursor value. */
  cursor: string
  options: OptionSpec[]
  down(ctx: ToolContext, p: ToolPointer): void
  /** Called for every pointer move over the canvas, pressed or not. */
  move(ctx: ToolContext, p: ToolPointer): void
  up(ctx: ToolContext, p: ToolPointer): void
  /** A key while this tool is active. Return true when handled (the caller then prevents the default). */
  onKey?(ctx: ToolContext, e: ToolKeyEvent): boolean
  /** Drop any work in progress (document replaced, gesture abandoned). Must undo live previews. */
  cancel?(ctx: ToolContext): void
  /**
   * Keep pending work that isn't a drag (an open text box). Called before a real tool switch
   * (instead of `cancel`), before undo/redo/History, and before saving. Tools without it are
   * cancelled on a switch.
   */
  commit?(ctx: ToolContext): void
}
