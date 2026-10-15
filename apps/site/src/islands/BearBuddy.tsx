import { useEffect, useRef, useState } from 'react'
import { useMotion } from './useMotion'
import { IslandBoundary } from './IslandBoundary'

const MOODS = ['wave', 'dance', 'sleep'] as const
type Mood = (typeof MOODS)[number]

const MAX_PUPIL = 6
const MAX_TILT = 8

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function BearBuddyInner() {
  const motion = useMotion()
  const [mood, setMood] = useState<Mood>('wave')
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<SVGGElement>(null)
  const pupilsRef = useRef<Array<SVGCircleElement | null>>([])

  useEffect(() => {
    const look = (x: number, y: number) => {
      pupilsRef.current.forEach((p) => p?.setAttribute('transform', `translate(${+x.toFixed(2)} ${+y.toFixed(2)})`))
    }
    const tilt = (deg: number) => headRef.current?.setAttribute('transform', `rotate(${+deg.toFixed(2)} 100 130)`)

    if (motion === 'off' || mood === 'sleep') {
      look(0, 0)
      tilt(0)
      return
    }
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const svg = svgRef.current
        if (!svg) return
        const r = svg.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height * 0.45)
        const dist = Math.hypot(dx, dy) || 1
        const reach = clamp(dist / 140, 0, 1) * MAX_PUPIL
        look((dx / dist) * reach, (dy / dist) * reach)
        tilt(clamp(dx / 300, -1, 1) * MAX_TILT)
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [motion, mood])

  const next = () => setMood((m) => MOODS[(MOODS.indexOf(m) + 1) % MOODS.length])

  return (
    <div className="buddy" data-bear-buddy data-mood={mood}>
      <svg ref={svgRef} className="buddy__svg" viewBox="0 0 200 220" role="img" aria-label={`A friendly bear, feeling ${mood}`}>
        <g className="buddy__body">
          <ellipse cx="100" cy="185" rx="48" ry="40" fill="#a9713f" />
          <ellipse cx="100" cy="190" rx="30" ry="26" fill="#e9c9a0" />
          <ellipse cx="62" cy="206" rx="16" ry="10" fill="#8f5c30" />
          <ellipse cx="138" cy="206" rx="16" ry="10" fill="#8f5c30" />
          <g className="buddy__arm">
            <ellipse cx="146" cy="168" rx="11" ry="26" fill="#a9713f" transform="rotate(-25 146 168)" />
          </g>
          <ellipse cx="54" cy="168" rx="11" ry="26" fill="#a9713f" transform="rotate(25 54 168)" />
        </g>
        <g ref={headRef} className="buddy__head" transform="rotate(0 100 130)">
          <circle cx="52" cy="58" r="20" fill="#a9713f" />
          <circle cx="52" cy="58" r="11" fill="#e9c9a0" />
          <circle cx="148" cy="58" r="20" fill="#a9713f" />
          <circle cx="148" cy="58" r="11" fill="#e9c9a0" />
          <ellipse cx="100" cy="100" rx="62" ry="56" fill="#a9713f" />
          <ellipse cx="100" cy="118" rx="26" ry="20" fill="#e9c9a0" />
          <ellipse cx="100" cy="109" rx="9" ry="6.5" fill="#3b2a1a" />
          <path d="M100 115 v6 M92 124 q8 6 16 0" fill="none" stroke="#3b2a1a" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="68" cy="116" r="8" fill="#e58b7a" opacity="0.45" />
          <circle cx="132" cy="116" r="8" fill="#e58b7a" opacity="0.45" />
          <g className="buddy__eyes">
            {[74, 126].map((cx, i) => (
              <g key={cx}>
                <circle cx={cx} cy="88" r="12" fill="#fffaf2" />
                <circle
                  data-pupil
                  ref={(el) => {
                    pupilsRef.current[i] = el
                  }}
                  cx={cx}
                  cy="88"
                  r="5.5"
                  fill="#3b2a1a"
                  transform="translate(0 0)"
                />
              </g>
            ))}
          </g>
          <g className="buddy__lids" fill="none" stroke="#3b2a1a" strokeWidth="3" strokeLinecap="round">
            <path d="M62 90 q12 9 24 0" />
            <path d="M114 90 q12 9 24 0" />
          </g>
        </g>
        <text className="buddy__zzz" x="150" y="40" fontSize="22" fontWeight="700" fill="#7a6450" aria-hidden="true">
          z z
        </text>
      </svg>
      <button type="button" className="btn buddy__mood" onClick={next} aria-label={`Change mood, now ${mood}`}>
        Mood: {mood}
      </button>
    </div>
  )
}

export default function BearBuddy() {
  return (
    <IslandBoundary label="bear-buddy">
      <BearBuddyInner />
    </IslandBoundary>
  )
}
