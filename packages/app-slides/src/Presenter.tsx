import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, Eraser, Grid3x3, Highlighter, MousePointer2, Pause, PenLine, Play, RotateCcw, Square, Trash2, X
} from 'lucide-react'
import { SLIDE_H, SLIDE_W, type Presentation } from './model'
import { SlideView } from './SlideView'
import { getTheme } from './themes'
import { ShowSlide } from './show/ShowSlide'
import { InkLayer } from './show/Ink'
import { AudienceWindow } from './show/AudienceWindow'
import { useShow, type Show } from './show/useShow'
import { formatDuration, paceReport } from './pace'

export type ShowMode = 'show' | 'presenter' | 'rehearse'

interface PresenterProps {
  pres: Presentation
  start: number
  /** show: F5 (presenter view when there are two screens); presenter: Alt+F5; rehearse: record timings. */
  mode?: ShowMode
  onExit: (lastSlide: number) => void
  /** End of a rehearsal: keep these times (seconds per slide id), or null to discard. */
  onRehearsed?: (timings: Record<string, number> | null, targetMinutes?: number) => void
}

/** Keys shared by every show screen. Returns true if handled. */
function handleKey(show: Show, e: KeyboardEvent | React.KeyboardEvent, typed: { current: string }, exit: () => void): boolean {
  const k = e.key
  const ctrl = e.ctrlKey || e.metaKey
  if (k === 'Escape') {
    if (show.tool !== 'pointer') show.setTool('pointer')
    else exit()
    return true
  }
  if (ctrl) {
    const lk = k.toLowerCase()
    if (lk === 'p') return show.setTool('pen'), true
    if (lk === 'i') return show.setTool('highlighter'), true
    if (lk === 'e') return show.setTool('eraser'), true
    if (lk === 'a') return show.setTool('pointer'), true
    return false
  }
  if (/^\d$/.test(k)) {
    typed.current += k
    return true
  }
  if (k === 'Enter' && typed.current) {
    show.goto(Number(typed.current) - 1)
    typed.current = ''
    return true
  }
  typed.current = ''
  if (k === 'b' || k === 'B' || k === '.') return show.setBlank('black'), true
  if (k === 'w' || k === 'W' || k === ',') return show.setBlank('white'), true
  if (k === 'e' || k === 'E') return show.setInk([]), true
  if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].includes(k)) return show.next(), true
  if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].includes(k)) return show.prev(), true
  if (k === 'Home') return show.goto(show.order[0]), true
  if (k === 'End') return show.goto(show.order[show.order.length - 1]), true
  return false
}

/** The audience's view of the show, sized to fit `w`×`h`. */
function AudienceView({ show, pres, w, h, interactive }: { show: Show; pres: Presentation; w: number; h: number; interactive?: boolean }) {
  const width = Math.min(w, (h * SLIDE_W) / SLIDE_H)
  if (show.blank) return <div data-blank={show.blank} className="fixed inset-0" style={{ background: show.blank === 'black' ? '#000' : '#fff' }} />
  if (show.ended) return <div className="text-center text-sm text-white/70">End of slide show. Click or press any key to exit.</div>
  return (
    <ShowSlide pres={pres} index={show.index} step={show.step} animate={show.animate} from={show.from} width={width}>
      <InkLayer strokes={show.ink} tool={show.tool} onChange={show.setInk} interactive={interactive} />
    </ShowSlide>
  )
}

function ToolButtons({ show, dark }: { show: Show; dark?: boolean }) {
  const btn = (active: boolean) => `rounded p-1.5 ${active ? (dark ? 'bg-white/25' : 'bg-active') : dark ? 'hover:bg-white/15' : 'hover:bg-hover'}`
  const tools = [
    { id: 'pointer' as const, icon: MousePointer2, label: 'Pointer (Ctrl+A)' },
    { id: 'pen' as const, icon: PenLine, label: 'Pen (Ctrl+P)' },
    { id: 'highlighter' as const, icon: Highlighter, label: 'Highlighter (Ctrl+I)' },
    { id: 'eraser' as const, icon: Eraser, label: 'Eraser (Ctrl+E)' }
  ]
  return (
    <>
      {tools.map((t) => (
        <button key={t.id} title={t.label} aria-label={t.label} aria-pressed={show.tool === t.id} onClick={(e) => { e.stopPropagation(); show.setTool(t.id) }} className={btn(show.tool === t.id)}>
          <t.icon size={16} />
        </button>
      ))}
      <button title="Erase all ink (E)" aria-label="Erase all ink" onClick={(e) => { e.stopPropagation(); show.setInk([]) }} className={btn(false)}><Trash2 size={16} /></button>
      <button title="Black screen (B)" aria-label="Black screen" aria-pressed={show.blank === 'black'} onClick={(e) => { e.stopPropagation(); show.setBlank('black') }} className={btn(show.blank === 'black')}><Square size={16} fill="currentColor" /></button>
      <button title="White screen (W)" aria-label="White screen" aria-pressed={show.blank === 'white'} onClick={(e) => { e.stopPropagation(); show.setBlank('white') }} className={btn(show.blank === 'white')}><Square size={16} /></button>
    </>
  )
}

