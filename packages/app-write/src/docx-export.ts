import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat,
  PageBreak, PageOrientation, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  VerticalAlignTable, WidthType, convertInchesToTwip, type IParagraphOptions, type ParagraphChild
} from 'docx'
import type { JSONContent } from '@tiptap/core'
import { contentWidthPx, pageInches, type PageLayout } from './layout'

type Para = Paragraph | Table
type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

const HEADINGS = [
  HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6
]

const ALIGN: Record<string, Align> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

/** Normalise a CSS colour (#rgb, #rrggbb, rgb()) to the RRGGBB form Word wants. */
export function toHex(css: string | null | undefined): string | undefined {
  if (!css) return undefined
  const c = css.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(c)
  if (m) return m[1].split('').map((x) => x + x).join('').toUpperCase()
  m = /^#([0-9a-f]{6})$/i.exec(c)
  if (m) return m[1].toUpperCase()
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c)
  if (m) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  return undefined
}

/** Parse "12pt" / "16px" into Word half-points. */
function halfPoints(size: string | undefined): number | undefined {
  if (!size) return undefined
  const m = /^([\d.]+)(pt|px)?$/.exec(size.trim())
  if (!m) return undefined
  const pt = m[2] === 'px' ? Number(m[1]) * 0.75 : Number(m[1])
  return Math.round(pt * 2)
}

function dataUrlBytes(src: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i.exec(src)
  if (!m) return null
  const bin = atob(m[2])
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  const t = m[1].toLowerCase()
  return { data, type: t === 'jpeg' ? 'jpg' : (t as 'png' | 'jpg' | 'gif' | 'bmp') }
}

/** Read pixel dimensions from PNG/GIF/JPEG headers so images keep their aspect ratio. */
export function imageSize(data: Uint8Array): { w: number; h: number } | null {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) }
  if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49) return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null
      const marker = data[i + 1]
      const len = dv.getUint16(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) }
      }
      i += 2 + len
    }
  }
  return null
}

interface Ctx {
  maxImageWidth: number
  /** Forced text colour / weight, e.g. white bold text in an accent header row. */
  color?: string
  bold?: boolean
}

function runsOf(nodes: JSONContent[] | undefined, ctx: Ctx, extra: { font?: string; italics?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }))
      continue
    }
    if (n.type === 'image') {
      const img = imageRun(n, ctx)
      if (img) out.push(img)
      continue
    }
    if (n.type !== 'text' || !n.text) continue

    const marks = n.marks ?? []
    const has = (t: string) => marks.find((m) => m.type === t)
    const style = has('textStyle')?.attrs ?? {}
    const highlight = has('highlight')
    const link = has('link')
    const fill = highlight ? toHex(highlight.attrs?.color) ?? 'FFF59D' : undefined

    const run = new TextRun({
      text: n.text,
      bold: !!has('bold') || ctx.bold || undefined,
      italics: !!has('italic') || extra.italics || undefined,
      underline: has('underline') || link ? {} : undefined,
      strike: !!has('strike') || undefined,
      superScript: !!has('superscript') || undefined,
      subScript: !!has('subscript') || undefined,
      color: toHex(style.color) ?? (link ? '0563C1' : ctx.color),
      font: has('code') ? 'Consolas' : (style.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || extra.font),
      size: halfPoints(style.fontSize),
      shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined
    })
    out.push(link?.attrs?.href ? new ExternalHyperlink({ link: link.attrs.href, children: [run] }) : run)
  }
  return out
}

function imageRun(n: JSONContent, ctx: Ctx): ImageRun | null {
  const parsed = dataUrlBytes(n.attrs?.src ?? '')
  if (!parsed) return null
  const natural = imageSize(parsed.data) ?? { w: 400, h: 300 }
  let w = Number(n.attrs?.width) || natural.w
  let h = Number(n.attrs?.height) || Math.round((w * natural.h) / natural.w)
  if (w > ctx.maxImageWidth) {
    h = Math.round((h * ctx.maxImageWidth) / w)
    w = ctx.maxImageWidth
  }
  return new ImageRun({ type: parsed.type, data: parsed.data, transformation: { width: w, height: h } })
}

function paragraph(n: JSONContent, ctx: Ctx, opts: Partial<IParagraphOptions> = {}, runExtra = {}): Paragraph {
  const align = ALIGN[n.attrs?.textAlign as string]
  return new Paragraph({ ...opts, alignment: align, children: runsOf(n.content, ctx, runExtra) })
}

function listItems(list: JSONContent, level: number, ctx: Ctx): Paragraph[] {
  const reference = list.type === 'orderedList' ? 'numbers' : 'bullets'
  const out: Paragraph[] = []
  for (const item of list.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...listItems(child, Math.min(level + 1, 8), ctx))
      } else if (child.type === 'paragraph' || child.type === 'heading') {
        out.push(paragraph(child, ctx, { numbering: { reference, level } }))
      }
    }
  }
  return out
}

