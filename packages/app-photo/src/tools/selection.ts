import { combineMask, type Mask, type SelectMode } from '../model/mask'
import type { ToolContext, ToolPointer } from './types'

/** Spec §2: Shift adds, Alt subtracts, Shift+Alt intersects. */
export function selectMode(p: Pick<ToolPointer, 'shift' | 'alt'>): SelectMode {
  if (p.shift && p.alt) return 'intersect'
  if (p.shift) return 'add'
  if (p.alt) return 'subtract'
  return 'replace'
}

/**
 * Combine `next` with the current selection and record it. An empty result means "whole image"
 * for editing, so it deselects; after a subtract or intersect the user is told, since they
 * probably expected something to stay selected.
 */
export function applySelection(ctx: ToolContext, next: Mask, mode: SelectMode): void {
  const current = ctx.editor.doc.selection
  const out = combineMask(current, next, mode)
  if (out) return ctx.editor.setSelection(out)
  if (current) ctx.editor.setSelection(null)
  if (mode === 'subtract' || mode === 'intersect') ctx.status('Nothing selected')
}

/** A plain click (no drag) with a selection tool: deselect in replace mode, otherwise do nothing. */
export function clickDeselect(ctx: ToolContext, mode: SelectMode): void {
  if (mode === 'replace' && ctx.editor.doc.selection) ctx.editor.setSelection(null)
}
