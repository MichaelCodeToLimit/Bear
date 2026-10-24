import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { DOMParser as XmlParser } from '@xmldom/xmldom'
import type { FileFilter } from '@bear/core'
import {
  newId, PX_PER_IN, SLIDE_H, SLIDE_W,
  type Align, type Presentation, type ShapeKind, type Slide, type SlideElement, type TextStyle, type TransitionType, type VAlign
} from './model'
import { fontFamily, getTheme, type Theme } from './themes'

export const SAVE_FILTERS: FileFilter[] = [{ name: 'PowerPoint presentation', extensions: ['pptx'] }]
export const OPEN_FILTERS: FileFilter[] = [
  { name: 'Presentations', extensions: ['pptx'] },
  { name: 'All files', extensions: ['*'] }
]
export const SAVABLE = new Set(['pptx'])

/** Bear's own copy of the presentation inside the .pptx, so reopening in Bear is lossless. */
const NATIVE_PART = 'bear/presentation.json'
/** Pictures and media referenced from the native copy (so they aren't stored twice as text). */
const MEDIA_DIR = 'bear/media/'
const MEDIA_REF = 'bear-media:'

const inch = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000
const hex = (c?: string | null) => (c ? c.replace('#', '').slice(0, 6).toUpperCase() : undefined)

// ---------- Export ----------

const PPTX_SHAPE: Record<ShapeKind, string> = {
  rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', arrow: 'rightArrow', line: 'line'
}

function textOptions(style: TextStyle, theme: Theme, placeholder: string | undefined, fallbackColor: string) {
  return {
    fontSize: style.fontSize ?? 18,
    fontFace: fontFamily(theme, style.font, placeholder),
    color: hex(style.color ?? fallbackColor),
    bold: style.bold,
    italic: style.italic,
    underline: style.underline ? { style: 'sng' as const } : undefined,
    strike: style.strike ? ('sngStrike' as const) : undefined,
    align: style.align ?? 'left',
    valign: style.valign ?? 'top',
    lineSpacingMultiple: style.lineSpacing && style.lineSpacing !== 1 ? style.lineSpacing : undefined,
    shadow: style.shadow ? { type: 'outer' as const, blur: 4, offset: 2, angle: 45, color: '000000', opacity: 0.45 } : undefined,
    outline: style.outline ? { size: 1, color: hex(style.outline)! } : undefined,
    margin: 6
  }
}

function runs(text: string, style: TextStyle) {
  return text.split('\n').map((line) => ({
    text: line,
    options: { bullet: line.trim() ? (style.numbered ? { type: 'number' as const } : style.bullets ? true : false) : false, breakLine: true }
  }))
}

/** Position, rotation, flips (shared by every kind of object). */
function placement(el: SlideElement) {
  return {
    x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h),
    rotate: el.rotation || undefined,
    flipH: el.flipH || undefined,
    flipV: el.flipV || undefined
  }
}

const transparency = (el: SlideElement) => (el.opacity !== undefined && el.opacity < 1 ? Math.round((1 - el.opacity) * 100) : undefined)

const MEDIA_EXT: Record<string, string> = {
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac'
}

