import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { SlidesStore } from './store'
import { exportPptx, insertTransition, readPresentation, transitionXml } from './file-io'
import { paceReport } from './pace'
import type { ChartElement, ImageElement, MediaElement, Presentation, TableElement, TextElement } from './model'

// 1x1 PNG, padded into a large data URL so it's moved out of the JSON copy.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
const VIDEO = `data:video/mp4;base64,${Buffer.alloc(6000, 7).toString('base64')}`

const el = <T,>(s: SlidesStore, id: string) => s.slide.elements.find((e) => e.id === id) as T

describe('arranging', () => {
  it('groups, selects the group from one member, and moves/resizes it as one', () => {
    const s = new SlidesStore()
    s.addSlide('blank')
    s.addShape('rect', '#ff0000')
    const a = s.selected[0]
    s.addShape('ellipse', '#00ff00')
    const b = s.selected[0]
    s.update([b], { x: 700 })
    s.select([a, b])
    expect(s.canGroup).toBe(true)
    s.group()
    s.select([a])
    expect(s.selected.sort()).toEqual([a, b].sort())
    s.nudge(10, 0)
    expect(el<{ x: number }>(s, b).x).toBe(710)
    const before = s.boundsOf(s.selection)
    s.resizeTogether(s.selected, before, { ...before, w: before.w * 2 }, new Map(s.selection.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }])))
    expect(el<{ w: number }>(s, a).w).toBe(480)
    s.ungroup()
    s.select([a])
    expect(s.selected).toEqual([a])
  })

  it('rotates, flips, locks and hides; locked objects stay put', () => {
    const s = new SlidesStore()
    s.addShape('triangle', '#333333')
    const id = s.selected[0]
    s.rotate(90)
    s.rotate(300)
    expect(el<{ rotation: number }>(s, id).rotation).toBe(30)
    s.flip('h')
    expect(el<{ flipH: boolean }>(s, id).flipH).toBe(true)
    s.toggleLock()
    const x = el<{ x: number }>(s, id).x
    s.nudge(50, 0)
    s.deleteSelected()
    expect(el<{ x: number }>(s, id).x).toBe(x)
    s.setElementHidden(id, true)
    expect(s.selected).toEqual([])
    s.selectAll()
    expect(s.selected).not.toContain(id)
  })

  it('format painter copies one object’s look onto another', () => {
    const s = new SlidesStore()
    s.addShape('rect', '#123456')
    const a = s.selected[0]
    s.setTextStyle({ bold: true, fontSize: 40 })
    s.setOpacity(0.5)
    s.addShape('ellipse', '#ffffff')
    const b = s.selected[0]
    s.select([a])
    s.copyFormat()
    s.applyFormat([b])
    const painted = el<{ fill: string; opacity: number; style: { bold: boolean; fontSize: number } }>(s, b)
    expect([painted.fill, painted.opacity, painted.style.bold, painted.style.fontSize]).toEqual(['#123456', 0.5, true, 40])
    expect(s.painter).toBeNull()
  })
})

describe('tables, charts, media and icons', () => {
  it('edits table cells, rows and columns', () => {
    const s = new SlidesStore()
    s.addTable(2, 3)
    const id = s.selected[0]
    s.setCell(id, 0, 1, 'Name')
    s.insertRow(id, 1)
    s.insertColumn(id, 0)
    s.deleteColumn(id, 3)
    const t = el<TableElement>(s, id)
    expect(t.rows).toEqual([['', '', 'Name'], ['', '', ''], ['', '', '']])
  })

  it('adds charts, media and recolourable icons', () => {
    const s = new SlidesStore()
    s.addChart('pie')
    expect(el<ChartElement>(s, s.selected[0]).series[0].values).toHaveLength(4)
    s.addMedia(VIDEO, 'video', 'clip.mp4', { w: 1920, h: 1080 })
    expect(el<MediaElement>(s, s.selected[0]).w).toBe(768)
    s.addIcon('Star', '#0f766e')
    const icon = el<ImageElement>(s, s.selected[0])
    expect(icon.src).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(atob(icon.src.split(',')[1])).toContain('#0f766e')
    s.setFill('#be123c')
    expect(atob(el<ImageElement>(s, icon.id).src.split(',')[1])).toContain('#be123c')
  })
})

