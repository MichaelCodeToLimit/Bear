export interface Mix {
  hue: number
  round: number
  speed: number
}

export const DEFAULT_MIX: Mix = { hue: 0, round: 1, speed: 1 }
export const MIX_KEY = 'bear-mix'

const RANGES = {
  hue: [-180, 180],
  round: [0, 2],
  speed: [0.25, 2]
} as const

const clampField = (key: keyof Mix, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_MIX[key]
  const [lo, hi] = RANGES[key]
  return Math.min(hi, Math.max(lo, v))
}

export function clampMix(m: Partial<Mix>): Mix {
  return { hue: clampField('hue', m.hue), round: clampField('round', m.round), speed: clampField('speed', m.speed) }
}

export function mixToCss(m: Mix): Record<'--hue-shift' | '--round' | '--motion-speed', string> {
  return { '--hue-shift': `${m.hue}deg`, '--round': String(m.round), '--motion-speed': String(m.speed) }
}

/* ---------- Colour maths (hex <-> OKLCH) ---------- */

const LIGHT = { bg: '#fbf4ea', ink: '#3b2a1a' }
const DARK = { bg: '#2a1d14', ink: '#fbf4ea' }

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Rotates a hex colour's OKLCH hue by `deg`, keeping lightness and chroma (clipped to sRGB). */
function rotate(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, b2)
  const h = Math.atan2(b2, a) + (deg * Math.PI) / 180
  const a2 = C * Math.cos(h)
  const bb = C * Math.sin(h)
  const l3 = (L + 0.3963377774 * a2 + 0.2158037573 * bb) ** 3
  const m3 = (L - 0.1055613458 * a2 - 0.0638541728 * bb) ** 3
  const s3 = (L - 0.0894841775 * a2 - 1.291485548 * bb) ** 3
  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3
  ]
  const out = lin.map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255))
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function mixedPalette(m: Mix, dark: boolean): { bg: string; ink: string } {
  const base = dark ? DARK : LIGHT
  return { bg: rotate(base.bg, m.hue), ink: rotate(base.ink, m.hue) }
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function isReadable(m: Mix): boolean {
  return [false, true].every((dark) => {
    const p = mixedPalette(m, dark)
    return contrastRatio(p.bg, p.ink) >= 4.5
  })
}

/** The inline head script in BaseLayout.astro mirrors this parse; keep the two in sync. */
export function parseSavedMix(raw: string | null): Mix {
  if (raw === null) return DEFAULT_MIX
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return DEFAULT_MIX
    const mix = clampMix(parsed as Partial<Mix>)
    return isReadable(mix) ? mix : DEFAULT_MIX
  } catch {
    return DEFAULT_MIX
  }
}

export function surprise(rand: () => number = Math.random): Mix {
  for (let i = 0; i < 20; i++) {
    const mix = clampMix({
      hue: Math.round(-180 + rand() * 360),
      round: Math.round(rand() * 40) / 20,
      speed: Math.round((0.25 + rand() * 1.75) * 20) / 20
    })
    if (isReadable(mix)) return mix
  }
  return DEFAULT_MIX
}