function addElement(pptx: PptxGenJS, s: PptxGenJS.Slide, el: SlideElement, theme: Theme) {
  if (el.hidden) return
  const box = placement(el)
  const tr = transparency(el)
  switch (el.kind) {
    case 'image': {
      const c = el.crop
      if (c && (c.l || c.t || c.r || c.b)) {
        // The whole picture at the size it shows, cropped to the visible part.
        const fullW = el.w / Math.max(0.05, 1 - c.l - c.r)
        const fullH = el.h / Math.max(0.05, 1 - c.t - c.b)
        s.addImage({ data: el.src.replace(/^data:/, ''), ...box, w: inch(fullW), h: inch(fullH), transparency: tr, sizing: { type: 'crop', x: inch(c.l * fullW), y: inch(c.t * fullH), w: inch(el.w), h: inch(el.h) } })
      } else s.addImage({ data: el.src.replace(/^data:/, ''), ...box, transparency: tr })
      return
    }
    case 'text': {
      if (!el.text) return // empty placeholders don't appear in a finished deck
      const color = el.placeholder === 'title' ? theme.title : theme.text
      s.addText(runs(el.text, el.style), { ...box, ...textOptions(el.style, theme, el.placeholder, color) })
      return
    }
    case 'shape': {
      const shape = PPTX_SHAPE[el.shape] as PptxGenJS.ShapeType
      const look = {
        ...box,
        ...(el.shape === 'line' ? { h: 0 } : {}),
        fill: el.fill ? { color: hex(el.fill), transparency: tr } : undefined,
        line: el.stroke ? { color: hex(el.stroke), width: el.strokeWidth ?? 2, transparency: tr } : undefined
      }
      if (el.text) s.addText(runs(el.text, el.style), { shape, ...look, ...textOptions(el.style, theme, undefined, '#ffffff') })
      else s.addShape(shape, look)
      return
    }
    case 'table': {
      const accent = hex(theme.accents[el.accent % theme.accents.length])!
      const base = textOptions(el.style, theme, undefined, theme.text)
      const rows = el.rows.map((row, r) => row.map((text) => {
        const head = el.header && r === 0
        const band = el.banded && !head && (r - (el.header ? 1 : 0)) % 2 === 1
        return { text, options: { bold: head || base.bold, color: head ? 'FFFFFF' : base.color, fill: head ? { color: accent } : band ? { color: accent, transparency: 86 } : undefined } }
      }))
      s.addTable(rows, {
        x: box.x, y: box.y, w: box.w, h: box.h, rowH: inch(el.h / Math.max(1, el.rows.length)),
        fontSize: base.fontSize, fontFace: base.fontFace, color: base.color, valign: 'middle',
        border: { type: 'solid', pt: 1, color: accent }
      })
      return
    }
    case 'chart': {
      const types = (pptx as unknown as { ChartType: Record<string, PptxGenJS.CHART_NAME> }).ChartType
      const type = el.chartType === 'column' || el.chartType === 'bar' ? types.bar : types[el.chartType]
      const data = el.series.map((ser) => ({ name: ser.name, labels: el.categories, values: el.categories.map((_, i) => ser.values[i] ?? 0) }))
      s.addChart(type, data, {
        ...box,
        barDir: el.chartType === 'bar' ? 'bar' : 'col',
        chartColors: theme.accents.map((a) => hex(a)!),
        showLegend: el.legend,
        legendPos: 'b',
        showTitle: !!el.title,
        title: el.title || undefined,
        holeSize: el.chartType === 'doughnut' ? 55 : undefined,
        showPercent: el.chartType === 'pie' || el.chartType === 'doughnut'
      })
      return
    }
    case 'media': {
      const mime = /^data:([^;]+);/.exec(el.src)?.[1] ?? ''
      s.addMedia({ type: el.mediaType, data: el.src.replace(/^data:/, ''), extn: MEDIA_EXT[mime] ?? (el.mediaType === 'video' ? 'mp4' : 'mp3'), ...box } as PptxGenJS.MediaProps)
    }
  }
}

/** Footer text and date as text boxes; the slide number as PowerPoint's own slide-number field. */
function addFooter(s: PptxGenJS.Slide, p: Presentation, slide: Slide, index: number, theme: Theme) {
  const f = p.footer
  if (!f || (f.skipTitle && slide.layout === 'title')) return
  const look = { y: inch(SLIDE_H - 46), h: inch(30), fontSize: 12, fontFace: theme.bodyFont, color: hex(theme.text), margin: 0 }
  if (f.date) s.addText(f.dateText || new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), { ...look, x: inch(60), w: inch(320) })
  if (f.showText && f.text) s.addText(f.text, { ...look, x: inch(400), w: inch(480), align: 'center' })
  if (f.slideNumber) s.slideNumber = { x: inch(900), y: look.y, w: inch(320), h: look.h, fontSize: 12, fontFace: theme.bodyFont, color: hex(theme.text), align: 'right' } as PptxGenJS.SlideNumberProps
  void index
}

const TRANSITION_XML: Record<Exclude<TransitionType, 'none'>, string> = {
  fade: '<p:fade/>', push: '<p:push dir="l"/>', wipe: '<p:wipe dir="r"/>', zoom: '<p:zoom/>', cover: '<p:cover dir="l"/>'
}

