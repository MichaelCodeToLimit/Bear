import { initializeCanvas, readPsd as agReadPsd, writePsd as agWritePsd, type Layer as PsdLayer, type Psd } from 'ag-psd'
import { createBitmap } from '../model/bitmap'
import { createLayer, type BlendMode, type Layer, type PhotoDoc } from '../model/doc'
import { BLEND_MODES } from '../ops/blend'
import { compositeLayers } from '../ops/composite'

// ag-psd allocates layer pixels through a canvas unless told otherwise. Plain typed arrays are enough
// (we always read with `useImageData`), so this works in Node and the browser alike without a canvas.
initializeCanvas(
  () => {
    throw new Error('Canvas is not used for PSD files')
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData
)

type PsdBlend = NonNullable<PsdLayer['blendMode']>

function fromPsdBlend(mode: PsdLayer['blendMode']): BlendMode {
  if (!mode) return 'normal'
  const ours = mode.replace(' ', '-') as BlendMode
  return BLEND_MODES.includes(ours) ? ours : 'normal'
}

function toPsdBlend(mode: BlendMode): PsdBlend {
  return mode.replace('-', ' ') as PsdBlend
}

export function readPsd(bytes: Uint8Array): { doc: PhotoDoc; warnings: string[] } {
  const psd = agReadPsd(bytes, { useImageData: true, skipThumbnail: true })
  const found = { smart: false, effects: false, adjustment: false, mask: false, group: false }
  const layers: Layer[] = []

  const visit = (list: PsdLayer[], parentVisible: boolean): void => {
    for (const l of list) {
      const visible = parentVisible && !l.hidden
      if (l.mask) found.mask = true
      if (l.placedLayer) found.smart = true
      if (l.effects && Object.keys(l.effects).length > 0) found.effects = true
      if (l.adjustment) found.adjustment = true
      if (l.children) {
        found.group = true
        visit(l.children, visible)
        continue
      }
      const img = l.imageData
      if (!img || img.width === 0 || img.height === 0) continue
      const pixels = createBitmap(img.width, img.height)
      pixels.data.set(img.data)
      layers.push(
        createLayer(l.name ?? 'Layer', pixels, {
          visible,
          opacity: l.opacity ?? 1,
          blend: fromPsdBlend(l.blendMode),
          x: l.left ?? 0,
          y: l.top ?? 0
        })
      )
    }
  }
  visit(psd.children ?? [], true)

  if (layers.length === 0) {
    const img = psd.imageData
    const pixels = createBitmap(psd.width, psd.height)
    if (img) pixels.data.set(img.data)
    layers.push(createLayer('Background', pixels))
  }
  const doc: PhotoDoc = {
    width: psd.width,
    height: psd.height,
    layers,
    activeLayerId: layers[layers.length - 1].id,
    selection: null,
    foreground: [0, 0, 0, 255],
    background: [255, 255, 255, 255]
  }
  const warnings: string[] = []
  if (found.smart) warnings.push('Smart objects were opened as plain pixels')
  if (found.effects) warnings.push('Layer effects were left out')
  if (found.adjustment) warnings.push('Adjustment layers were left out')
  if (found.mask) warnings.push('Layer masks were left out')
  if (found.group) warnings.push('Layer groups were ungrouped')
  return { doc, warnings }
}

/**
 * Text layers are written as their raster pixels only: ag-psd needs a canvas to lay out text,
 * which is not available outside the browser.
 */
export function writePsd(doc: PhotoDoc): Uint8Array {
  const flat = compositeLayers(doc.layers, doc.width, doc.height)
  const psd: Psd = {
    width: doc.width,
    height: doc.height,
    imageData: { width: flat.width, height: flat.height, data: flat.data },
    children: doc.layers.map(
      (l): PsdLayer => ({
        name: l.name,
        hidden: !l.visible,
        opacity: l.opacity,
        blendMode: toPsdBlend(l.blend),
        left: l.x,
        top: l.y,
        imageData: { width: l.pixels.width, height: l.pixels.height, data: l.pixels.data }
      })
    )
  }
  return new Uint8Array(agWritePsd(psd, { noBackground: true }))
}
