import { useState } from 'react'
import { Button, Modal } from '@bear/ui'
import { MAX_SIDE } from '../io/limits'
import { sizeProblem } from '../NewImageDialog'

const field = 'h-8 w-24 rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]'

/** The other side for `side`, keeping the w:h ratio (at least 1 px). */
const keep = (side: number, ratio: number) => Math.max(1, Math.round(side * ratio))

/** Image › Image size: resample every layer to a new pixel size (bilinear). */
export function ImageSizeDialog(props: { accent: string; width: number; height: number; onApply: (w: number, h: number) => void; onClose: () => void }) {
  const [w, setW] = useState(props.width)
  const [h, setH] = useState(props.height)
  const [linked, setLinked] = useState(true)
  const problem = sizeProblem(w, h)
  const changeW = (n: number) => {
    setW(n)
    if (linked && Number.isFinite(n) && n > 0) setH(keep(n, props.height / props.width))
  }
  const changeH = (n: number) => {
    setH(n)
    if (linked && Number.isFinite(n) && n > 0) setW(keep(n, props.width / props.height))
  }
  const apply = () => !problem && props.onApply(w, h)
  return (
    <Modal
      title="Image size"
      onClose={props.onClose}
      footer={
        <>
          <Button primary accent={props.accent} disabled={!!problem} onClick={apply}>OK</Button>
          <Button onClick={props.onClose}>Cancel</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <p className="text-muted">Currently {props.width} × {props.height} px. Every layer is resampled (bilinear).</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">Width <input type="number" aria-label="Width" min={1} max={MAX_SIDE} value={w} onChange={(e) => changeW(Number(e.target.value))} className={field} /></label>
          <label className="flex items-center gap-2">Height <input type="number" aria-label="Height" min={1} max={MAX_SIDE} value={h} onChange={(e) => changeH(Number(e.target.value))} className={field} /></label>
          <span className="text-muted">px</span>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} /> Keep aspect ratio
        </label>
        {problem && <p className="text-[12px] text-red-700 dark:text-red-300">{problem}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