/** PowerPoint's transition element for a slide (also carries "advance after"). */
export function transitionXml(slide: Slide, useTimings: boolean): string | null {
  const t = slide.transition
  const after = slide.advanceAfter ?? (useTimings ? slide.timing : undefined)
  if (!t && !after) return null
  const spd = !t ? 'med' : t.duration <= 500 ? 'fast' : t.duration <= 1000 ? 'med' : 'slow'
  const adv = after ? ` advTm="${Math.round(after * 1000)}"` : ''
  const effect = t && t.type !== 'none' ? TRANSITION_XML[t.type] : ''
  return `<p:transition spd="${spd}"${adv}>${effect}</p:transition>`
}

/** Put a transition into slide XML, where the schema wants it (after clrMapOvr, before timing). */
export function insertTransition(xml: string, transition: string): string {
  if (xml.includes('</p:clrMapOvr>')) return xml.replace('</p:clrMapOvr>', `</p:clrMapOvr>${transition}`)
  if (xml.includes('<p:timing')) return xml.replace('<p:timing', `${transition}<p:timing`)
  return xml.replace('</p:sld>', `${transition}</p:sld>`)
}

/** Move data: URLs out of the presentation into separate zip parts; returns the slimmed copy. */
function extractMedia(p: Presentation, zip: JSZip): Presentation {
  const names = new Map<string, string>()
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('data:') && v.length > 2048) {
      let name = names.get(v)
      if (!name) {
        const mime = /^data:([^;,]+)/.exec(v)?.[1] ?? 'application/octet-stream'
        const ext = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
        name = `m${names.size + 1}.${ext}`
        names.set(v, name)
        zip.file(MEDIA_DIR + name, v.slice(v.indexOf(',') + 1), { base64: true })
        zip.file(`${MEDIA_DIR}${name}.type`, mime)
      }
      return MEDIA_REF + name
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(p) as Presentation
}

export async function exportPptx(p: Presentation): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Bear Slides'
  const theme = getTheme(p.theme)

  p.slides.forEach((slide, index) => {
    const s = pptx.addSlide()
    const bg = slide.background ?? theme.backgroundSolid
    s.background = { color: hex(bg.startsWith('#') ? bg : theme.backgroundSolid) }
    if (slide.hidden) s.hidden = true
    for (const el of p.master?.elements ?? []) addElement(pptx, s, el, theme)
    for (const el of slide.elements) addElement(pptx, s, el, theme)
    addFooter(s, p, slide, index, theme)
    if (slide.notes) s.addNotes(slide.notes)
  })

  const zip = await JSZip.loadAsync((await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer)
  // Transitions and automatic timings, which pptxgenjs doesn't write.
  for (let i = 0; i < p.slides.length; i++) {
    const xml = transitionXml(p.slides[i], !!p.show?.useTimings)
    const part = zip.file(`ppt/slides/slide${i + 1}.xml`)
    if (xml && part) zip.file(`ppt/slides/slide${i + 1}.xml`, insertTransition(await part.async('string'), xml))
  }
  zip.file(NATIVE_PART, JSON.stringify(extractMedia(p, zip)))
  // Every part in an Office file needs a content type, or PowerPoint offers to "repair" it.
  let types = await zip.file('[Content_Types].xml')!.async('string')
  const defaults = new Set([...types.matchAll(/Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()))
  const extra = new Set(['json', 'type', ...Object.keys(zip.files).filter((n) => n.startsWith(MEDIA_DIR)).map((n) => n.split('.').pop()!.toLowerCase())])
  for (const ext of extra) {
    if (!defaults.has(ext)) types = types.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="application/octet-stream"/>`)
  }
  types = types.replace('<Default Extension="json" ContentType="application/octet-stream"/>', '<Default Extension="json" ContentType="application/json"/>')
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ---------- Import ----------

// A standalone parser behaves the same in the app and in tests (and keeps prefixed attributes).
const parseXml = (s: string) => new XmlParser().parseFromString(s, 'application/xml') as unknown as Document

/** Element children (skipping text and comments). */
const childElements = (el: Element | null | undefined): Element[] =>
  el ? (Array.from(el.childNodes).filter((n) => n.nodeType === 1) as Element[]) : []

/** Direct children with a given qualified tag name. */
const kids = (el: Element | null | undefined, tag: string): Element[] =>
  childElements(el).filter((c) => c.tagName === tag)
const kid = (el: Element | null | undefined, ...path: string[]): Element | null => {
  let cur: Element | null | undefined = el
  for (const tag of path) cur = kids(cur, tag)[0]
  return cur ?? null
}
const all = (el: Element | Document | null | undefined, tag: string): Element[] => (el ? Array.from(el.getElementsByTagName(tag)) : [])

/** Read a possibly prefixed attribute (r:id, r:embed) consistently across DOM implementations. */
function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null
  const direct = el.getAttribute(name)
  if (direct !== null) return direct
  const local = name.includes(':') ? name.split(':')[1] : name
  for (const a of Array.from(el.attributes)) if (a.name === name || a.localName === local) return a.value
  return null
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function readRels(zip: JSZip, partPath: string): Promise<Map<string, { target: string; type: string }>> {
  const dir = partPath.split('/').slice(0, -1).join('/')
  const name = partPath.split('/').pop()
  const file = zip.file(`${dir}/_rels/${name}.rels`)
  const map = new Map<string, { target: string; type: string }>()
  if (!file) return map
  for (const r of all(parseXml(await file.async('string')), 'Relationship')) {
    map.set(r.getAttribute('Id')!, { target: resolvePath(partPath, r.getAttribute('Target')!), type: r.getAttribute('Type') ?? '' })
  }
  return map
}

const srgb = (el: Element | null) => {
  const v = kid(el, 'a:solidFill', 'a:srgbClr')?.getAttribute('val')
  return v ? `#${v.toLowerCase()}` : undefined
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }

const FROM_PRESET: Record<string, ShapeKind> = {
  rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rightArrow: 'arrow',
  line: 'line', straightConnector1: 'line'
}

/** Put pictures and media back into the native copy. */
async function restoreMedia(p: unknown, zip: JSZip): Promise<unknown> {
  const cache = new Map<string, string>()
  const load = async (name: string) => {
    if (!cache.has(name)) {
      const data = await zip.file(MEDIA_DIR + name)?.async('base64')
      const mime = (await zip.file(`${MEDIA_DIR}${name}.type`)?.async('string')) ?? 'application/octet-stream'
      cache.set(name, data ? `data:${mime};base64,${data}` : '')
    }
    return cache.get(name)!
  }
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string' && v.startsWith(MEDIA_REF)) return load(v.slice(MEDIA_REF.length))
    if (Array.isArray(v)) return Promise.all(v.map(walk))
    if (v && typeof v === 'object') return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x)])))
    return v
  }
  return walk(p)
}

