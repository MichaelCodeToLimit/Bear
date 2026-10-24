import type { Bitmap } from './model/bitmap'
import { encodePng } from './io/png'

/** Put a bitmap on the system clipboard as a PNG. */
export async function writeImageToClipboard(b: Bitmap): Promise<void> {
  const blob = new Blob([encodePng(b) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/** The first image on the system clipboard as a file, or null when there is none (or it can't be read). */
export async function readClipboardImage(): Promise<File | null> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (!type) continue
      const blob = await item.getType(type)
      const ext = type.slice(6) === 'jpeg' ? 'jpg' : type.slice(6)
      return new File([blob], `Pasted image.${ext}`, { type })
    }
  } catch {
    /* no permission, or nothing readable */
  }
  return null
}
