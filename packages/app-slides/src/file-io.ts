import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { DOMParser as XmlParser } from '@xmldom/xmldom'
import type { FileFilter } from '@bear/core'
import {
  newId, PX_PER_IN, SLIDE_H, SLIDE_W,
  type Align, type Presentation, type ShapeKind, type Slide, type SlideElement, type TextStyle, type VAlign
} from './model'
import { fontFamily, getTheme } from './themes'

export const SAVE_FILTERS: FileFilter[] = [{ name: 'PowerPoint presentation', extensions: ['pptx'] }]
export const OPEN_FILTERS: FileFilter[] = [
  { name: 'Presentations', extensions: ['pptx'] },
  { name: 'All files', extensions: ['*'] }
]
export const SAVABLE = new Set(['pptx'])

/** Bear's own copy of the presentation inside the .pptx, so reopening in Bear is lossless. */
const NATIVE_PART = 'bear/presentation.json'

const inch = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000
const hex = (c?: string | null) => (c ? c.replace('#', '').slice(0, 6).toUpperCase() : undefined)

// ---------- Export ----------

const PPTX_SHAPE: Record<ShapeKind, string> = {
  rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', arrow: 'rightArrow', line: 'line'
}

function textOptions(style: TextStyle, theme: ReturnType<typeof getTheme>, placeholder: string | undefined, fallbackColor: string) {
  return {
    fontSize: style.fontSize ?? 18,
    fontFace: fontFamily(theme, style.font, placeholder),
    color: hex(style.color ?? fallbackColor),
    bold: style.bold,
    italic: style.italic,
    underline: style.underline ? { style: 'sng' as const } : undefined,
    align: style.align ?? 'left',
    valign: style.valign ?? 'top',
    margin: 6
  }
}

function runs(text: string, bullets?: boolean) {
  return text.split('\n').map((line) => ({ text: line, options: { bullet: bullets && line.trim() ? true : false, breakLine: true } }))
}

export async function exportPptx(p: Presentation): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Bear Slides'
  const theme = getTheme(p.theme)

  for (const slide of p.slides) {
    const s = pptx.addSlide()
    const bg = slide.background ?? theme.backgroundSolid
    s.background = { color: hex(bg.startsWith('#') ? bg : theme.backgroundSolid) }
    for (const el of slide.elements) {
      const box = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h) }
      if (el.kind === 'image') {
        s.addImage({ data: el.src.replace(/^data:/, ''), ...box })
      } else if (el.kind === 'text') {
        if (!el.text) continue // empty placeholders don't appear in a finished deck
        const color = el.placeholder === 'title' ? theme.title : theme.text
        s.addText(runs(el.text, el.style.bullets), { ...box, ...textOptions(el.style, theme, el.placeholder, color) })
      } else {
        const shape = PPTX_SHAPE[el.shape] as PptxGenJS.ShapeType
        const look = {
          ...box,
          ...(el.shape === 'line' ? { h: 0 } : {}),
          fill: el.fill ? { color: hex(el.fill) } : undefined,
          line: el.stroke ? { color: hex(el.stroke), width: el.strokeWidth ?? 2 } : undefined
        }
        if (el.text) s.addText(runs(el.text, el.style.bullets), { shape, ...look, ...textOptions(el.style, theme, undefined, '#ffffff') })
        else s.addShape(shape, look)
      }
    }
    if (slide.notes) s.addNotes(slide.notes)
  }

  const zip = await JSZip.loadAsync((await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer)
  zip.file(NATIVE_PART, JSON.stringify(p))
  // Every part in an Office file needs a content type, or PowerPoint offers to "repair" it.
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('Extension="json"')) {
    zip.file('[Content_Types].xml', types.replace(/(<Types[^>]*>)/, '$1<Default Extension="json" ContentType="application/json"/>'))
  }
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

export async function readPresentation(data: Uint8Array): Promise<Presentation> {
  const zip = await JSZip.loadAsync(data)
  const native = zip.file(NATIVE_PART)
  if (native) {
    try {
      const p = JSON.parse(await native.async('string')) as Presentation
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

async function importSlide(zip: JSZip, path: string, doc: Document, fit: Fit): Promise<Slide> {
  const rels = await readRels(zip, path)
  const root = doc.documentElement
  const cSld = kid(root, 'p:cSld')
  const background = srgb(kid(cSld, 'p:bg', 'p:bgPr'))
  const elements: SlideElement[] = []

  const geometry = (spPr: Element | null) => {
    const xfrm = kid(spPr, 'a:xfrm')
    const off = kid(xfrm, 'a:off')
    const ext = kid(xfrm, 'a:ext')
    if (!off || !ext) return null
    return {
      x: Math.round(Number(off.getAttribute('x')) * fit.scale + fit.offX),
      y: Math.round(Number(off.getAttribute('y')) * fit.scale + fit.offY),
      w: Math.max(4, Math.round(Number(ext.getAttribute('cx')) * fit.scale)),
      h: Math.max(4, Math.round(Number(ext.getAttribute('cy')) * fit.scale))
    }
  }

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

  return { id: newId('s'), elements, background, notes }
}

function paragraphs(txBody: Element | null): { text: string; bullet: boolean; align?: Align; rPr: Element | null }[] {
  return kids(txBody, 'a:p').map((p) => {
    const pieces = childElements(p).filter((c) => c.tagName === 'a:r' || c.tagName === 'a:fld' || c.tagName === 'a:br')
    const text = pieces.map((c) => (c.tagName === 'a:br' ? '\n' : kid(c, 'a:t')?.textContent ?? '')).join('')
    const pPr = kid(p, 'a:pPr')
    const algn = pPr?.getAttribute('algn')
    return {
      text,
      bullet: !!kid(pPr, 'a:buChar') || !!kid(pPr, 'a:buAutoNum'),
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

function readShape(node: Element, geometry: (spPr: Element | null) => { x: number; y: number; w: number; h: number } | null): SlideElement | null {
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
  const style: TextStyle = {
    fontSize: rPr?.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : isTitle ? 40 : 20,
    bold: rPr?.getAttribute('b') === '1' || undefined,
    italic: rPr?.getAttribute('i') === '1' || undefined,
    underline: (rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none') || undefined,
    color: srgb(rPr),
    align: paras[0]?.align ?? (phType === 'ctrTitle' ? 'center' : undefined),
    valign: (anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : undefined) as VAlign | undefined,
    bullets: paras.some((p) => p.bullet) || (phType === 'body' && paras.length > 1) || undefined
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