export async function readPresentation(data: Uint8Array): Promise<Presentation> {
  const zip = await JSZip.loadAsync(data)
  const native = zip.file(NATIVE_PART)
  if (native) {
    try {
      const p = (await restoreMedia(JSON.parse(await native.async('string')), zip)) as Presentation
      if (Array.isArray(p.slides) && p.slides.length) return p
    } catch {
      /* fall back to reading the slides themselves */
    }
  }
  return importForeignPptx(zip)
}

async function importForeignPptx(zip: JSZip): Promise<Presentation> {
  const presPath = 'ppt/presentation.xml'
  const presFile = zip.file(presPath)
  if (!presFile) throw new Error('This file is not a PowerPoint presentation.')
  const pres = parseXml(await presFile.async('string'))
  const size = all(pres, 'p:sldSz')[0]
  const cx = Number(size?.getAttribute('cx') ?? 12192000)
  const cy = Number(size?.getAttribute('cy') ?? 6858000)
  // Fit the original slide size into ours, centred (4:3 decks get side margins).
  const scale = Math.min(SLIDE_W / cx, SLIDE_H / cy)
  const offX = (SLIDE_W - cx * scale) / 2
  const offY = (SLIDE_H - cy * scale) / 2
  const rels = await readRels(zip, presPath)

  const slides: Slide[] = []
  for (const id of all(pres, 'p:sldId')) {
    const rel = rels.get(attr(id, 'r:id') ?? '')
    if (!rel) continue
    const file = zip.file(rel.target)
    if (!file) continue
    slides.push(await importSlide(zip, rel.target, parseXml(await file.async('string')), { scale, offX, offY }))
  }
  return { theme: 'paper', slides: slides.length ? slides : [{ id: newId('s'), elements: [], notes: '' }] }
}

interface Fit {
  scale: number
  offX: number
  offY: number
}

type Geometry = { x: number; y: number; w: number; h: number; rotation?: number; flipH?: boolean; flipV?: boolean }

