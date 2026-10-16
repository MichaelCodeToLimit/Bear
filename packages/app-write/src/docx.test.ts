import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { exportDocx, imageSize, toHex } from './docx-export'
import { importDocx } from './docx-import'
import { DEFAULT_LAYOUT } from './layout'

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, marks })

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Quarterly Report')] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        text('Bold', [{ type: 'bold' }]),
        text(' and '),
        text('italic', [{ type: 'italic' }]),
        text(' and '),
        text('red', [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '14pt' } }]),
        text(' link', [{ type: 'link', attrs: { href: 'https://example.com' } }])
      ]
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('First point')] }] },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [text('Second point')] },
            { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('Nested')] }] }] }
          ]
        }
      ]
    },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [text('Region')] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [text('Sales')] }] }
        ] },
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [text('North')] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph' }] }
        ] }
      ]
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [text('A quote')] }] },
    { type: 'codeBlock', content: [text('let x = 1\nlet y = 2')] },
    { type: 'horizontalRule' },
    { type: 'pageBreak' },
    { type: 'paragraph', content: [{ type: 'image', attrs: { src: PNG } }] },
    { type: 'image', attrs: { src: PNG, width: 2000 } }
  ]
}

/** What Word and other apps read: the .docx without Bear's own copy of the document. */
async function wordOnly(bytes: Uint8Array): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  zip.remove('bear/document.json')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('docx round trip', () => {
  it('exports a valid .docx that imports back with structure intact', async () => {
    const bytes = await exportDocx(doc, DEFAULT_LAYOUT, 'Test')
    expect(bytes[0]).toBe(0x50) // "PK" zip header
    expect(bytes[1]).toBe(0x4b)

    const { html } = await importDocx(await wordOnly(bytes))
    expect(html).toContain('<h1>Quarterly Report</h1>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toMatch(/<ul>.*First point.*<\/ul>/s)
    expect(html).toContain('Nested')
    expect(html).toMatch(/<table>.*Region.*Sales.*North.*<\/table>/s)
    expect(html).toContain('let y = 2')
    expect(html).toMatch(/<img src="data:image\/png;base64,/)
  })

  it('exports an empty document', async () => {
    const bytes = await exportDocx({ type: 'doc', content: [] }, { size: 'A4', landscape: true, margins: 'narrow' })
    const { html } = await importDocx(await wordOnly(bytes))
    expect(html).toBe('')
  })
})

describe('reopening a .docx saved by Bear', () => {
  const rich: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'right' },
        content: [
          text('hi this cool doc', [
            { type: 'bold' }, { type: 'italic' }, { type: 'underline' },
            { type: 'textStyle', attrs: { fontFamily: 'Georgia', fontSize: '18pt', color: '#1d4ed8' } },
            { type: 'highlight', attrs: { color: '#fde68a' } }
          ])
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [text('hi this is a cool doc 2', [
          { type: 'textStyle', attrs: { fontFamily: 'Verdana', color: '#b91c1c' } },
          { type: 'highlight', attrs: { color: '#bbf7d0' } }
        ])]
      },
      { type: 'table', attrs: { tableStyle: 'banded' }, content: (doc.content![3].content) }
    ]
  }
  const layout = { size: 'A4' as const, landscape: true, margins: 'narrow' as const }

  it('keeps every property, and the page setup', async () => {
    const back = await importDocx(await exportDocx(rich, layout))
    expect(back.json).toEqual(rich)
    expect(back.layout).toEqual(layout)
  })

  it('reads the Word content instead when another app changed the file', async () => {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await exportDocx(rich, layout))
    const xml = await zip.file('word/document.xml')!.async('string')
    zip.file('word/document.xml', xml.replace('hi this cool doc', 'edited in another app'))
    const back = await importDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect(back.json).toBeUndefined()
    expect(back.html).toContain('edited in another app')
  })
})

describe('helpers', () => {
  it('normalises colours', () => {
    expect(toHex('#abc')).toBe('AABBCC')
    expect(toHex('rgb(255, 0, 16)')).toBe('FF0010')
    expect(toHex('var(--x)')).toBeUndefined()
  })

  it('reads PNG dimensions', () => {
    const bin = atob(PNG.split(',')[1])
    expect(imageSize(Uint8Array.from(bin, (c) => c.charCodeAt(0)))).toEqual({ w: 1, h: 1 })
  })
})

describe('table styles in .docx', () => {
  const cell = (type: string, text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
    type, attrs: { colspan: 1, rowspan: 1, ...attrs }, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  })
  const tableDoc = (tableStyle: string): JSONContent => ({
    type: 'doc',
    content: [{
      type: 'table',
      attrs: { tableStyle },
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableHeader', 'Score')] },
        { type: 'tableRow', content: [cell('tableCell', 'Ann', { backgroundColor: '#ffeeaa', verticalAlign: 'middle' }), cell('tableCell', '9')] },
        { type: 'tableRow', content: [cell('tableCell', 'Bob'), cell('tableCell', '7')] }
      ]
    }]
  })
  const documentXml = async (doc: JSONContent) => {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await exportDocx(doc, DEFAULT_LAYOUT))
    return zip.file('word/document.xml')!.async('string')
  }

  it('writes accent headers, cell shading and vertical alignment', async () => {
    const xml = await documentXml(tableDoc('accent'))
    expect(xml).toContain('w:fill="0F766E"') // accent header
    expect(xml).toMatch(/<w:color w:val="FFFFFF"\/>/) // white header text
    expect(xml).toContain('w:fill="FFEEAA"') // explicit cell shading
    expect(xml).toContain('<w:vAlign w:val="center"/>')
  })

  it('bands rows and drops vertical borders for the matching styles', async () => {
    expect(await documentXml(tableDoc('banded'))).toContain('w:fill="F3F7F6"')
    const minimal = await documentXml(tableDoc('minimal'))
    expect(minimal).toMatch(/<w:insideV w:val="none"/)
  })
})
