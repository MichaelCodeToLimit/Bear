import { createBitmap, type Bitmap, type Rect, type RGBA } from './bitmap'
import type { Mask } from './mask'

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface TextData {
  text: string
  font: string
  size: number
  color: RGBA
  align: 'left' | 'center' | 'right'
}

export interface Layer {
  id: string
  name: string
  kind: 'raster' | 'text'
  visible: boolean
  locked: boolean
  /** 0..1 */
  opacity: number
  blend: BlendMode
  /** Offset of the layer's pixels within the document. */
  x: number
  y: number
  pixels: Bitmap
  text?: TextData
}

export interface PhotoDoc {
  width: number
  height: number
  /** Bottom to top. */
  layers: Layer[]
  activeLayerId: string
  /** null = nothing selected (whole image). */
  selection: Mask | null
  foreground: RGBA
  background: RGBA
}

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

export function createLayer(name: string, pixels: Bitmap, extra: Partial<Layer> = {}): Layer {
  return {
    id: newId(),
    name,
    kind: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    x: 0,
    y: 0,
    pixels,
    ...extra
  }
}

export function createDoc(width: number, height: number, background: RGBA | 'transparent'): PhotoDoc {
  const layer = createLayer('Background', createBitmap(width, height, background === 'transparent' ? undefined : background))
  return {
    width,
    height,
    layers: [layer],
    activeLayerId: layer.id,
    selection: null,
    foreground: [0, 0, 0, 255],
    background: [255, 255, 255, 255]
  }
}

export function getLayer(doc: PhotoDoc, id: string): Layer | undefined {
  return doc.layers.find((l) => l.id === id)
}

export function activeLayer(doc: PhotoDoc): Layer {
  const l = getLayer(doc, doc.activeLayerId)
  if (!l) throw new Error('No active layer')
  return l
}

/** The layer's pixel rectangle in document coordinates. */
export function layerBounds(layer: Layer): Rect {
  return { x: layer.x, y: layer.y, width: layer.pixels.width, height: layer.pixels.height }
}
