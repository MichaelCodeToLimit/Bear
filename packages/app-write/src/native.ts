import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import type { PageLayout } from './layout'

/**
 * Bear's own copy of the document inside the .docx. Word's format can't hold everything Bear
 * does (and reading it back loses fonts, colours and page setup), so reopening in Bear uses this
 * copy, as long as no other app has changed the document since Bear saved it.
 */
const NATIVE_PART = 'bear/document.json'

interface Native {
  version: 1
  doc: JSONContent
  layout: PageLayout
  /** SHA-256 of word/document.xml as Bear wrote it. A different hash means someone else edited the file. */
  documentHash: string
}

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Add Bear's copy of the document to a .docx Bear has just written. */
export async function embedNative(docx: Uint8Array, doc: JSONContent, layout: PageLayout): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(docx)
  const native: Native = { version: 1, doc, layout, documentHash: await sha256(await zip.file('word/document.xml')!.async('string')) }
  zip.file(NATIVE_PART, JSON.stringify(native))
  // Every part in an Office file needs a content type, or Word offers to "repair" it.
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('Extension="json"')) {
    zip.file('[Content_Types].xml', types.replace(/(<Types[^>]*>)/, '$1<Default Extension="json" ContentType="application/json"/>'))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Bear's copy of the document, if present and still matching the Word content. */
export async function readNative(docx: Uint8Array): Promise<{ doc: JSONContent; layout: PageLayout } | null> {
  try {
    const zip = await JSZip.loadAsync(docx)
    const part = zip.file(NATIVE_PART)
    const xml = zip.file('word/document.xml')
    if (!part || !xml) return null
    const native = JSON.parse(await part.async('string')) as Native
    if (native.version !== 1 || native.doc?.type !== 'doc') return null
    if (native.documentHash !== (await sha256(await xml.async('string')))) return null
    return { doc: native.doc, layout: native.layout }
  } catch {
    return null
  }
}
