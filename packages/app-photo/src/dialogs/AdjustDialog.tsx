import { useState } from 'react'
import { ADJUST_TITLES, adjustDefaults, type AdjustKind, type AdjustParams, type AnyAdjustParams } from './adjustOps'
import { CurvesEditor } from './CurvesEditor'
import { DialogFrame, Slider } from './DialogFrame'

export interface AdjustDialogProps {
  kind: AdjustKind
  accent: string
  /** Why the active layer can't be adjusted, if it can't. */
  status: string | null
  /** Every change, for the live preview. */
  onChange: (params: AnyAdjustParams) => void
  onApply: (params: AnyAdjustParams) => void
  onCancel: () => void
  onUndo: () => void
  onRedo: () => void
}

/** Brightness/Contrast, Levels, Curves and Hue/Saturation. The canvas previews every change; nothing is written until Apply. */
export function AdjustDialog(p: AdjustDialogProps) {
  const [params, setParams] = useState<AnyAdjustParams>(() => adjustDefaults(p.kind))
  const set = (next: AnyAdjustParams) => {
    setParams(next)
    p.onChange(next)
  }
  return (
    <DialogFrame
      title={ADJUST_TITLES[p.kind]}
      accent={p.accent}
      status={p.status}
      onApply={() => p.onApply(params)}
      onCancel={p.onCancel}
      onUndo={p.onUndo}
      onRedo={p.onRedo}
    >
      <Fields kind={p.kind} params={params} set={set} />
    </DialogFrame>
  )
}

function Fields({ kind, params, set }: { kind: AdjustKind; params: AnyAdjustParams; set: (p: AnyAdjustParams) => void }) {
  switch (kind) {
    case 'brightness': {
      const v = params as AdjustParams['brightness']
      return (
        <>
          <Slider id="brightness" label="Brightness" value={v.brightness} min={-100} max={100} onChange={(brightness) => set({ ...v, brightness })} />
          <Slider id="contrast" label="Contrast" value={v.contrast} min={-100} max={100} onChange={(contrast) => set({ ...v, contrast })} />
        </>
      )
    }
    case 'levels': {
      const v = params as AdjustParams['levels']
      // Input black stays at least 2 below input white, so the range never collapses.
      return (
        <>
          <Slider id="inBlack" label="Input black" value={v.inBlack} min={0} max={253} onChange={(inBlack) => set({ ...v, inBlack, inWhite: Math.max(v.inWhite, inBlack + 2) })} />
          <Slider id="gamma" label="Gamma" value={v.gamma} min={0.1} max={9.99} step={0.01} onChange={(gamma) => set({ ...v, gamma })} />
          <Slider id="inWhite" label="Input white" value={v.inWhite} min={2} max={255} onChange={(inWhite) => set({ ...v, inWhite, inBlack: Math.min(v.inBlack, inWhite - 2) })} />
          <Slider id="outBlack" label="Output black" value={v.outBlack} min={0} max={255} onChange={(outBlack) => set({ ...v, outBlack })} />
          <Slider id="outWhite" label="Output white" value={v.outWhite} min={0} max={255} onChange={(outWhite) => set({ ...v, outWhite })} />
        </>
      )
    }
    case 'curves': {
      const v = params as AdjustParams['curves']
      return <CurvesEditor points={v.points} onChange={(points) => set({ points })} />
    }
    case 'hsl': {
      const v = params as AdjustParams['hsl']
      return (
        <>
          <Slider id="hue" label="Hue" value={v.hue} min={-180} max={180} unit="°" onChange={(hue) => set({ ...v, hue })} />
          <Slider id="saturation" label="Saturation" value={v.saturation} min={-100} max={100} onChange={(saturation) => set({ ...v, saturation })} />
          <Slider id="lightness" label="Lightness" value={v.lightness} min={-100} max={100} onChange={(lightness) => set({ ...v, lightness })} />
        </>
      )
    }
  }
}
