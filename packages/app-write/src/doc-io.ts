import type { Editor, JSONContent } from '@tiptap/core'
import { extensionOf, type FileFilter } from '@bear/core'
import { exportDocx } from './docx-export'
import { importDocx } from './docx-import'
import type { PageLayout } from './layout'

export const SAVE_FILTERS: FileFilter[] = [
  { name: 'Word document', extensions: ['docx'] },
  { name: 'Web page', extensions: ['html'] },
  { name: 'Plain text', extensions: ['txt'] }
]

export const OPEN_FILTERS: FileFilter[] = [
  { name: 'Documents', extensions: ['docx', 'html', 'htm', 'txt', 'md'] },
  { name: 'All files', extensions: ['*'] }
]

/** Formats we can write back to without converting. */
export const SAVABLE = new Set(['docx', 'html', 'htm', 'txt', 'md'])

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export interface LoadedFile {
  /** Editor content: exact JSON (a .docx Bear saved) or HTML. */
  content: JSONContent | string
  /** Page setup saved with the file, if any. */
  layout?: PageLayout
  warnings: string[]
}

/** Turn file bytes into editor content, based on the file extension. */
export async function readFile(path: string, data: Uint8Array): Promise<LoadedFile> {
  const ext = extensionOf(path)
  if (ext === 'docx') {
    const r = await importDocx(data)
    return { content: r.json ?? r.html, layout: r.layout, warnings: r.warnings }
  }
  const text = new TextDecoder().decode(data)
  if (ext === 'html' || ext === 'htm') {
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text)
    return { content: body ? body[1] : text, warnings: [] }
  }
  return { content: plainTextToHtml(text), warnings: [] }
}

/** Serialise the editor into the format implied by the target path. */
export async function editorToFile(editor: Editor, path: string, layout: PageLayout, title: string): Promise<Uint8Array> {
  const ext = extensionOf(path)
  if (ext === 'docx') return exportDocx(editor.getJSON(), layout, title)
  if (ext === 'html' || ext === 'htm') {
    const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>\n<body>\n${editor.getHTML()}\n</body></html>\n`
    return new TextEncoder().encode(html)
  }
  return new TextEncoder().encode(editor.getText({ blockSeparator: '\n\n' }))
}
