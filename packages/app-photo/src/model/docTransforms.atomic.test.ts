import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBitmap } from './bitmap'
import { createDoc, type Layer } from './doc'
import { PhotoEditor } from './editor'
import { rectMask } from './mask'

/** Make the Nth bitmap allocation of rotate/flip/resample fail, like an out-of-memory RangeError. */
const fail = vi.hoisted(() => ({ at: 0, count: 0 }))
const maybeFail = () => {
  fail.count++
  if (fail.count === fail.at) throw new RangeError('Array buffer allocation failed')
}

vi.mock('../ops/transform', async (orig) => {
  const real = await orig<typeof import('../ops/transform')>()
  return {
    ...real,
    rotate90: (...a: Parameters<typeof real.rotate90>) => (maybeFail(), real.rotate90(...a)),
    flip: (...a: Parameters<typeof real.flip>) => (maybeFail(), real.flip(...a))
  }
})
vi.mock('../ops/resample', async (orig) => {
  const real = await orig<typeof import('../ops/resample')>()
  return { ...real, resample: (...a: Parameters<typeof real.resample>) => (maybeFail(), real.resample(...a)) }
})

function setup() {
  const doc = createDoc(4, 2, [255, 255, 255, 255])
  const ed = new PhotoEditor(doc)
  ed.addLayer({ pixels: createBitmap(1, 1, [255, 0, 0, 255]), x: 3, y: 0 })
  ed.addLayer({ pixels: createBitmap(2, 1, [0, 0, 255, 255]), x: 1, y: 1 })
  ed.setSelection(rectMask(4, 2, { x: 0, y: 0, width: 1, height: 1 }))
  const state = (l: Layer) => ({ pixels: l.pixels, x: l.x, y: l.y, kind: l.kind })
  const before = { size: [doc.width, doc.height], layers: doc.layers.map(state), selection: doc.selection, steps: ed.history.steps.length, version: ed.version }
  const unchanged = () => {
    expect([doc.width, doc.height]).toEqual(before.size)
    expect(doc.layers.map(state)).toEqual(before.layers)
    doc.layers.forEach((l, i) => expect(l.pixels).toBe(before.layers[i].pixels))
    expect(doc.selection).toBe(before.selection)
    expect(ed.history.steps.length).toBe(before.steps)
    expect(ed.version).toBe(before.version)
  }
  return { ed, unchanged }
}

describe('image commands are all-or-nothing', () => {
  beforeEach(() => {
    fail.count = 0
    fail.at = 2 // the second layer's new bitmap
  })

  it.each([
    ['rotateDoc(1)', (ed: PhotoEditor) => ed.rotateDoc(1)],
    ['rotateDoc(2)', (ed: PhotoEditor) => ed.rotateDoc(2)],
    ['flipDoc(h)', (ed: PhotoEditor) => ed.flipDoc('h')],
    ['resizeImage', (ed: PhotoEditor) => ed.resizeImage(8, 4)]
  ])('%s: an allocation failure on the second layer leaves the document and history untouched', (_name, run) => {
    const { ed, unchanged } = setup()
    expect(() => run(ed)).toThrow(RangeError)
    unchanged()
  })

  it('works normally when nothing fails', () => {
    fail.at = 0
    const { ed } = setup()
    ed.rotateDoc(1)
    expect([ed.doc.width, ed.doc.height]).toEqual([2, 4])
  })
})
