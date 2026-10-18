import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Presentation, Slide } from '../model'
import { SlideView } from '../SlideView'
import { clickCount, effectKind, frameAt, transitionCss, type ElementFrame } from '../animation'
import { getTheme } from '../themes'

interface Props {
  pres: Presentation
  index: number
  step: number
  animate: boolean
  /** The slide we came from (plays this slide's transition). */
  from: number | null
  width: number
  /** Drawn on top, in slide coordinates (ink). */
  children?: ReactNode
  /** Media plays (audience screen); off for presenter-view previews. */
  live?: boolean
}

/** How a slide looks once all its animations have played (for the outgoing side of a transition). */
function finalFrames(slide: Slide | undefined): Map<string, ElementFrame> {
  if (!slide) return new Map()
  return new Map([...frameAt(slide, clickCount(slide))].map(([id, f]) => [id, { visible: f.visible && effectKind(f.play?.anim.effect ?? 'appear') !== 'exit' }]))
}

/** One slide in a show: its transition in, and its animations at the current step. */
export function ShowSlide({ pres, index, step, animate, from, width, children, live = true }: Props) {
  const theme = getTheme(pres.theme)
  const slide = pres.slides[index]
  const [leaving, setLeaving] = useState<{ index: number; key: number } | null>(null)
  const counter = useRef(0)
  const transition = slide?.transition

  // Keep the previous slide on screen while the transition plays.
  useEffect(() => {
    if (from === null || !transition || transition.type === 'none') {
      setLeaving(null)
      return
    }
    const key = ++counter.current
    setLeaving({ index: from, key })
    const t = setTimeout(() => setLeaving((l) => (l?.key === key ? null : l)), transition.duration + 50)
    return () => clearTimeout(t)
  }, [index, from]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!slide) return null
  let frames: Map<string, ElementFrame> = frameAt(slide, step)
  if (!animate) frames = new Map([...frames].map(([id, f]) => [id, { visible: f.visible }]))
  const css = leaving && transition ? transitionCss(transition.type, transition.duration) : {}
  const height = (width * 9) / 16

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      {leaving && (
        <div className="absolute inset-0" style={{ animation: css.outgoing }}>
          <SlideView slide={pres.slides[leaving.index]} theme={theme} width={width} deck={{ pres, index: leaving.index }} frames={finalFrames(pres.slides[leaving.index])} />
        </div>
      )}
      <div key={`${index}-${leaving?.key ?? 0}`} className="absolute inset-0" style={{ animation: css.incoming }} data-show-slide={index}>
        <SlideView slide={slide} theme={theme} width={width} deck={{ pres, index }} frames={frames} live={live}>
          {children}
        </SlideView>
      </div>
    </div>
  )
}
