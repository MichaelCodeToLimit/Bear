import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { APPS } from '@bear/core'
import { useMotion } from './useMotion'
import { IslandBoundary } from './IslandBoundary'

type MiniSheetModule = typeof import('../lib/miniSheet')

const TABS = [
  { id: 'sheet', label: 'Mini sheet' },
  { id: 'doodle', label: 'Doodle' },
  { id: 'tasks', label: 'Tasks' }
] as const
type TabId = (typeof TABS)[number]['id']

const blankGrid = (): string[][] => [
  ['', '', ''],
  ['', '', ''],
  ['', '', '']
]

/* ---------- Mini sheet ---------- */

function MiniSheet({ inputs, onChange }: { inputs: string[][]; onChange: (r: number, c: number, value: string) => void }) {
  const [mod, setMod] = useState<MiniSheetModule | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('../lib/miniSheet')
      .then((m) => {
        if (!cancelled) setMod(m)
      })
      .catch((error: unknown) => {
        console.warn('[island:mini-sheet] miniSheet failed to load', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return (
      <p className="island-fallback" role="status" data-island-failed="mini-sheet">
        This one didn't load. Try reloading.
      </p>
    )
  }

  const results = mod ? mod.evaluateGrid(inputs) : null
  return (
    <div className="msheet">
      <p className="msheet__hint">Type numbers, words or formulas such as =A1*B1 or =SUM(A1:C1).</p>
      <div className="msheet__grid">
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const name = `${'ABC'[c]}${r + 1}`
            const result = results?.[r][c] ?? ''
            return (
              <div className="msheet__cell" key={name}>
                <input
                  className="msheet__input"
                  aria-label={name}
                  placeholder={name}
                  value={inputs[r][c]}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => onChange(r, c, e.target.value)}
                />
                <output
                  className="msheet__result"
                  data-cell-result={name}
                  data-error={result.startsWith('#') ? '' : undefined}
                  aria-label={`${name} result`}
                >
                  {result}
                </output>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ---------- Doodle ---------- */

interface Stroke {
  color: string
  points: { x: number; y: number }[]
}

const DOODLE_HEIGHT = 220

function Doodle() {
  const [color, setColor] = useState<string>(APPS[0].color)
  const [strokeCount, setStrokeCount] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const size = useRef({ width: 0 })

  const paint = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.current.width, DOODLE_HEIGHT)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    for (const s of strokes.current) {
      ctx.strokeStyle = s.color
      ctx.fillStyle = s.color
      if (s.points.length === 1) {
        ctx.beginPath()
        ctx.arc(s.points[0].x, s.points[0].y, 2, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
  }

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = (width: number) => {
      const dpr = window.devicePixelRatio || 1
      size.current.width = width
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(DOODLE_HEIGHT * dpr)
      paint()
    }
    fit(Math.floor(wrap.clientWidth))
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width)
      if (w > 0 && w !== size.current.width) fit(w)
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return (
    <div className="doodle" ref={wrapRef} data-doodle-strokes={strokeCount}>
      <canvas
        ref={canvasRef}
        className="doodle__canvas"
        style={{ height: DOODLE_HEIGHT }}
        role="img"
        aria-label="Doodle pad. Draw with a mouse, finger or pen."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          current.current = { color, points: [point(e)] }
          strokes.current.push(current.current)
          paint()
        }}
        onPointerMove={(e) => {
          if (!current.current) return
          current.current.points.push(point(e))
          paint()
        }}
        onPointerUp={() => {
          if (current.current) setStrokeCount(strokes.current.length)
          current.current = null
        }}
        onPointerCancel={() => {
          current.current = null
          setStrokeCount(strokes.current.length)
        }}
      />
      <div className="doodle__bar">
        <div className="doodle__swatches" role="group" aria-label="Pen colour">
          {APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              className="doodle__swatch"
              style={{ background: app.color }}
              aria-label={`${app.name} colour`}
              aria-pressed={color === app.color}
              onClick={() => setColor(app.color)}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            strokes.current = []
            current.current = null
            setStrokeCount(0)
            paint()
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

/* ---------- Tasks ---------- */

const TASKS = ['Pick a bear name', 'Open a spreadsheet', 'Write one note', 'Hit save']
const CONFETTI_COUNT = 36
/** Confetti lasts 1600ms x --motion-speed plus up to 300ms of stagger; the timer scales with the speed. */
const CONFETTI_BASE_MS = 2000

function Tasks({ motionOn }: { motionOn: boolean }) {
  const [done, setDone] = useState<boolean[]>(() => TASKS.map(() => false))
  const [burst, setBurst] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allDone = done.every(Boolean)

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clearTimer, [])

  const toggle = (i: number) => {
    const next = done.map((d, j) => (j === i ? !d : d))
    setDone(next)
    clearTimer()
    if (next.every(Boolean) && motionOn) {
      setBurst(true)
      const speed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-speed')) || 1
      timer.current = setTimeout(() => setBurst(false), CONFETTI_BASE_MS * speed)
    } else {
      setBurst(false)
    }
  }

  return (
    <div className="tasks">
      <ul className="tasks__list">
        {TASKS.map((label, i) => (
          <li key={label}>
            <label className="tasks__item" data-done={done[i] ? '' : undefined}>
              <input type="checkbox" checked={done[i]} onChange={() => toggle(i)} />
              <span>{label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="tasks__status" role="status">
        {allDone ? 'All done! 🎉' : `${done.filter(Boolean).length} of ${TASKS.length} done`}
      </p>
      {burst && motionOn && (
        <div className="confetti" data-confetti aria-hidden="true">
          {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
            <span
              key={i}
              style={
                {
                  '--x': `${(i * 37) % 100}%`,
                  '--dx': `${((i * 53) % 120) - 60}px`,
                  '--delay': `${(i % 6) * 60}ms`,
                  '--rot': `${(i * 47) % 360}deg`,
                  background: APPS[i % APPS.length].color
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Shell ---------- */

function MiniDemosInner() {
  const motion = useMotion()
  const uid = useId()
  const [tab, setTab] = useState<TabId>('sheet')
  const [inputs, setInputs] = useState<string[][]>(blankGrid)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[TABS[next].id]?.focus()
  }

  return (
    <div className="mini" data-mini-demos>
      <div className="mini__tabs" role="tablist" aria-label="Mini demos" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="mini__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel-${tab}`}
        aria-labelledby={`${uid}-tab-${tab}`}
        className="mini__panel"
      >
        {tab === 'sheet' && (
          <MiniSheet
            inputs={inputs}
            onChange={(r, c, value) => setInputs((prev) => prev.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)))}
          />
        )}
        {tab === 'doodle' && <Doodle />}
        {tab === 'tasks' && <Tasks motionOn={motion === 'on'} />}
      </div>
    </div>
  )
}

export default function MiniDemos() {
  return (
    <IslandBoundary label="mini-demos">
      <MiniDemosInner />
    </IslandBoundary>
  )
}