const FROM_TRANSITION: Record<string, TransitionType> = { fade: 'fade', push: 'push', wipe: 'wipe', zoom: 'zoom', cover: 'cover', pull: 'cover', split: 'wipe', dissolve: 'fade', cut: 'fade' }

async function importSlide(zip: JSZip, path: string, doc: Document, fit: Fit): Promise<Slide> {
  const rels = await readRels(zip, path)
  const root = doc.documentElement
  const cSld = kid(root, 'p:cSld')
  const background = srgb(kid(cSld, 'p:bg', 'p:bgPr'))
  const elements: SlideElement[] = []

  const fromXfrm = (xfrm: Element | null): Geometry | null => {
    const off = kid(xfrm, 'a:off')
    const ext = kid(xfrm, 'a:ext')
    if (!off || !ext) return null
    const rot = Number(xfrm!.getAttribute('rot') ?? 0) / 60000
    return {
      x: Math.round(Number(off.getAttribute('x')) * fit.scale + fit.offX),
      y: Math.round(Number(off.getAttribute('y')) * fit.scale + fit.offY),
      w: Math.max(4, Math.round(Number(ext.getAttribute('cx')) * fit.scale)),
      h: Math.max(4, Math.round(Number(ext.getAttribute('cy')) * fit.scale)),
      rotation: rot ? Math.round(rot) : undefined,
      flipH: xfrm!.getAttribute('flipH') === '1' || undefined,
      flipV: xfrm!.getAttribute('flipV') === '1' || undefined
    }
  }
  const geometry = (spPr: Element | null) => fromXfrm(kid(spPr, 'a:xfrm'))

  const walk = async (tree: Element | null) => {
    for (const node of childElements(tree)) {
      if (node.tagName === 'p:grpSp') await walk(node)
      else if (node.tagName === 'p:sp' || node.tagName === 'p:cxnSp') {
        const el = readShape(node, geometry)
        if (el) elements.push(el)
      } else if (node.tagName === 'p:pic') {
        const g = geometry(kid(node, 'p:spPr'))
        const embed = attr(all(node, 'a:blip')[0], 'r:embed')
        const media = embed ? rels.get(embed) : undefined
        const file = media ? zip.file(media.target) : null
        if (g && file) {
          const ext = media!.target.split('.').pop()!.toLowerCase()
          elements.push({ id: newId(), kind: 'image', ...g, src: `data:${MIME[ext] ?? 'image/png'};base64,${await file.async('base64')}` })
        }
      } else if (node.tagName === 'p:graphicFrame') {
        const tbl = all(node, 'a:tbl')[0]
        const g = fromXfrm(kid(node, 'p:xfrm'))
        if (tbl && g) {
          const rows = kids(tbl, 'a:tr').map((tr) => kids(tr, 'a:tc').map((tc) => paragraphs(kid(tc, 'a:txBody')).map((p) => p.text).join('\n')))
          const width = Math.max(1, ...rows.map((r) => r.length))
          elements.push({
            id: newId(), kind: 'table', ...g,
            rows: rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => '')]),
            header: kid(tbl, 'a:tblPr')?.getAttribute('firstRow') === '1', banded: kid(tbl, 'a:tblPr')?.getAttribute('bandRow') === '1',
            accent: 0, style: { fontSize: 14 }
          })
        }
      }
    }
  }
  await walk(kid(cSld, 'p:spTree'))

  // Speaker notes live in a separate part linked from the slide.
  let notes = ''
  for (const r of rels.values()) {
    if (!r.type.endsWith('/notesSlide')) continue
    const nf = zip.file(r.target)
    if (!nf) continue
    const ndoc = parseXml(await nf.async('string'))
    const body = all(ndoc, 'p:sp').find((sp) => all(sp, 'p:ph')[0]?.getAttribute('type') === 'body')
    notes = paragraphs(kid(body, 'p:txBody')).map((p) => p.text).join('\n')
  }

  const slide: Slide = { id: newId('s'), elements, background, notes }
  if (root.getAttribute('show') === '0') slide.hidden = true
  const tr = kid(root, 'p:transition') ?? all(root, 'p:transition')[0] ?? null
  if (tr) {
    const effect = childElements(tr)[0]?.tagName.replace(/^p\d*:/, '')
    if (effect && FROM_TRANSITION[effect]) slide.transition = { type: FROM_TRANSITION[effect], duration: tr.getAttribute('spd') === 'fast' ? 500 : tr.getAttribute('spd') === 'slow' ? 1500 : 1000 }
    const adv = Number(tr.getAttribute('advTm'))
    if (adv > 0) slide.advanceAfter = Math.round(adv / 100) / 10
  }
  return slide
}

