import { writePsd, type Layer } from 'ag-psd'

function solid(w: number, h: number, rgba: [number, number, number, number]): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return { width: w, height: h, data }
}

/**
 * Builds a small PSD (no committed binary) with features Bear does not keep:
 * a layer mask, a smart object, layer effects, a group and an adjustment layer.
 */
export function makeMaskedLayerPsd(): Uint8Array {
  const children: Layer[] = [
    { name: 'Base', left: 0, top: 0, imageData: solid(8, 8, [200, 50, 50, 255]) },
    {
      name: 'Masked',
      left: 1,
      top: 1,
      imageData: solid(6, 6, [50, 200, 50, 255]),
      mask: { top: 1, left: 1, bottom: 7, right: 7, defaultColor: 0, imageData: solid(6, 6, [128, 128, 128, 255]) }
    },
    {
      name: 'Smart',
      left: 0,
      top: 0,
      imageData: solid(4, 4, [50, 50, 200, 255]),
      placedLayer: { id: '20953ddb-9391-11ec-b4f1-c15674f50bc4', type: 'unknown', transform: [0, 0, 4, 0, 4, 4, 0, 4], width: 4, height: 4 }
    },
    {
      name: 'Glow',
      left: 2,
      top: 2,
      imageData: solid(4, 4, [255, 255, 0, 255]),
      effects: { dropShadow: [{ enabled: true, size: { value: 3, units: 'Pixels' }, opacity: 0.5 }] }
    },
    {
      name: 'Group',
      opened: true,
      children: [{ name: 'In group', left: 3, top: 3, imageData: solid(2, 2, [0, 255, 255, 255]) }]
    },
    { name: 'Invert', adjustment: { type: 'invert' } }
  ]
  return new Uint8Array(writePsd({ width: 8, height: 8, imageData: solid(8, 8, [255, 255, 255, 255]), children }, { noBackground: true }))
}