describe('motion and show', () => {
  it('adds, reorders and removes animations; deleting an object removes its animations', () => {
    const s = new SlidesStore()
    const [title, sub] = s.slide.elements.map((e) => e.id)
    s.select([title])
    s.addAnimation('fade')
    s.select([sub])
    s.addAnimation('flyIn')
    const [a1, a2] = s.slide.animations!.map((a) => a.id)
    s.moveAnimation(a2, -1)
    expect(s.slide.animations!.map((a) => a.id)).toEqual([a2, a1])
    s.updateAnimation(a1, { start: 'after', delay: 200 })
    expect(s.slide.animations!.find((a) => a.id === a1)).toMatchObject({ start: 'after', delay: 200 })
    s.select([sub])
    s.deleteSelected()
    expect(s.slide.animations!.map((a) => a.id)).toEqual([a1])
  })

  it('sets transitions on one or all slides, hides slides, and keeps rehearsed timings', () => {
    const s = new SlidesStore()
    s.addSlide('titleContent')
    s.setTransition({ type: 'push', duration: 700 })
    expect(s.pres.slides.map((x) => x.transition?.type)).toEqual([undefined, 'push'])
    s.setTransition({ type: 'fade', duration: 400 }, true)
    expect(s.pres.slides.map((x) => x.transition?.type)).toEqual(['fade', 'fade'])
    s.setHidden([0], true)
    expect(s.pres.slides[0].hidden).toBe(true)
    s.saveTimings({ [s.pres.slides[1].id]: 42.4 })
    expect(s.pres.slides[1].timing).toBe(42)
    expect(s.pres.show?.useTimings).toBe(true)
  })

  it('flags rushed and lingering slides against a target length', () => {
    const p: Presentation = { theme: 'paper', slides: ['a', 'b', 'c', 'd'].map((id) => ({ id, elements: [], notes: '' })) }
    // 4 slides in 4 minutes: 60 s each.
    const r = paceReport(p, { a: 60, b: 10, c: 150, d: 55 }, 4)
    expect(r.rows.map((x) => x.pace)).toEqual(['ok', 'rushed', 'lingered', 'ok'])
    expect(r.total).toBe(275)
    expect(paceReport(p, { a: 10 }).rows[0].pace).toBe('ok') // no target, no judgement
  })
})

describe('slide master, layouts and footer', () => {
  it('edits master elements and layout positions; slides on the old positions follow', () => {
    const s = new SlidesStore()
    s.addSlide('titleContent')
    const moved = s.pres.slides[1]
    s.update([moved.elements[0].id], { y: 20 }) // this slide's title was moved by hand
    s.addSlide('titleContent')

    s.editMaster('master')
    s.addShape('rect', '#000000')
    expect(s.pres.master?.elements).toHaveLength(1)

    s.editMaster('titleContent')
    const body = s.slide.elements[1]
    s.update([body.id], { x: 300 })
    s.update([s.slide.elements[0].id], { y: 300 })
    s.editMaster(null)
    expect(s.pres.layoutBoxes?.titleContent?.[1].x).toBe(300)
    // The untouched slide follows; the hand-moved title stays where it was put.
    expect(s.pres.slides[2].elements.map((e) => [e.x, e.y])).toEqual([[80, 300], [300, 190]])
    expect(s.pres.slides[1].elements[0].y).toBe(20)
    s.addSlide('titleContent')
    expect(s.slide.elements[1].x).toBe(300)
  })

  it('stores footer settings', () => {
    const s = new SlidesStore()
    s.setFooter({ text: 'Bear Inc.', showText: true, slideNumber: true })
    expect(s.pres.footer).toMatchObject({ text: 'Bear Inc.', showText: true, slideNumber: true, skipTitle: true })
  })
})

