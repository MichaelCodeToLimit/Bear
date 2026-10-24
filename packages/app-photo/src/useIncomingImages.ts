import { useCallback, useEffect, type MutableRefObject } from 'react'
import { stripExtension, type OpenedFile } from '@bear/core'
import { memoryBudget } from './io/limits'
import { DAMAGED_SIZE, checkDecodedImage } from './io/openPlan'
import { decodeFlatImageAt, imageExtension, scaleBitmap, scaledSide } from './file-io'
import { imageSize } from './io/imageSize'
import type { PhotoEditor } from './model/editor'

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

interface IncomingOptions {
  hasDoc: boolean
  editorRef: MutableRefObject<PhotoEditor>
  /** Open a file as the document (with the "Open at N%" prompt). */
  openDoc: (f: OpenedFile) => Promise<void>
  /** Ask to scale down an oversized picture; resolves to the scale or throws AbortError. */
  askScale: (name: string, scale: number, reason: string) => Promise<number>
  guard: (label: string, action: () => void) => void
  markNew: (name?: string) => void
  setError: (message: string | null) => void
}

/**
 * Dropped or pasted pictures. With no document (or for .bearphoto/.psd) the first one is opened as the
 * document, unsaved; otherwise each goes through prepareIncomingImage (checkDecodedImage) and is added as a centred layer.
 * Returns the handler for drops; pastes outside text fields are handled here.
 */
export function useIncomingImages({ hasDoc, editorRef, openDoc, askScale, guard, markNew, setError }: IncomingOptions) {
  const addIncoming = useCallback(
    async (files: File[]) => {
      for (const f of files) {
        const ext = imageExtension(f.name, f.type)
        const name = f.name || `image.${ext}`
        const fail = (e: unknown) => {
          if ((e as Error).name !== 'AbortError') setError(`Couldn't add ${name}: ${(e as Error).message}`)
        }
        if (!hasDoc || ext === 'bearphoto' || ext === 'psd') {
          // A dropped file has no path here, so it opens as a new, unsaved document.
          guard('open another file', async () => {
            try {
              await openDoc({ path: '', name, data: new Uint8Array(await f.arrayBuffer()) })
              markNew(stripExtension(name))
            } catch (e) {
              fail(e)
            }
          })
          return
        }
        try {
          const bytes = new Uint8Array(await f.arrayBuffer())
          // Check the size from the header first, so a huge picture is decoded straight at the scale chosen.
          const header = imageSize(bytes, ext)
          let scale = 1
          if (header) {
            const check = checkDecodedImage(header, memoryBudget())
            if (!check.ok) {
              if (check.reason === 'damaged') throw new Error(DAMAGED_SIZE)
              scale = await askScale(name, check.scale, check.reason)
            }
          }
          let pixels = await decodeFlatImageAt(bytes, ext, scale)
          // Then check what was decoded: there may have been no header, or it understated the size (an AVIF
          // grid whose first size box is one tile).
          const after = checkDecodedImage(pixels, memoryBudget())
          if (!after.ok) {
            if (after.reason === 'damaged') throw new Error(DAMAGED_SIZE)
            const s = await askScale(name, after.scale, after.reason)
            pixels = scaleBitmap(pixels, scaledSide(pixels.width, s), scaledSide(pixels.height, s))
          }
          const doc = editorRef.current.doc
          editorRef.current.addLayer({
            name: stripExtension(f.name) || 'Pasted image',
            pixels,
            x: Math.round((doc.width - pixels.width) / 2),
            y: Math.round((doc.height - pixels.height) / 2)
          })
        } catch (e) {
          fail(e)
        }
      }
    },
    [hasDoc, editorRef, openDoc, askScale, guard, markNew, setError]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector('[role=dialog]')) return
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (!images.length) return
      e.preventDefault()
      void addIncoming(images)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addIncoming])

  return addIncoming
}
