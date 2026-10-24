import { activeLayer, type Layer } from '../model/doc'
import type { ToolContext } from './types'

export const LOCKED = 'This layer is locked'
export const HIDDEN = 'This layer is hidden'
export const TEXT_LAYER = "Text layers can't be painted. Flatten or merge the layer first."

/**
 * The active layer if its pixels may be edited, else null after telling the user why: locked
 * (checked first), hidden, or a text layer (unless `allowText`). Shared by the painting tools and
 * the adjustment and filter dialogs.
 */
export function editableLayer(ctx: Pick<ToolContext, 'editor' | 'status'>, opts: { allowText?: boolean } = {}): Layer | null {
  const layer = activeLayer(ctx.editor.doc)
  if (layer.locked) ctx.status(LOCKED)
  else if (!layer.visible) ctx.status(HIDDEN)
  else if (layer.kind === 'text' && !opts.allowText) ctx.status(TEXT_LAYER)
  else return layer
  return null
}
