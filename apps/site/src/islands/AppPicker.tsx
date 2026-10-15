import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import type { AppId } from '@bear/core'
import type { TourApp } from '../lib/tour'
import { url } from '../site.config'
import { useMotion } from './useMotion'
import { IslandBoundary } from './IslandBoundary'
import { DEMOS, SleepingBear } from './demos'

const SPRING = { type: 'spring', stiffness: 380, damping: 26 } as const
const PANEL_ID = 'tour-panel'

/** True while the element is on screen. */
function useInView(ref: React.RefObject<Element>): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return inView
}

function setHash(id: AppId | null) {
  try {
    history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search)
  } catch {
    /* history can be unavailable in sandboxes */
  }
}

function Stage({ app, motionOn }: { app: TourApp; motionOn: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const playing = motionOn && visible
  const Demo = app.ready ? DEMOS[app.id] : undefined
  return (
    <div ref={ref} className="picker__stage">
      {Demo ? <Demo playing={playing} /> : <SleepingBear playing={playing} />}
    </div>
  )
}

function Panel({ app, motionOn, narrow, onClose }: { app: TourApp; motionOn: boolean; narrow: boolean; onClose: () => void }) {
  const body = (
    <>
      <button type="button" className="picker__close" aria-label={`Close ${app.name}`} onClick={onClose}>
        ×
      </button>
      <Stage app={app} motionOn={motionOn} />
      <div className="picker__info">
        <h2>{app.name}</h2>
        <p className="picker__tagline">{app.tagline}</p>
        {!app.ready && <span className="badge">Coming soon</span>}
        <ul className="picker__features">
          {app.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {app.docsSlug && (
          <a className="btn btn--primary" href={url(`docs/${app.docsSlug}/`)}>
            Read the guide →
          </a>
        )}
      </div>
    </>
  )
  const common = {
    id: PANEL_ID,
    className: 'picker__panel',
    'data-panel': app.id,
    role: 'region',
    'aria-label': `${app.name} preview`,
    style: { '--tile-color': `var(--app-${app.id})` } as CSSProperties
  }
  if (!motionOn) return <div {...common}>{body}</div>
  return (
    <motion.div
      {...common}
      layout={!narrow}
      initial={{ opacity: 0, scale: 0.94, y: narrow ? 40 : -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING}
    >
      {body}
    </motion.div>
  )
}

function Picker({ apps }: { apps: TourApp[] }) {
  const motionOn = useMotion() === 'on'
  const [openId, setOpenId] = useState<AppId | null>(null)
  const [cols, setCols] = useState(4)
  const [narrow, setNarrow] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const tiles = useRef(new Map<AppId, HTMLButtonElement>())

  const fromHash = useCallback(() => {
    const id = location.hash.slice(1)
    const match = apps.find((a) => a.id === id)
    if (match) setOpenId(match.id)
  }, [apps])

  useEffect(() => {
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [fromHash])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      setCols(Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length))
      setNarrow(window.matchMedia('(max-width: 639px)').matches)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    return () => ro.disconnect()
  }, [])

  const close = useCallback(
    (focusTile: boolean) => {
      const id = openId
      setOpenId(null)
      setHash(null)
      if (focusTile && id) tiles.current.get(id)?.focus()
    },
    [openId]
  )

  // Always attached (reads the latest close via a ref) so Esc works the instant a panel appears.
  const closeRef = useRef(close)
  closeRef.current = close
  const openRef = useRef(openId)
  openRef.current = openId
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) closeRef.current(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!openId || narrow) return
    document.getElementById(PANEL_ID)?.scrollIntoView?.({ block: 'nearest', behavior: motionOn ? 'smooth' : 'auto' })
  }, [openId, narrow, motionOn])

  const toggle = (id: AppId) => {
    if (openId === id) return close(false)
    setOpenId(id)
    setHash(id)
  }

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = apps.findIndex((a) => tiles.current.get(a.id) === document.activeElement)
    if (current < 0) return
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }
    let next = current
    if (e.key in step) next = Math.min(apps.length - 1, Math.max(0, current + step[e.key]))
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = apps.length - 1
    else return
    e.preventDefault()
    tiles.current.get(apps[next].id)?.focus()
  }

  const open = apps.find((a) => a.id === openId) ?? null
  const openIndex = open ? apps.indexOf(open) : -1
  const panelAfter = openIndex < 0 ? -1 : Math.min(apps.length, (Math.floor(openIndex / cols) + 1) * cols) - 1

  const items = apps.flatMap((app, i) => {
    const expanded = app.id === openId
    const tileProps = {
      type: 'button' as const,
      className: `tile picker__tile${expanded ? ' is-open' : ''}`,
      style: { '--tile-color': `var(--app-${app.id})` } as CSSProperties,
      'data-tile': app.id,
      'aria-expanded': expanded,
      'aria-controls': PANEL_ID,
      onClick: () => toggle(app.id),
      ref: (el: HTMLButtonElement | null) => {
        if (el) tiles.current.set(app.id, el)
        else tiles.current.delete(app.id)
      }
    }
    const content = (
      <>
        <span className="tile__name">{app.name}</span>
        <span className="tile__tagline">{app.tagline}</span>
        {!app.ready && <span className="badge">Coming soon</span>}
      </>
    )
    const out = [
      motionOn ? (
        <motion.button key={app.id} {...tileProps} layout="position" transition={SPRING}>
          {content}
        </motion.button>
      ) : (
        <button key={app.id} {...tileProps}>
          {content}
        </button>
      )
    ]
    if (open && i === panelAfter) {
      out.push(<Panel key={`panel-${open.id}`} app={open} motionOn={motionOn} narrow={narrow} onClose={() => close(true)} />)
    }
    return out
  })

  return (
    <div className="picker" role="group" aria-label="Bear apps" ref={gridRef} onKeyDown={onGridKey}>
      {items}
    </div>
  )
}

export default function AppPicker({ apps }: { apps: TourApp[] }) {
  return (
    <IslandBoundary label="tour">
      <Picker apps={apps} />
    </IslandBoundary>
  )
}
