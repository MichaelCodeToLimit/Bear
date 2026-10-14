import DOMPurify from 'dompurify'

/**
 * Email bodies are untrusted. They are cleaned with DOMPurify, then shown in a sandboxed iframe
 * (no scripts) whose own Content-Security-Policy blocks all network access except, when the user
 * allows it, remote images.
 */

const FORBID_TAGS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'link', 'base', 'audio', 'video', 'source', 'track', 'portal']

export interface CleanEmail {
  /** A complete HTML document for the iframe's srcdoc. */
  doc: string
  /** How many remote (http/https) images the message tries to load. */
  remoteImages: number
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain-text mail: escape, keep line breaks, and turn web addresses into links. */
export function textToHtml(text: string): string {
  return `<div style="white-space:pre-wrap">${escapeHtml(text).replace(/\bhttps?:\/\/[^\s<>"]+/g, (u) => `<a href="${u}">${u}</a>`)}</div>`
}

export function cleanEmail(html: string | null, text: string, allowRemote: boolean): CleanEmail {
  let remoteImages = 0
  const purify = DOMPurify()
  purify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:)/i.test(href.trim())) el.removeAttribute('href')
      // Links open in the system browser (via the app's window-open handler), never inside Bear.
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? ''
      if (/^https?:/i.test(src)) {
        remoteImages++
        if (!allowRemote) {
          el.setAttribute('data-blocked-src', src)
          el.removeAttribute('src')
          el.setAttribute('alt', el.getAttribute('alt') || '')
        }
      } else if (src && !/^data:image\//i.test(src)) el.removeAttribute('src')
      el.removeAttribute('srcset')
    }
    // Background images in inline styles are remote loads too; the iframe's CSP blocks them unless allowed.
    if (!allowRemote && /url\(\s*['"]?https?:/i.test(el.getAttribute('style') ?? '')) remoteImages++
  })
  const body = html
    ? purify.sanitize(html, { FORBID_TAGS, FORBID_ATTR: ['srcset', 'ping', 'formaction', 'background'], WHOLE_DOCUMENT: false, ALLOW_DATA_ATTR: false })
    : textToHtml(text)
  const imgSrc = allowRemote ? "data: https: http:" : 'data:'
  const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:`
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
html,body{margin:0;padding:0;background:#fff}
body{padding:20px 24px;font:14px/1.5 'Segoe UI',system-ui,sans-serif;color:#1f1f1f;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
img[data-blocked-src]{display:inline-block;min-width:16px;min-height:16px;background:#f1f1f1}
table{max-width:100%}
pre{white-space:pre-wrap}
blockquote{margin:0 0 0 .8em;padding-left:.8em;border-left:3px solid #ccc;color:#555}
</style></head><body>${body}</body></html>`
  return { doc, remoteImages }
}
