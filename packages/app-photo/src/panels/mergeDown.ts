import type { Layer } from '../model/doc'
import { HIDDEN } from '../tools/guard'

export const BELOW_LOCKED = 'The layer below is locked'

/**
 * Why Merge Down can't run for `upper` onto `lower`, or null when it can. A hidden layer would merge
 * nothing visible yet disappear, and a locked layer's pixels must not change (the same rules, and
 * texts, as the painting tools' editableLayer check).
 */
export function mergeDownBlocked(upper: Layer, lower: Layer): string | null {
  if (!upper.visible) return HIDDEN
  if (lower.locked) return BELOW_LOCKED
  return null
}
