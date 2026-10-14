/** Longest side, in pixels, that pictures are stored at. Phone photos are often 4000px+. */
export const MAX_IMAGE_DIM = 2000

/** Formats that both the editor and .docx files support natively. */
const NATIVE = new Set(['image/png', 'image/jpeg', 'image/gif'])

export interface PreparedImage {
  src: string
  /** Natural size after any downscaling. */
  width: number
  height: number
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/**
 * Turn any image the browser can decode (PNG, JPEG, GIF, WebP, BMP, AVIF, SVG…) into a data URL
 * the document can store and export: converting unsupported formats and shrinking huge photos.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error("This picture format can't be opened. Try saving it as JPEG or PNG first (for example, iPhone HEIC photos).")
    }
    const w = img.naturalWidth || 400
    const h = img.naturalHeight || 300
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h))

    // Already a supported format at a sensible size: keep the original bytes (and GIF animation).
    if (NATIVE.has(file.type) && scale === 1) return { src: await readAsDataUrl(file), width: w, height: h }

    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    canvas.getContext('2d')!.drawImage(img, 0, 0, cw, ch)
    // Photos stay JPEG (small); everything else becomes PNG so transparency survives.
    const src = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
    return { src, width: cw, height: ch }
  } finally {
    URL.revokeObjectURL(url)
  }
}
