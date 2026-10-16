import mammoth from 'mammoth'
import type { JSONContent } from '@tiptap/core'
import type { PageLayout } from './layout'
import { readNative } from './native'

/** Style mappings beyond mammoth's defaults, so more Word formatting survives import. */
const STYLE_MAP = [
  'u => u',
  'strike => s',
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh"
]

export interface ImportedDocx {
  /** Exact content, when the file was saved by Bear and not changed elsewhere since. */
  json?: JSONContent
  layout?: PageLayout
  /** Otherwise, the Word content converted to HTML (images as data URLs). */
  html: string
  warnings: string[]
}

/** Read .docx bytes into something the editor can load. */
export async function importDocx(data: Uint8Array): Promise<ImportedDocx> {
  const native = await readNative(data)
  if (native) return { json: native.doc, layout: native.layout, html: '', warnings: [] }
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  // The browser build reads `arrayBuffer`; the Node build (used by tests) reads `buffer`.
  const input = { arrayBuffer, buffer: arrayBuffer } as unknown as { arrayBuffer: ArrayBuffer }
  const result = await mammoth.convertToHtml(input, { styleMap: STYLE_MAP })
  return {
    html: result.value,
    warnings: result.messages.filter((m) => m.type === 'warning').map((m) => m.message)
  }
}
