import { brush } from './brush'
import { crop } from './crop'
import { eraser } from './eraser'
import { eyedropper } from './eyedropper'
import { fill } from './fill'
import { gradient } from './gradient'
import { hand } from './hand'
import { lasso } from './lasso'
import { marquee } from './marquee'
import { move } from './move'
import { shape } from './shape'
import { text } from './text'
import { wand } from './wand'
import { zoom } from './zoom'
import type { Tool, ToolId } from './types'

/** Toolbox order (spec §3). */
export const TOOLS: Tool[] = [
  move,
  marquee,
  lasso,
  wand,
  crop,
  brush,
  eraser,
  fill,
  gradient,
  eyedropper,
  text,
  shape,
  hand,
  zoom
]

export function toolById(id: ToolId): Tool {
  return TOOLS.find((t) => t.id === id)!
}

/** Each option's default value, keyed by option id. */
export function defaultOptions(tool: Tool): Record<string, unknown> {
  return Object.fromEntries(tool.options.map((o) => [o.id, o.default]))
}

/**
 * The tool for a shortcut letter (case-insensitive), or null. G picks Fill, or stays on Gradient
 * when that is current; Shift+G switches between them.
 */
export function toolForKey(key: string, opts: { shift?: boolean; current?: ToolId } = {}): ToolId | null {
  const k = key.toLowerCase()
  if (k === 'g') {
    if (opts.shift) return opts.current === 'fill' ? 'gradient' : 'fill'
    return opts.current === 'gradient' ? 'gradient' : 'fill'
  }
  return TOOLS.find((t) => t.key.toLowerCase() === k)?.id ?? null
}

export interface SpaceHold {
  tool: ToolId
  /** The tool to go back to when Space is released, while it is held. */
  held: ToolId | null
}

/** Holding Space switches to Hand; releasing it goes back. Key repeats while held change nothing. */
export function holdSpace(s: SpaceHold, event: 'down' | 'up'): SpaceHold {
  if (event === 'down') return s.held ? s : { tool: 'hand', held: s.tool }
  return s.held ? { tool: s.held, held: null } : s
}