/** Speaker's screen: current and next slide, notes, timer, tools. */
function PresenterView({ show, pres, onEnd, audience }: { show: Show; pres: Presentation; onEnd: () => void; audience: boolean }) {
  const theme = getTheme(pres.theme)
  const [notesSize, setNotesSize] = useState(18)
  const [grid, setGrid] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [box, setBox] = useState({ w: 1200, h: 800 })
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  useLayoutEffect(() => {
    const el = host.current!
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mainW = Math.max(240, Math.min(box.w * 0.62 - 32, ((box.h - 120) * SLIDE_W) / SLIDE_H))
  const sideW = Math.max(160, Math.min(box.w * 0.38 - 48, 520))
  const position = show.order.indexOf(show.index) + 1

  return (
    <div role="dialog" aria-label="Presenter view" className="fixed inset-0 z-[100] flex flex-col bg-[#1d1d1f] text-white" data-presenter-view>
      <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2 text-sm">
        <div className="flex items-center gap-1" aria-label="Timer">
          <span className="w-16 font-mono text-lg tabular-nums" data-timer>{formatDuration(show.elapsed)}</span>
          <button title={show.paused ? 'Resume timer' : 'Pause timer'} aria-label={show.paused ? 'Resume timer' : 'Pause timer'} onClick={() => show.setPaused(!show.paused)} className="rounded p-1.5 hover:bg-white/15">{show.paused ? <Play size={15} /> : <Pause size={15} />}</button>
          <button title="Restart timer" aria-label="Restart timer" onClick={show.resetTimer} className="rounded p-1.5 hover:bg-white/15"><RotateCcw size={15} /></button>
        </div>
        <span className="text-white/60">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        <div className="flex items-center gap-0.5"><ToolButtons show={show} dark /></div>
        <button onClick={() => setGrid(true)} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/15"><Grid3x3 size={15} /> See all slides</button>
        <span className="ml-auto text-white/60">{audience ? 'Audience sees the other screen' : 'Rehearsing on one screen'}</span>
        <button onClick={onEnd} className="flex items-center gap-1 rounded bg-white/15 px-3 py-1 hover:bg-white/25"><X size={15} /> End show</button>
      </div>
      <div ref={host} className="flex min-h-0 flex-1 gap-6 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="overflow-hidden rounded shadow-lg" aria-label="Current slide">
            {show.ended ? (
              <div className="flex items-center justify-center bg-black text-sm text-white/70" style={{ width: mainW, height: (mainW * SLIDE_H) / SLIDE_W }}>End of slide show</div>
            ) : (
              <ShowSlide pres={pres} index={show.index} step={show.step} animate={show.animate} from={show.from} width={mainW} live={!audience}>
                <InkLayer strokes={show.ink} tool={show.tool} onChange={show.setInk} interactive />
              </ShowSlide>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Previous" onClick={show.prev} className="rounded-full bg-white/10 p-2 hover:bg-white/20"><ChevronLeft size={20} /></button>
            <span aria-live="polite" className="min-w-28 text-center text-sm">Slide {show.ended ? show.order.length : position} of {show.order.length}{show.steps ? ` · click ${show.step} of ${show.steps}` : ''}</span>
            <button aria-label="Next" onClick={show.next} className="rounded-full bg-white/10 p-2 hover:bg-white/20"><ChevronRight size={20} /></button>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3" style={{ maxWidth: sideW + 24 }}>
          <div className="text-xs uppercase tracking-wide text-white/50">Next</div>
          <div className="overflow-hidden rounded" aria-label="Next slide">
            {show.nextIndex !== null ? (
              <SlideView slide={pres.slides[show.nextIndex]} theme={theme} width={sideW} deck={{ pres, index: show.nextIndex }} />
            ) : (
              <div className="flex items-center justify-center bg-black/60 text-sm text-white/60" style={{ width: sideW, height: (sideW * SLIDE_H) / SLIDE_W }}>End of slide show</div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
            Notes
            <span className="flex gap-1 normal-case">
              <button aria-label="Smaller notes" onClick={() => setNotesSize((s) => Math.max(10, s - 2))} className="rounded px-2 py-0.5 hover:bg-white/15">A−</button>
              <button aria-label="Larger notes" onClick={() => setNotesSize((s) => Math.min(48, s + 2))} className="rounded px-2 py-0.5 hover:bg-white/15">A+</button>
            </span>
          </div>
          <div aria-label="Speaker notes" className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded bg-black/30 p-3 leading-relaxed" style={{ fontSize: notesSize }}>
            {show.slide?.notes || <span className="text-white/40">No notes for this slide.</span>}
          </div>
        </div>
      </div>
      {grid && (
        <div role="dialog" aria-label="All slides" className="absolute inset-0 overflow-y-auto bg-[#1d1d1f]/95 p-8" onClick={() => setGrid(false)}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
            {pres.slides.map((s, i) => (
              <button key={s.id} aria-label={`Go to slide ${i + 1}`} onClick={() => { show.goto(i); setGrid(false) }} className={`text-left ${s.hidden ? 'opacity-40' : ''}`}>
                <div className="pointer-events-none overflow-hidden rounded" style={{ outline: i === show.index ? '3px solid #fbbf24' : undefined }}>
                  <SlideView slide={s} theme={theme} width={220} deck={{ pres, index: i }} />
                </div>
                <div className="mt-1 text-xs text-white/60">{i + 1}{s.hidden ? ' (hidden)' : ''}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** After a rehearsal: total time, the pace check, keep or discard. */
function KeepTimings({ pres, timings, onDone }: { pres: Presentation; timings: Record<string, number>; onDone: (keep: boolean, target?: number) => void }) {
  const [target, setTarget] = useState(pres.show?.targetMinutes ? String(pres.show.targetMinutes) : '')
  const report = paceReport(pres, timings, Number(target) || undefined)
  return (
    <div role="dialog" aria-label="Rehearsal finished" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70">
      <div className="w-[520px] rounded-lg bg-surface p-5 text-ink shadow-xl">
        <h2 className="text-lg font-semibold">Rehearsal finished</h2>
        <p className="mt-1 text-sm text-muted">The show took <strong className="text-ink">{formatDuration(report.total)}</strong>. Keep the times for each slide? Then the show can move on by itself.</p>
        <label className="mt-3 flex items-center gap-2 text-sm">Target length
          <input aria-label="Target length in minutes" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="—" className="h-7 w-20 rounded border border-line bg-surface px-2" /> minutes
        </label>
        <ul aria-label="Pace" className="mt-3 max-h-56 overflow-y-auto rounded border border-line text-[13px]">
          {report.rows.map((r) => (
            <li key={r.slideId} className="flex justify-between border-b border-line px-3 py-1 last:border-0">
              <span>Slide {r.index + 1}</span>
              <span className={r.pace === 'rushed' ? 'text-amber-700' : r.pace === 'lingered' ? 'text-red-700' : 'text-muted'}>
                {formatDuration(r.seconds)}{r.pace === 'rushed' ? ' · rushed' : r.pace === 'lingered' ? ' · too long' : ''}
              </span>
            </li>
          ))}
        </ul>
        {report.target && <p className="mt-2 text-[12px] text-muted">About {formatDuration(report.target / Math.max(1, report.rows.length))} per slide fits {target} minutes. Rushed is under 40% of that; too long is over twice it.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => onDone(false, Number(target) || undefined)} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-hover">Don't keep</button>
          <button onClick={() => onDone(true, Number(target) || undefined)} className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Keep timings</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Slide show. Next: → ↓ Space Enter PageDown or click. Previous: ← ↑ Backspace PageUp.
 * Home/End jump, a number then Enter goes to that slide, B / W black or white screen,
 * Ctrl+P pen, Ctrl+I highlighter, Ctrl+E eraser, E erase ink, Esc ends.
 */
export function Presenter({ pres, start, mode = 'show', onExit, onRehearsed }: PresenterProps) {
  const [screens, setScreens] = useState<number | null>(null)
  const [audienceFailed, setAudienceFailed] = useState(false)
  const [asking, setAsking] = useState<Record<string, number> | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const root = useRef<HTMLDivElement>(null)
  const typed = useRef('')
  const rehearse = mode === 'rehearse'

  const finish = useCallback((last: number) => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (rehearse) setAsking({ ...showRef.current!.timings.current })
    else onExit(last)
  }, [rehearse, onExit]) // eslint-disable-line react-hooks/exhaustive-deps

  const show = useShow(pres, start, { rehearse, onExit: finish })
  const showRef = useRef<Show | null>(null)
  showRef.current = show

  useEffect(() => {
    void window.bear.screenCount().then(setScreens).catch(() => setScreens(1))
  }, [])

  const presenterView = mode === 'presenter' || (mode === 'show' && (screens ?? 1) > 1)
  const audience = presenterView && (screens ?? 1) > 1 && !audienceFailed
  const fullScreen = !presenterView

  useLayoutEffect(() => {
    root.current?.focus()
    if (screens === null) return
    // Fullscreen for the presenter's window too: the show (one screen) or presenter view.
    root.current?.requestFullscreen?.().catch(() => {
      /* fullscreen can be refused; the overlay still covers the window */
    })
  }, [screens, presenterView])

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    const onFs = () => {
      // Leaving fullscreen with the system gesture ends a one-screen show too.
      if (!document.fullscreenElement && root.current?.dataset.wasFullscreen && fullScreen) finish(show.index)
      if (document.fullscreenElement && root.current) root.current.dataset.wasFullscreen = '1'
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [finish, fullScreen, show.index])

  const onKey = (e: KeyboardEvent | React.KeyboardEvent) => {
    if (asking) return
    if (handleKey(showRef.current!, e, typed, () => finish(showRef.current!.index))) e.preventDefault()
  }
  const keyRef = useRef(onKey)
  keyRef.current = onKey

  if (asking) {
    return (
      <KeepTimings
        pres={pres}
        timings={asking}
        onDone={(keep, target) => {
          onRehearsed?.(keep ? asking : null, target)
          onExit(show.index)
        }}
      />
    )
  }

  const audienceWin = audience && (
    <AudienceWindow onKey={(e) => keyRef.current(e)} onClosed={() => setAudienceFailed(true)}>
      {(s) => (
        <div className="flex h-full w-full items-center justify-center" onClick={() => show.next()} onContextMenu={(e) => { e.preventDefault(); show.prev() }}>
          <AudienceView show={show} pres={pres} w={s.w} h={s.h} />
        </div>
      )}
    </AudienceWindow>
  )

  if (presenterView) {
    return (
      <div ref={root} tabIndex={0} onKeyDown={onKey} className="outline-none" data-presenting>
        <PresenterView show={show} pres={pres} onEnd={() => finish(show.index)} audience={audience} />
        {audienceWin}
      </div>
    )
  }

  const pos = show.order.indexOf(show.index) + 1
  let toolbar: ReactNode = (
    <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100" aria-label="Show tools">
      <button aria-label="Previous slide" onClick={(e) => { e.stopPropagation(); show.prev() }} className="rounded p-1.5 hover:bg-white/15"><ChevronLeft size={16} /></button>
      <button aria-label="Next slide" onClick={(e) => { e.stopPropagation(); show.next() }} className="rounded p-1.5 hover:bg-white/15"><ChevronRight size={16} /></button>
      <ToolButtons show={show} dark />
      <button aria-label="End show" onClick={(e) => { e.stopPropagation(); finish(show.index) }} className="rounded p-1.5 hover:bg-white/15"><X size={16} /></button>
    </div>
  )
  if (rehearse) {
    toolbar = (
      <div role="toolbar" aria-label="Rehearsal" className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-[#1d1d1f] px-3 py-1.5 text-sm text-white shadow" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Next" onClick={show.next} className="rounded p-1 hover:bg-white/15"><ChevronRight size={16} /></button>
        <button aria-label={show.paused ? 'Resume recording' : 'Pause recording'} onClick={() => show.setPaused(!show.paused)} className="rounded p-1 hover:bg-white/15">{show.paused ? <Play size={15} /> : <Pause size={15} />}</button>
        <span data-slide-time className="w-12 font-mono tabular-nums">{formatDuration(show.slideElapsed)}</span>
        <span className="text-white/50">|</span>
        <span data-total-time className="w-14 font-mono tabular-nums">{formatDuration(show.elapsed)}</span>
      </div>
    )
  }

  return (
    <div
      ref={root}
      tabIndex={0}
      role="dialog"
      aria-label="Slide show"
      data-presenting
      onKeyDown={onKey}
      onClick={() => show.tool === 'pointer' && show.next()}
      onContextMenu={(e) => {
        e.preventDefault()
        show.prev()
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black outline-none ${show.tool === 'pointer' && !rehearse ? 'cursor-none' : ''}`}
    >
      <AudienceView show={show} pres={pres} w={size.w} h={size.h} interactive />
      <div aria-live="polite" className="absolute bottom-2 right-3 text-xs text-white/40">
        {show.ended ? '' : `${pos} / ${show.order.length}`}
      </div>
      {toolbar}
    </div>
  )
}
