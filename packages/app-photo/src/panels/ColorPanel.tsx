import { ArrowLeftRight, RotateCcw } from 'lucide-react'
import type { RGBA } from '../model/bitmap'
import { DEFAULT_COLORS, type PhotoColors } from '../usePhotoEditor'

export function toHex(c: RGBA): string {
  return `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function fromHex(hex: string, alpha = 255): RGBA {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

export const swapColors = (c: PhotoColors): PhotoColors => ({ fg: c.bg, bg: c.fg })
export const resetColors = (): PhotoColors => ({ fg: [...DEFAULT_COLORS.fg], bg: [...DEFAULT_COLORS.bg] })

function Swatch({ label, color, onPick, className }: { label: string; color: RGBA; onPick: (c: RGBA) => void; className: string }) {
  return (
    <input
      type="color"
      title={label}
      aria-label={label}
      value={toHex(color)}
      onChange={(e) => onPick(fromHex(e.target.value, color[3]))}
      className={`absolute h-8 w-8 cursor-pointer rounded border border-line bg-transparent p-0 shadow-sm [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 ${className}`}
    />
  )
}

/** Foreground/background swatches with swap (X) and reset (D). */
export function ColorPanel({ colors, setColors }: { colors: PhotoColors; setColors: (c: PhotoColors) => void }) {
  return (
    <section aria-label="Colour" className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
      <div className="relative h-12 w-12">
        <Swatch label="Background colour" color={colors.bg} onPick={(bg) => setColors({ ...colors, bg })} className="bottom-0 right-0" />
        <Swatch label="Foreground colour" color={colors.fg} onPick={(fg) => setColors({ ...colors, fg })} className="left-0 top-0 z-10" />
      </div>
      <div className="flex flex-col gap-0.5">
        <button title="Swap colours (X)" aria-label="Swap colours" onClick={() => setColors(swapColors(colors))} className="flex h-6 w-6 items-center justify-center rounded text-ink hover:bg-hover">
          <ArrowLeftRight size={13} />
        </button>
        <button title="Reset to black and white (D)" aria-label="Reset colours" onClick={() => setColors(resetColors())} className="flex h-6 w-6 items-center justify-center rounded text-ink hover:bg-hover">
          <RotateCcw size={13} />
        </button>
      </div>
      <div className="text-[11px] leading-4 text-muted">
        <div>{toHex(colors.fg)}</div>
        <div>{toHex(colors.bg)}</div>
      </div>
    </section>
  )
}