function paragraphs(txBody: Element | null): { text: string; bullet: boolean; numbered: boolean; align?: Align; rPr: Element | null }[] {
  return kids(txBody, 'a:p').map((p) => {
    const pieces = childElements(p).filter((c) => c.tagName === 'a:r' || c.tagName === 'a:fld' || c.tagName === 'a:br')
    const text = pieces.map((c) => (c.tagName === 'a:br' ? '\n' : kid(c, 'a:t')?.textContent ?? '')).join('')
    const pPr = kid(p, 'a:pPr')
    const algn = pPr?.getAttribute('algn')
    return {
      text,
      bullet: !!kid(pPr, 'a:buChar'),
      numbered: !!kid(pPr, 'a:buAutoNum'),
      align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'l' ? 'left' : undefined,
      rPr: kid(pieces.find((c) => c.tagName === 'a:r') ?? null, 'a:rPr')
    }
  })
}

/** Default boxes for placeholders that inherit their position from the slide layout. */
function placeholderBox(type: string | null) {
  if (type === 'title' || type === 'ctrTitle') return { x: 80, y: 48, w: SLIDE_W - 160, h: 110 }
  if (type === 'subTitle') return { x: 80, y: 380, w: SLIDE_W - 160, h: 90 }
  return { x: 80, y: 190, w: SLIDE_W - 160, h: SLIDE_H - 254 }
}

function readShape(node: Element, geometry: (spPr: Element | null) => Geometry | null): SlideElement | null {
  const ph = all(node, 'p:ph')[0]
  const phType = ph ? ph.getAttribute('type') ?? 'body' : null
  const spPr = kid(node, 'p:spPr')
  const g = geometry(spPr) ?? (ph ? placeholderBox(phType) : null)
  if (!g) return null

  const txBody = kid(node, 'p:txBody')
  const paras = paragraphs(txBody)
  const text = paras.map((p) => p.text).join('\n').replace(/\n+$/, '')
  const rPr = paras.find((p) => p.rPr)?.rPr ?? null
  const anchor = kid(txBody, 'a:bodyPr')?.getAttribute('anchor')
  const isTitle = phType === 'title' || phType === 'ctrTitle'
  const numbered = paras.some((p) => p.numbered)
  const style: TextStyle = {
    fontSize: rPr?.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : isTitle ? 40 : 20,
    bold: rPr?.getAttribute('b') === '1' || undefined,
    italic: rPr?.getAttribute('i') === '1' || undefined,
    underline: (rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none') || undefined,
    strike: (rPr?.getAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike') || undefined,
    color: srgb(rPr),
    align: paras[0]?.align ?? (phType === 'ctrTitle' ? 'center' : undefined),
    valign: (anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : undefined) as VAlign | undefined,
    numbered: numbered || undefined,
    bullets: (!numbered && (paras.some((p) => p.bullet) || (phType === 'body' && paras.length > 1))) || undefined
  }

  const prst = kid(spPr, 'a:prstGeom')?.getAttribute('prst') ?? 'rect'
  const fill = srgb(spPr)
  const ln = kid(spPr, 'a:ln')
  const stroke = srgb(ln)
  const isLine = node.tagName === 'p:cxnSp' || FROM_PRESET[prst] === 'line'

  if (!isLine && !fill && !stroke && (ph || prst === 'rect')) {
    if (!text && !ph) return null
    return {
      id: newId(), kind: 'text', ...g, text, style,
      placeholder: isTitle ? 'title' : phType === 'subTitle' ? 'subtitle' : ph ? 'body' : undefined
    }
  }
  return {
    id: newId(), kind: 'shape', shape: isLine ? 'line' : FROM_PRESET[prst] ?? 'rect', ...g,
    fill: isLine ? null : fill ?? null,
    stroke: stroke ?? null,
    strokeWidth: ln?.getAttribute('w') ? Math.max(1, Math.round(Number(ln.getAttribute('w')) / 12700)) : stroke ? 2 : 0,
    text, style
  }
}
