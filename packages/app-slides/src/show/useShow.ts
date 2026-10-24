import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Presentation } from '../model'
import { clickCount } from '../animation'

export type Blank = 'black' | 'white' | null

export interface InkStroke {
  id: number
  tool: 'pen' | 'highlighter'
  points: [number, number][]
}

export type InkTool = 'pointer' | 'pen' | 'highlighter' | 'eraser'

export interface ShowState {
  index: number
  /** Animation step on this slide (0 = as it first appears). */
  step: number
  /** Going backwards shows the result without replaying animations. */
  animate: boolean
  /** The slide we came from, for the transition. */
  from: number | null
  ended: boolean
  blank: Blank
}

/**
 * Slide show state: which slide and animation step, black/white screen, ink, automatic
 * advance, and rehearsal timing. Shared by the full-screen show, presenter view and the
 * audience window.
 */
export function useShow(pres: Presentation, start: number, opts: { rehearse?: boolean; onExit: (last: number) => void }) {
  const order = useMemo(() => {
    const shown = pres.slides.map((s, i) => (s.hidden && i !== start ? -1 : i)).filter((i) => i >= 0)
    return shown.length ? shown : [start]
  }, [pres, start])
  const [state, setState] = useState<ShowState>({ index: start, step: 0, animate: true, from: null, ended: false, blank: null })
  const [ink, setInk] = useState<InkStroke[]>([])
  const [tool, setTool] = useState<InkTool>('pointer')
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [slideElapsed, setSlideElapsed] = useState(0)
  /** Rehearsal: seconds spent on each slide id. */
  const timings = useRef<Record<string, number>>({})
  const stateRef = useRef(state)
  stateRef.current = state

  const slide = pres.slides[state.index]
  const steps = slide ? clickCount(slide) : 0

  const goSlide = useCallback((i: number, from: number | null) => {
    setInk([]) // ink belongs to the slide it was drawn on
    setSlideElapsed(0)
    setState((s) => ({ ...s, index: i, step: 0, animate: true, from, ended: false, blank: null }))
  }, [])

  const next = useCallback(() => {
    const s = stateRef.current
    if (s.blank) return setState({ ...s, blank: null })
    if (s.ended) return opts.onExit(s.index)
    const cur = pres.slides[s.index]
    if (cur && s.step < clickCount(cur)) return setState({ ...s, step: s.step + 1, animate: true })
    const pos = order.indexOf(s.index)
    if (pos >= 0 && pos < order.length - 1) return goSlide(order[pos + 1], s.index)
    if (pres.show?.loop) return goSlide(order[0], s.index)
    setInk([])
    setState({ ...s, ended: true, blank: null })
  }, [order, pres, goSlide, opts])

  const prev = useCallback(() => {
    const s = stateRef.current
    if (s.blank) return setState({ ...s, blank: null })
    if (s.ended) return setState({ ...s, ended: false })
    if (s.step > 0) return setState({ ...s, step: s.step - 1, animate: false })
    const pos = order.indexOf(s.index)
    if (pos > 0) {
      const i = order[pos - 1]
      setInk([])
      setSlideElapsed(0)
      // Arrive at the end of the previous slide's animations, without replaying them.
      setState({ ...s, index: i, step: clickCount(pres.slides[i]), animate: false, from: null, ended: false })
    }
  }, [order, pres])

  const goto = useCallback((i: number) => {
    if (i >= 0 && i < pres.slides.length) goSlide(i, null)
  }, [pres, goSlide])

  const setBlank = useCallback((b: Blank) => setState((s) => ({ ...s, blank: s.blank === b ? null : b })), [])

  // Clocks: whole show and this slide (rehearsal pauses them).
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      setElapsed((e) => e + 1)
      setSlideElapsed((e) => e + 1)
      const s = stateRef.current
      const id = pres.slides[s.index]?.id
      if (opts.rehearse && id && !s.ended) timings.current[id] = (timings.current[id] ?? 0) + 1
    }, 1000)
    return () => clearInterval(t)
  }, [paused, pres, opts.rehearse])

  // Automatic advance: Transitions > After, or rehearsed timings with "use timings".
  useEffect(() => {
    if (opts.rehearse || state.ended || paused) return
    const after = slide?.advanceAfter ?? (pres.show?.useTimings ? slide?.timing : undefined)
    if (!after) return
    const t = setTimeout(() => {
      const s = stateRef.current
      const pos = order.indexOf(s.index)
      if (pos >= 0 && pos < order.length - 1) goSlide(order[pos + 1], s.index)
      else if (pres.show?.loop) goSlide(order[0], s.index)
      else setState((x) => ({ ...x, ended: true }))
    }, after * 1000)
    return () => clearTimeout(t)
  }, [state.index, state.ended, slide, pres, order, paused, opts.rehearse, goSlide])

  const nextIndex = (() => {
    const pos = order.indexOf(state.index)
    return pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null
  })()

  return {
    ...state, slide, steps, order, nextIndex, ink, setInk, tool, setTool, paused, setPaused, elapsed, slideElapsed,
    resetTimer: () => { setElapsed(0); setSlideElapsed(0) },
    timings, next, prev, goto, setBlank
  }
}

export type Show = ReturnType<typeof useShow>