/** Header fill and text colour per table style (matches the editor's CSS). */
const HEADER_LOOK: Record<string, { fill?: string; color?: string }> = {
  grid: { fill: 'F2F2F2' },
  accent: { fill: '0F766E', color: 'FFFFFF' },
  banded: { fill: 'D6E9E1' },
  minimal: {}
}

const V_ALIGN: Record<string, (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable]> = {
  top: VerticalAlignTable.TOP,
  middle: VerticalAlignTable.CENTER,
  bottom: VerticalAlignTable.BOTTOM
}

function table(n: JSONContent, ctx: Ctx): Table {
  const style = (n.attrs?.tableStyle as string) ?? 'grid'
  const look = HEADER_LOOK[style] ?? HEADER_LOOK.grid
  const rows = (n.content ?? []).map((row, rowIndex) => {
    const isHeader = row.content?.every((c) => c.type === 'tableHeader') ?? false
    return new TableRow({
      tableHeader: isHeader,
      children: (row.content ?? []).map((cell) => {
        const header = cell.type === 'tableHeader'
        // Explicit cell shading wins; then the style's header / banded-row colours.
        const fill =
          toHex(cell.attrs?.backgroundColor) ??
          (header ? look.fill : style === 'banded' && rowIndex % 2 === 1 ? 'F3F7F6' : undefined)
        const cellCtx = header && look.color ? { ...ctx, color: look.color, bold: true } : header ? { ...ctx, bold: true } : ctx
        const blocks = blocksOf(cell.content, cellCtx).filter((b): b is Paragraph => b instanceof Paragraph)
        return new TableCell({
          columnSpan: cell.attrs?.colspan > 1 ? cell.attrs?.colspan : undefined,
          rowSpan: cell.attrs?.rowspan > 1 ? cell.attrs?.rowspan : undefined,
          shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
          verticalAlign: V_ALIGN[cell.attrs?.verticalAlign as string],
          borders: style === 'minimal' && header ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: '333333' } } : undefined,
          children: blocks.length ? blocks : [new Paragraph('')]
        })
      })
    })
  })
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'C8C8C8' }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: style === 'minimal' ? { top: line, bottom: line, left: none, right: none, insideHorizontal: line, insideVertical: none } : undefined
  })
}

function blocksOf(nodes: JSONContent[] | undefined, ctx: Ctx): Para[] {
  const out: Para[] = []
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'paragraph':
        out.push(paragraph(n, ctx))
        break
      case 'heading':
        out.push(paragraph(n, ctx, { heading: HEADINGS[(n.attrs?.level ?? 1) - 1] }))
        break
      case 'bulletList':
      case 'orderedList':
        out.push(...listItems(n, 0, ctx))
        break
      case 'blockquote':
        for (const c of n.content ?? []) {
          out.push(paragraph(c, ctx, {
            indent: { left: convertInchesToTwip(0.5) },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 8 } }
          }, { italics: true }))
        }
        break
      case 'codeBlock': {
        const text = (n.content ?? []).map((c) => c.text ?? '').join('')
        for (const line of text.split('\n')) {
          out.push(new Paragraph({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F4F4' },
            children: [new TextRun({ text: line, font: 'Consolas', size: 20 })]
          }))
        }
        break
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA', space: 1 } } }))
        break
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }))
        break
      case 'table':
        out.push(table(n, ctx))
        out.push(new Paragraph(''))
        break
      case 'image': {
        const img = imageRun(n, ctx)
        if (img) out.push(new Paragraph({ children: [img] }))
        break
      }
    }
  }
  return out
}

const LIST_LEVELS = (format: (typeof LevelFormat)[keyof typeof LevelFormat], texts: string[]) =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format,
    text: format === LevelFormat.BULLET ? texts[level % texts.length] : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: convertInchesToTwip(0.375 * (level + 1)), hanging: convertInchesToTwip(0.25) } } }
  }))

/** Convert a TipTap document into a Word document object. */
export function buildDocx(doc: JSONContent, layout: PageLayout, title = 'Document'): Document {
  const page = pageInches(layout)
  const ctx: Ctx = { maxImageWidth: contentWidthPx(layout) }
  const children = blocksOf(doc.content, ctx)

  return new Document({
    title,
    creator: 'Bear Write',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: LIST_LEVELS(LevelFormat.BULLET, ['•', '◦', '▪']) },
        { reference: 'numbers', levels: LIST_LEVELS(LevelFormat.DECIMAL, []) }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            // Word expects portrait dimensions plus an orientation flag; it swaps them itself.
            size: {
              width: convertInchesToTwip(layout.landscape ? page.h : page.w),
              height: convertInchesToTwip(layout.landscape ? page.w : page.h),
              orientation: layout.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: convertInchesToTwip(page.margin),
              bottom: convertInchesToTwip(page.margin),
              left: convertInchesToTwip(page.margin),
              right: convertInchesToTwip(page.margin)
            }
          }
        },
        children: children.length ? children : [new Paragraph('')]
      }
    ]
  })
}

export async function exportDocx(doc: JSONContent, layout: PageLayout, title?: string): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toArrayBuffer(buildDocx(doc, layout, title)))
}
