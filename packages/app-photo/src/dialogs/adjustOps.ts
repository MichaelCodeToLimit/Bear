import { intersectRect, type Bitmap, type Rect } from '../model/bitmap'
import type { Layer, PhotoDoc } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import { maskBounds, type Mask } from '../model/mask'
import { applyLut, blackAndWhite, brightnessContrast, curvesLut, hueSaturation, invert, levelsLut } from '../ops/adjust'
import type { Preview } from '../render/compositor'

/** Adjustments with a dialog. Invert and Black & White apply at once. */
export type AdjustKind = 'brightness' | 'levels' | 'curves' | 'hsl'
export type InstantAdjust = 'invert' | 'bw'

export interface AdjustParams {
  brightness: { brightness: number; contrast: number }
  levels: { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
  curves: { points: [number, number][] }
  hsl: { hue: number; saturation: number; lightness: number }
}

export type AnyAdjustParams = AdjustParams[AdjustKind]

/** Dialog titles, also the history labels. */
export const ADJUST_TITLES: Record<AdjustKind | InstantAdjust, string> = {
  brightness: 'Brightness/Contrast',
  levels: 'Levels',
  curves: 'Curves',
  hsl: 'Hue/Saturation',
  invert: 'Invert',
  bw: 'Black & White'
}

export function adjustDefaults<K extends AdjustKind>(kind: K): AdjustParams[K] {
  const d: AdjustParams = {
    brightness: { brightness: 0, contrast: 0 },
    levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    curves: {
      points: [
        [0, 0],
        [255, 255]
      ]
    },
    hsl: { hue: 0, saturation: 0, lightness: 0 }
  }
  return d[kind]
}

/**
 * The GL preview for these settings. The compositor notices changes by identity, so every call
 * returns a new object (and, for curves and levels, a new lookup table).
 */
export function adjustPreview(kind: AdjustKind, params: AnyAdjustParams, layerId: string, mask: Mask | null): Preview {
  switch (kind) {
    case 'brightness':
      return { layerId, mask, kind: 'bc', ...(params as AdjustParams['brightness']) }
    case 'levels':
      return { layerId, mask, kind: 'lut', lut: levelsLut(params as AdjustParams['levels']) }
    case 'curves':
      return { layerId, mask, kind: 'lut', lut: curvesLut((params as AdjustParams['curves']).points) }
    case 'hsl':
      return { layerId, mask, kind: 'hsl', ...(params as AdjustParams['hsl']) }
  }
}

/** Run the CPU version of an adjustment on `b` in place (the same maths as the preview). */
export function applyAdjust(kind: AdjustKind | InstantAdjust, b: Bitmap, params: AnyAdjustParams | null, mask: Mask | null, offset: { x: number; y: number }): void {
  switch (kind) {
    case 'brightness':
      return brightnessContrast(b, params as AdjustParams['brightness'], mask, offset)
    case 'levels':
      return applyLut(b, levelsLut(params as AdjustParams['levels']), mask, offset)
    case 'curves':
      return applyLut(b, curvesLut((params as AdjustParams['curves']).points), mask, offset)
    case 'hsl':
      return hueSaturation(b, params as AdjustParams['hsl'], mask, offset)
    case 'invert':
      return invert(b, mask, offset)
    case 'bw':
      return blackAndWhite(b, mask, offset)
  }
}

/** The part of `layer` (layer-local) an adjustment or filter can change: the selection's bounds, or the whole layer. */
export function editArea(doc: PhotoDoc, layer: Layer): Rect | null {
  const whole = { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height }
  if (!doc.selection) return whole.width && whole.height ? whole : null
  const b = maskBounds(doc.selection)
  return b && intersectRect({ ...b, x: b.x - layer.x, y: b.y - layer.y }, whole)
}

/** Apply an adjustment to `layer` as one history step labelled with its title. False when nothing is in range. */
export function commitAdjust(editor: PhotoEditor, layer: Layer, kind: AdjustKind | InstantAdjust, params: AnyAdjustParams | null): boolean {
  const area = editArea(editor.doc, layer)
  if (!area) return false
  const mask = editor.doc.selection
  editor.editPixels(ADJUST_TITLES[kind], layer.id, area, (px) => applyAdjust(kind, px, params, mask, { x: layer.x, y: layer.y }))
  return true
}
