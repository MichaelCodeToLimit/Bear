export const MAX_SIDE = 30000

export type SizeCheck = { ok: true } | { ok: false; reason: 'dimensions' | 'memory'; scale: number }

/** Bytes needed for an image: the layer, the composite and one history copy, all RGBA. */
function estimateBytes(w: number, h: number): number {
  return w * h * 4 * 3
}

function floor3(n: number): number {
  return Math.floor(n * 1000) / 1000
}

export function checkOpenSize(w: number, h: number, budgetBytes: number): SizeCheck {
  const longest = Math.max(w, h)
  if (longest > MAX_SIDE) {
    let scale = floor3(MAX_SIDE / longest)
    // Scaling the sides alone may still not fit in memory.
    scale = Math.min(scale, floor3(Math.sqrt(budgetBytes / estimateBytes(w, h))))
    return { ok: false, reason: 'dimensions', scale }
  }
  if (estimateBytes(w, h) > budgetBytes) {
    return { ok: false, reason: 'memory', scale: floor3(Math.sqrt(budgetBytes / estimateBytes(w, h))) }
  }
  return { ok: true }
}

/** Same rules as `checkOpenSize`, for images that are pasted or dropped into an open document. */
export function prepareIncomingImage(w: number, h: number, budgetBytes: number): SizeCheck {
  return checkOpenSize(w, h, budgetBytes)
}

/** Half of the device memory (8 GB when unknown), in bytes. */
export function memoryBudget(): number {
  const mem = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined
  return ((mem ?? 8) * 2 ** 30) / 2
}
