import { describe, expect, it } from 'vitest'
import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { SlidesStore, newPresentation } from './store'
import { exportPptx, readPresentation } from './file-io'
import type { Presentation, TextElement } from './model'

// 1x1 red PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

describe('SlidesStore', () => {
  it('starts with a title slide and adds slides by layout', () => {
    const s = new SlidesStore()
    expect(s.slide.elements.map((e) => (e as TextElement).placeholder)).toEqual(['title', 'subtitle'])
    s.addSlide('twoContent')
    expect(s.current).toBe(1)
    expect(s.slide.elements.map((e) => (e as TextElement).placeholder)).toEqual(['title', 'body', 'body'])
  })

  it('undoes and redoes, merging rapid typing into one step', () => {
    const s = new SlidesStore()
    const title = s.slide.elements[0].id
    s.setText(title, 'H')
    s.setText(title, 'He')
    s.setText(title, 'Hello')
    s.undo()
    expect((s.slide.elements[0] as TextElement).text).toBe('')
    s.redo()
    expect((s.slide.elements[0] as TextElement).text).toBe('Hello')
  })

  it('duplicates, reorders and deletes slides', () => {
    const s = new SlidesStore()
    s.setText(s.slide.elements[0].id, 'One')
    s.duplicateSlide()
    s.addSlide('blank')
    expect(s.pres.slides).toHaveLength(3)
    s.moveSlide(2, 0)
    expect(s.pres.slides[0].elements).toHaveLength(0)
    s.deleteSlide(0)
    expect(s.pres.slides).toHaveLength(2)
    s.deleteSlide(0)
    s.deleteSlide(0) // the last slide can't be deleted
    expect(s.pres.slides).toHaveLength(1)
  })

  it('copies, pastes with an offset, nudges and restacks elements', () => {
    const s = new SlidesStore()
    s.addShape('rect', '#0f766e')
    const shape = s.selection[0]
    s.copy()
    s.paste()
    const copy = s.selection[0]
    expect(copy.id).not.toBe(shape.id)
    expect(copy.x).toBe(shape.x + 24)
    s.nudge(10, 0)
    s.nudge(10, 0)
    expect(s.selection[0].x).toBe(shape.x + 44)
    s.undo() // both nudges are one step
    expect(s.selection[0].x).toBe(shape.x + 24)
    s.reorder('back')
    expect(s.slide.elements[0].id).toBe(copy.id)
  })

  it('aligns a single element to the slide', () => {
    const s = new SlidesStore()
    s.addShape('ellipse', '#000000')
    s.align('right')
    expect(s.selection[0].x + s.selection[0].w).toBe(1280)
    s.align('top')
    expect(s.selection[0].y).toBe(0)
  })
})

function sample(): Presentation {
  const s = new SlidesStore()
  s.setTheme('ocean')
  s.setText(s.slide.elements[0].id, 'Quarterly review')
  s.setNotes('Welcome everyone')
  s.addSlide('titleContent')
  s.setText(s.slide.elements[0].id, 'Highlights')
  s.setText(s.slide.elements[1].id, 'Revenue up\nCosts down')
  s.addShape('roundRect', '#38bdf8')
  s.update(s.selected, { text: 'Big idea' } as never)
  s.addImage(PNG, { w: 100, h: 100 })
  return s.pres
}

describe('.pptx files', () => {
  it('exports a real PowerPoint file and reopens it losslessly', async () => {
    const pres = sample()
    const bytes = await exportPptx(pres)
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file('ppt/slides/slide2.xml')).toBeTruthy()
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(slide2).toContain('Highlights')
    expect(slide2).toContain('Big idea')
    expect(slide2).toContain('<a:buChar') // bullets
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/'))).toBe(true)
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('Extension="json"')
    const notes = Object.keys(zip.files).filter((f) => f.startsWith('ppt/notesSlides/notesSlide') && f.endsWith('.xml'))
    expect(notes.length).toBeGreaterThan(0)

    expect(await readPresentation(bytes)).toEqual(pres)
  })

  it('imports text, shapes, pictures, backgrounds and notes from other apps', async () => {
    const p = new PptxGenJS()
    p.layout = 'LAYOUT_WIDE'
    const s1 = p.addSlide()
    s1.background = { color: '112233' }
    s1.addText('Hello world', { x: 1, y: 1, w: 6, h: 1, fontSize: 36, bold: true, color: 'FF0000' })
    s1.addText([{ text: 'One', options: { bullet: true, breakLine: true } }, { text: 'Two', options: { bullet: true } }], { x: 1, y: 2.5, w: 6, h: 2 })
    s1.addShape('ellipse' as PptxGenJS.ShapeType, { x: 8, y: 1, w: 2, h: 2, fill: { color: '00AA00' } })
    s1.addImage({ data: PNG.replace(/^data:/, ''), x: 8, y: 4, w: 1, h: 1 })
    s1.addNotes('Speaker notes here')
    p.addSlide().addText('Second', { x: 0.5, y: 0.5, w: 4, h: 1 })
    const bytes = new Uint8Array((await p.write({ outputType: 'arraybuffer' })) as ArrayBuffer)

    const pres = await readPresentation(bytes)
    expect(pres.slides).toHaveLength(2)
    const [a, b] = pres.slides
    expect(a.background).toBe('#112233')
    expect(a.notes).toBe('Speaker notes here')
    const hello = a.elements.find((e) => e.kind === 'text' && e.text === 'Hello world') as TextElement
    expect(hello).toMatchObject({ x: 96, y: 96, w: 576, style: { fontSize: 36, bold: true, color: '#ff0000' } })
    const list = a.elements.find((e) => e.kind === 'text' && e.text === 'One\nTwo') as TextElement
    expect(list.style.bullets).toBe(true)
    expect(a.elements.find((e) => e.kind === 'shape')).toMatchObject({ shape: 'ellipse', fill: '#00aa00', x: 768 })
    expect(a.elements.find((e) => e.kind === 'image')).toMatchObject({ src: expect.stringMatching(/^data:image\/png;base64,/) })
    expect((b.elements[0] as TextElement).text).toBe('Second')
  })

  it('exports an empty new presentation', async () => {
    const bytes = await exportPptx(newPresentation())
    expect((await readPresentation(bytes)).slides).toHaveLength(1)
  })
})

describe('themes', () => {
  it('moves theme-coloured shapes to the new palette but keeps hand-picked colours', () => {
    const s = new SlidesStore()
    s.addShape('rect', '#0f766e') // Paper's first accent
    const themed = s.selected[0]
    s.addShape('rect', '#123456')
    const custom = s.selected[0]
    s.setTheme('ocean')
    const fill = (id: string) => (s.slide.elements.find((e) => e.id === id) as { fill: string }).fill
    expect(fill(themed)).toBe('#38bdf8')
    expect(fill(custom)).toBe('#123456')
  })
})
