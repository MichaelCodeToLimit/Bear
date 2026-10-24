import { useState } from 'react'
import { Button, Modal } from '@bear/ui'
import type { Bitmap } from './model/bitmap'
import { createDoc, type PhotoDoc } from './model/doc'
import { checkOpenSize, MAX_SIDE, memoryBudget } from './io/limits'
import { decodeFlatImage, docFromBitmap, imageExtension } from './file-io'

type PresetId = 'screen' | 'a4' | 'square' | 'custom' | 'clipboard'

export const PRESETS: { id: PresetId; label: string; size?: [number, number] }[] = [
  { id: 'screen', label: 'Screen', size: [1920, 1080] },
  { id: 'a4', label: 'A4', size: [2480, 3508] },
  { id: 'square', label: 'Square', size: [1080, 1080] },
  { id: 'custom', label: 'Custom' },
  { id: 'clipboard', label: 'From clipboard' }
]

/** Why a size can't be used, or null if it can. */
export function sizeProblem(w: number, h: number): string | null {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return 'Width and height must be whole numbers of at least 1 pixel.'
  if (w > MAX_SIDE || h > MAX_SIDE) return `Width and height can be at most ${MAX_SIDE.toLocaleString()} pixels.`
  if (!checkOpenSize(w, h, memoryBudget()).ok) return 'An image this large needs more memory than this computer has free.'
  return null
}

async function readClipboardImage(): Promise<Bitmap> {
  let items: ClipboardItems
  try {
    items = await navigator.clipboard.read()
  } catch {
    throw new Error("Photo couldn't read the clipboard.")
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    return decodeFlatImage(new Uint8Array(await blob.arrayBuffer()), imageExtension('', type))
  }
  throw new Error('There is no picture on the clipboard.')
}

const field = 'h-8 w-24 rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)] disabled:opacity-50'

function SizeFields({ w, h, setW, setH, disabled }: { w: number; h: number; setW: (n: number) => void; setH: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2">Width <input type="number" min={1} max={MAX_SIDE} value={w} disabled={disabled} onChange={(e) => setW(Number(e.target.value))} className={field} /></label>
      <label className="flex items-center gap-2">Height <input type="number" min={1} max={MAX_SIDE} value={h} disabled={disabled} onChange={(e) => setH(Number(e.target.value))} className={field} /></label>
      <span className="text-muted">px</span>
    </div>
  )
}

/** New Image: size presets (or the clipboard picture) and a white or transparent background. */
export function NewImageDialog({ accent, onCreate, onClose }: { accent: string; onCreate: (doc: PhotoDoc) => void; onClose: () => void }) {
  const [preset, setPreset] = useState<PresetId>('screen')
  const [w, setW] = useState(1920)
  const [h, setH] = useState(1080)
  const [bg, setBg] = useState<'white' | 'transparent'>('white')
  const [clip, setClip] = useState<Bitmap | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (id: PresetId) => {
    setPreset(id)
    setError(null)
    setClip(null)
    const p = PRESETS.find((x) => x.id === id)!
    if (p.size) {
      setW(p.size[0])
      setH(p.size[1])
    }
    if (id === 'clipboard') {
      try {
        const img = await readClipboardImage()
        setClip(img)
        setW(img.width)
        setH(img.height)
      } catch (e) {
        setError((e as Error).message)
      }
    }
  }

  const problem = preset === 'clipboard' && !clip ? error ?? 'Reading the clipboard…' : sizeProblem(w, h)
  const create = () => {
    if (problem) return
    if (clip) {
      const doc = docFromBitmap(clip)
      // The picture sits on a white layer unless a transparent background was chosen.
      if (bg === 'white') {
        const base = createDoc(clip.width, clip.height, [255, 255, 255, 255]).layers[0]
        doc.layers[0].name = 'Pasted image'
        doc.layers.unshift(base)
      }
      onCreate(doc)
    } else {
      onCreate(createDoc(w, h, bg === 'white' ? [255, 255, 255, 255] : 'transparent'))
    }
  }

  return (
    <Modal
      title="New image"
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button primary accent={accent} disabled={!!problem} onClick={create}>Create</Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => void pick(p.id)}
              className={`rounded border px-3 py-1.5 text-left text-[13px] ${preset === p.id ? 'border-[var(--accent)] bg-active' : 'border-line hover:bg-hover'}`}
            >
              <span className="block font-medium">{p.label}</span>
              {p.size && <span className="block text-[11px] text-muted">{p.size[0]} × {p.size[1]}</span>}
            </button>
          ))}
        </div>
        <SizeFields w={w} h={h} setW={setW} setH={setH} disabled={preset !== 'custom'} />
        <fieldset className="flex items-center gap-4">
          <legend className="mb-1 text-muted">Background</legend>
          <label className="flex items-center gap-1.5"><input type="radio" name="photo-bg" checked={bg === 'white'} onChange={() => setBg('white')} /> White</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="photo-bg" checked={bg === 'transparent'} onChange={() => setBg('transparent')} /> Transparent</label>
        </fieldset>
        {problem && preset !== 'clipboard' ? <p className="text-[12px] text-red-700 dark:text-red-300">{problem}</p> : null}
        {preset === 'clipboard' && <p className={`text-[12px] ${error ? 'text-red-700 dark:text-red-300' : 'text-muted'}`}>{error ?? (clip ? `Picture on the clipboard: ${clip.width} × ${clip.height}` : 'Reading the clipboard…')}</p>}
      </div>
    </Modal>
  )
}

/** Image › Canvas size: change the canvas without resampling, anchored top-left or centred. */
export function CanvasSizeDialog(props: {
  accent: string
  width: number
  height: number
  onApply: (w: number, h: number, anchor: 'tl' | 'c') => void
  onClose: () => void
}) {
  const [w, setW] = useState(props.width)
  const [h, setH] = useState(props.height)
  const [anchor, setAnchor] = useState<'tl' | 'c'>('c')
  const problem = sizeProblem(w, h)
  return (
    <Modal
      title="Canvas size"
      onClose={props.onClose}
      footer={
        <>
          <Button primary accent={props.accent} disabled={!!problem} onClick={() => props.onApply(w, h, anchor)}>OK</Button>
          <Button onClick={props.onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted">Currently {props.width} × {props.height} px. Layers are not resized.</p>
        <SizeFields w={w} h={h} setW={setW} setH={setH} />
        <label className="flex items-center gap-2">
          Anchor
          <select value={anchor} onChange={(e) => setAnchor(e.target.value as 'tl' | 'c')} className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink">
            <option value="c">Centre</option>
            <option value="tl">Top left</option>
          </select>
        </label>
        {problem && <p className="text-[12px] text-red-700 dark:text-red-300">{problem}</p>}
      </div>
    </Modal>
  )
}
