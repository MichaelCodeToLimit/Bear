import { checkOpenSize, estimateBytes, prepareIncomingImage, type SizeCheck } from './limits'

/**
 * How a file is opened, decided from its format, the size its header gives (no pixels decoded) and the
 * memory budget. Pure, so the choices are unit-tested; file-io.ts and useIncomingImages carry them out.
 */

export const DAMAGED_SIZE = "This image's size information looks damaged, so it can't be opened."
export const PSD_TOO_LARGE = 'This .psd is too large to open here. Try a smaller copy.'

/** No real image has a side this long; a header that says so is damaged. */
export const MAX_PLAUSIBLE_SIDE = 1_000_000
/** Below this the "Open at N%" prompt would say 0%: the size can't be right. */
export const MIN_SCALE = 0.001

/** checkOpenSize, plus `damaged` for sizes no real image has. */
export type OpenCheck = SizeCheck | { ok: false; reason: 'damaged' }

export interface Size {
  width: number
  height: number
}

/**
 * - `fast-png`: PNG at full size in plain JS, exact bytes.
 * - `browser`: the browser's decoder at full size.
 * - `browser-scaled`: the browser's decoder, scaling as it decodes (the full-size pixels never reach Photo).
 * - `browser-then-scale`: the size isn't known before decoding, so decode in full, then scale.
 */
export type FlatDecodePath = 'fast-png' | 'browser' | 'browser-scaled' | 'browser-then-scale'

export type OpenPlan =
  | { kind: 'refuse'; message: string }
  | { kind: 'ask'; scale: number; reason: 'dimensions' | 'memory' }
  | { kind: 'decode'; path: FlatDecodePath | 'psd' | 'bearphoto'; scale: number }

function withDamage(w: number, h: number, budget: number, rules: (w: number, h: number, budget: number) => SizeCheck): OpenCheck {
  if (!(w > 0 && h > 0) || Math.max(w, h) > MAX_PLAUSIBLE_SIDE) return { ok: false, reason: 'damaged' }
  const check = rules(w, h, budget)
  return !check.ok && check.scale < MIN_SCALE ? { ok: false, reason: 'damaged' } : check
}

export function checkImageSize(w: number, h: number, budget: number): OpenCheck {
  return withDamage(w, h, budget, checkOpenSize)
}

/** A flat image (PNG, JPG, WebP, GIF, BMP, AVIF) at `scale`; `header` is whether its header gave the size. */
export function flatDecodePath(ext: string, scale: number, header: boolean): FlatDecodePath {
  if (scale >= 1) return ext === 'png' ? 'fast-png' : 'browser'
  return header ? 'browser-scaled' : 'browser-then-scale'
}

/**
 * What to do with a file: `scale` is undefined on the first try and the scale the user agreed to after an
 * `ask`. `header` is the size from the file's header, or null when it couldn't be read (always for .bearphoto).
 */
export function planOpen(ext: string, header: Size | null, budget: number, scale?: number): OpenPlan {
  if (ext === 'bearphoto') return { kind: 'decode', path: 'bearphoto', scale: scale ?? 1 }
  if (header) {
    const check = checkImageSize(header.width, header.height, budget)
    if (!check.ok && check.reason === 'damaged') return { kind: 'refuse', message: DAMAGED_SIZE }
    // ag-psd can only read a file at full size, and a partial read would be worse than saying no.
    if (ext === 'psd' && estimateBytes(header.width, header.height) > budget) return { kind: 'refuse', message: PSD_TOO_LARGE }
    if (scale === undefined && !check.ok) return { kind: 'ask', scale: check.scale, reason: check.reason }
  }
  const s = scale ?? 1
  if (ext === 'psd') return { kind: 'decode', path: 'psd', scale: s }
  return { kind: 'decode', path: flatDecodePath(ext, s, !!header), scale: s }
}

/**
 * The check again once pixels are decoded: a header can understate the size (an AVIF grid whose first
 * size box is one tile), so what was actually decoded must still fit before it becomes a layer.
 */
export function checkDecodedImage(decoded: Size, budget: number): OpenCheck {
  return withDamage(decoded.width, decoded.height, budget, prepareIncomingImage)
}
