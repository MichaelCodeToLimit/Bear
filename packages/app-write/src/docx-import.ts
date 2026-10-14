import mammoth from 'mammoth'

/** Style mappings beyond mammoth's defaults, so more Word formatting survives import. */
const STYLE_MAP = [
  'u => u',
  'strike => s',
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh"
]

/** Convert .docx bytes to HTML the editor can load. Images come through as embedded data URLs. */
export async function importDocx(data: Uint8Array): Promise<{ html: string; warnings: string[] }> {
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  // The browser build reads `arrayBuffer`; the Node build (used by tests) reads `buffer`.
  const input = { arrayBuffer, buffer: arrayBuffer } as unknown as { arrayBuffer: ArrayBuffer }
  const result = await mammoth.convertToHtml(input, { styleMap: STYLE_MAP })
  return {
    html: result.value,
    warnings: result.messages.filter((m) => m.type === 'warning').map((m) => m.message)
  }
}