describe('find & replace', () => {
  it('finds in text, tables and notes, and replaces one or all', () => {
    const s = new SlidesStore()
    s.setText(s.slide.elements[0].id, 'Bear sales')
    s.setNotes('Mention bear growth')
    s.addTable(1, 2)
    s.setCell(s.selected[0], 0, 0, 'BEAR')
    expect(s.find('bear', { matchCase: false })).toHaveLength(3)
    expect(s.find('bear', { matchCase: true })).toHaveLength(1)
    const [first] = s.find('Bear', { matchCase: true })
    s.replace(first, 'Bear', 'Panda')
    expect((s.slide.elements[0] as TextElement).text).toBe('Panda sales')
    expect(s.replaceAll('bear', 'otter', { matchCase: false })).toBe(2)
    expect(s.slide.notes).toBe('Mention otter growth')
  })
})

describe('.pptx with the new content', () => {
  const build = () => {
    const s = new SlidesStore()
    s.setText(s.slide.elements[0].id, 'Deck')
    s.addSlide('titleContent')
    s.addTable(2, 2)
    s.setCell(s.selected[0], 0, 0, 'Region')
    s.addChart('column')
    s.addMedia(VIDEO, 'video', 'clip.mp4')
    s.addImage(PNG.replace('==', '') + 'A'.repeat(3000) + '==', { w: 100, h: 100 })
    s.addShape('arrow', '#0f766e')
    s.rotate(45)
    s.setTransition({ type: 'push', duration: 400 })
    s.setAdvanceAfter(5)
    s.setHidden([0], true)
    s.setFooter({ slideNumber: true, text: 'Confidential', showText: true })
    s.editMaster('master')
    s.addShape('rect', '#eeeeee')
    s.editMaster(null)
    return s.pres
  }

  it('writes tables, charts, media, transitions, hidden slides and rotation for PowerPoint', async () => {
    const zip = await JSZip.loadAsync(await exportPptx(build()))
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(slide1).toMatch(/<p:sld[^>]* show="0"/)
    expect(slide2).toContain('<a:tbl>')
    expect(slide2).toContain('Region')
    expect(slide2).toMatch(/rot="2700000"/) // 45° in 60000ths
    expect(slide2).toContain('<p:transition spd="fast" advTm="5000"><p:push dir="l"/></p:transition>')
    expect(Object.keys(zip.files).some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(true)
    expect(Object.keys(zip.files).some((n) => /^ppt\/media\/.*\.mp4$/.test(n))).toBe(true)
    expect(slide2).toContain('Confidential')
  })

  it('reopens exactly, without storing pictures and media twice', async () => {
    const pres = build()
    const bytes = await exportPptx(pres)
    const zip = await JSZip.loadAsync(bytes)
    const json = await zip.file('bear/presentation.json')!.async('string')
    expect(json).not.toContain('data:video')
    expect(json).toContain('bear-media:')
    expect(await readPresentation(bytes)).toEqual(pres)
  })

  it('reads tables, rotation, hidden slides and transitions from PowerPoint files', async () => {
    const zip = await JSZip.loadAsync(await exportPptx(build()))
    zip.remove('bear/presentation.json') // as if made by PowerPoint
    const p = await readPresentation(await zip.generateAsync({ type: 'uint8array' }))
    expect(p.slides[0].hidden).toBe(true)
    expect(p.slides[1].transition).toEqual({ type: 'push', duration: 500 })
    expect(p.slides[1].advanceAfter).toBe(5)
    const table = p.slides[1].elements.find((e) => e.kind === 'table') as TableElement
    expect(table.rows[0][0]).toBe('Region')
    expect(p.slides[1].elements.some((e) => e.rotation === 45)).toBe(true)
  })

  it('places a transition where the slide schema expects it', () => {
    expect(insertTransition('<p:sld><p:cSld/><p:clrMapOvr><a:x/></p:clrMapOvr><p:timing/></p:sld>', '<T/>')).toBe('<p:sld><p:cSld/><p:clrMapOvr><a:x/></p:clrMapOvr><T/><p:timing/></p:sld>')
    expect(transitionXml({ id: 's', elements: [], notes: '' }, false)).toBeNull()
    expect(transitionXml({ id: 's', elements: [], notes: '', timing: 12 }, true)).toBe('<p:transition spd="med" advTm="12000"></p:transition>')
  })
})
