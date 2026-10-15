import { useEffect, useId, useRef, useState } from 'react'
import { IslandBoundary } from './IslandBoundary'
import { DEFAULT_MIX, MIX_KEY, clampMix, isReadable, mixToCss, parseSavedMix, surprise, type Mix } from '../lib/themeMixer'

const FIELDS = [
  { key: 'hue', label: 'Hue shift', min: -180, max: 180, step: 5, unit: '°' },
  { key: 'round', label: 'Roundness', min: 0, max: 2, step: 0.05, unit: '×' },
  { key: 'speed', label: 'Animation speed', min: 0.25, max: 2, step: 0.05, unit: '×' }
] as const

function applyToPage(mix: Mix) {
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(mixToCss(mix))) style.setProperty(name, value)
}

function ThemeMixerInner() {
  const uid = useId()
  const [mix, setMix] = useState<Mix>(DEFAULT_MIX)
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState('')
  const lastReadable = useRef<Mix>(DEFAULT_MIX)

  useEffect(() => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(MIX_KEY)
    } catch {
      /* storage unavailable: keep defaults */
    }
    const saved = parseSavedMix(raw)
    lastReadable.current = saved
    setMix(saved)
    setReady(true)
  }, [])

  const commit = (candidate: Mix) => {
    const next = clampMix(candidate)
    if (!isReadable(next)) {
      setMix(lastReadable.current)
      setNote("That mix would make the text hard to read, so I kept your last one.")
      return
    }
    lastReadable.current = next
    setMix(next)
    setNote('')
    applyToPage(next)
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: the mix just won't persist */
    }
  }

  const reset = () => {
    lastReadable.current = DEFAULT_MIX
    setMix(DEFAULT_MIX)
    setNote('')
    applyToPage(DEFAULT_MIX)
    try {
      localStorage.removeItem(MIX_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mixer" data-theme-mixer>
      {FIELDS.map((f) => {
        const id = `${uid}-${f.key}`
        return (
          <div className="mixer__row" key={f.key}>
            <label htmlFor={id}>{f.label}</label>
            <input
              id={id}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={mix[f.key]}
              disabled={!ready}
              onChange={(e) => commit({ ...mix, [f.key]: Number(e.target.value) })}
            />
            <output htmlFor={id}>
              {Math.round(mix[f.key] * 100) / 100}
              {f.unit}
            </output>
          </div>
        )
      })}
      <div className="mixer__actions">
        <button type="button" className="btn" disabled={!ready} onClick={() => commit(surprise())}>
          Surprise me
        </button>
        <button type="button" className="btn" disabled={!ready} aria-label="Reset mix" onClick={reset}>
          Reset
        </button>
      </div>
      <p className="mixer__note" role="status">
        {note}
      </p>
    </div>
  )
}

export default function ThemeMixer() {
  return (
    <IslandBoundary label="theme-mixer">
      <ThemeMixerInner />
    </IslandBoundary>
  )
}
