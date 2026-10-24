import type { AnimEffect, AnimKind, Animation, Slide, TransitionType } from './model'

export const EFFECTS: { id: AnimEffect; label: string; kind: AnimKind }[] = [
  { id: 'appear', label: 'Appear', kind: 'entrance' },
  { id: 'fade', label: 'Fade', kind: 'entrance' },
  { id: 'flyIn', label: 'Fly in', kind: 'entrance' },
  { id: 'zoom', label: 'Zoom', kind: 'entrance' },
  { id: 'wipe', label: 'Wipe', kind: 'entrance' },
  { id: 'pulse', label: 'Pulse', kind: 'emphasis' },
  { id: 'spin', label: 'Spin', kind: 'emphasis' },
  { id: 'fadeOut', label: 'Fade out', kind: 'exit' },
  { id: 'flyOut', label: 'Fly out', kind: 'exit' }
]

export const effectKind = (e: AnimEffect): AnimKind => EFFECTS.find((x) => x.id === e)!.kind
export const effectLabel = (e: AnimEffect): string => EFFECTS.find((x) => x.id === e)!.label

export const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'push', label: 'Push' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'cover', label: 'Cover' }
]

export interface TimedAnimation {
  anim: Animation
  /** Milliseconds after the step starts (includes the animation's own delay). */
  at: number
}

/**
 * Group a slide's animations into steps. Step 0 plays as soon as the slide appears (animations
 * set to With/After previous before the first On click one); each later step is one click.
 * "With previous" starts together with the animation before it, "After previous" when it ends.
 */
export function buildSteps(animations: Animation[] | undefined): TimedAnimation[][] {
  const steps: TimedAnimation[][] = [[]]
  let prevStart = 0
  let prevEnd = 0
  for (const anim of animations ?? []) {
    if (anim.start === 'click') {
      steps.push([])
      prevStart = 0
      prevEnd = 0
    }
    const base = anim.start === 'after' ? prevEnd : anim.start === 'with' ? prevStart : 0
    const at = base + Math.max(0, anim.delay)
    steps[steps.length - 1].push({ anim, at })
    prevStart = at
    prevEnd = Math.max(prevEnd, at + (anim.effect === 'appear' ? 0 : anim.duration))
  }
  return steps
}

/** Number of clicks a slide's animations need before the next click moves to the next slide. */
export const clickCount = (slide: Slide) => buildSteps(slide.animations).length - 1

export interface ElementFrame {
  visible: boolean
  /** An animation playing in this step. */
  play?: TimedAnimation
}

/**
 * How each animated element looks at a step: whether it's showing, and what (if anything) is
 * playing. Elements without animations aren't in the map (always visible).
 */
export function frameAt(slide: Slide, step: number): Map<string, ElementFrame> {
  const steps = buildSteps(slide.animations)
  const out = new Map<string, ElementFrame>()
  // Elements whose first animation is an entrance start hidden.
  for (const a of slide.animations ?? []) {
    if (!out.has(a.elementId)) out.set(a.elementId, { visible: effectKind(a.effect) !== 'entrance' })
  }
  const last = Math.min(step, steps.length - 1)
  for (let s = 0; s <= last; s++) {
    for (const t of steps[s]) {
      const f = out.get(t.anim.elementId)!
      const kind = effectKind(t.anim.effect)
      if (s === last) {
        // Playing now: entrances show (the animation reveals them), exits stay until they finish.
        out.set(t.anim.elementId, { visible: kind !== 'exit' || f.visible, play: t })
        if (kind === 'exit') out.get(t.anim.elementId)!.visible = true
      } else {
        out.set(t.anim.elementId, { visible: kind === 'entrance' ? true : kind === 'exit' ? false : f.visible })
      }
    }
  }
  return out
}

const KEYFRAMES: Record<AnimEffect, string> = {
  appear: 'bear-appear',
  fade: 'bear-fade-in',
  flyIn: 'bear-fly-in',
  zoom: 'bear-zoom-in',
  wipe: 'bear-wipe-in',
  pulse: 'bear-pulse',
  spin: 'bear-spin',
  fadeOut: 'bear-fade-out',
  flyOut: 'bear-fly-out'
}

/** CSS `animation` value for an effect playing at `at` ms into the step. */
export function animationCss(t: TimedAnimation): string {
  const duration = t.anim.effect === 'appear' ? 1 : Math.max(50, t.anim.duration)
  return `${KEYFRAMES[t.anim.effect]} ${duration}ms ease-out ${t.at}ms both`
}

/** Keyframes for object animations and slide transitions (slide units: the slide is 1280×720). */
export const MOTION_CSS = `
@keyframes bear-appear { from { opacity: 0 } to { opacity: 1 } }
@keyframes bear-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes bear-fly-in { from { transform: translateY(800px); opacity: 0 } 1% { opacity: 1 } to { transform: none } }
@keyframes bear-zoom-in { from { transform: scale(0.2); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes bear-wipe-in { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes bear-pulse { 0%, 100% { transform: none } 50% { transform: scale(1.15) } }
@keyframes bear-spin { from { transform: none } to { transform: rotate(360deg) } }
@keyframes bear-fade-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes bear-fly-out { from { transform: none } to { transform: translateY(800px) } }
@keyframes bear-tr-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes bear-tr-in-right { from { transform: translateX(100%) } to { transform: none } }
@keyframes bear-tr-out-left { from { transform: none } to { transform: translateX(-100%) } }
@keyframes bear-tr-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes bear-tr-zoom { from { transform: scale(0.6); opacity: 0 } to { transform: none; opacity: 1 } }
`

/** CSS animations for the incoming and outgoing slide of a transition. */
export function transitionCss(type: TransitionType, duration: number): { incoming?: string; outgoing?: string } {
  const d = `${Math.max(50, duration)}ms ease-in-out both`
  switch (type) {
    case 'fade': return { incoming: `bear-tr-fade ${d}` }
    case 'push': return { incoming: `bear-tr-in-right ${d}`, outgoing: `bear-tr-out-left ${d}` }
    case 'wipe': return { incoming: `bear-tr-wipe ${d}` }
    case 'zoom': return { incoming: `bear-tr-zoom ${d}` }
    case 'cover': return { incoming: `bear-tr-in-right ${d}` }
    default: return {}
  }
}
