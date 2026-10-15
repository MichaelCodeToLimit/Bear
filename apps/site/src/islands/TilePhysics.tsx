import { useEffect, useRef, useState } from 'react'
import { APPS } from '@bear/core'
import { useMotion } from './useMotion'
import { IslandBoundary } from './IslandBoundary'

type MatterModule = typeof import('matter-js')

interface Controller {
  setRunning: (running: boolean) => void
  reset: () => void
}

const HEIGHT = 300

/** Builds the physics world on `canvas`, returns controls and a teardown. */
function createWorld(Matter: MatterModule, canvas: HTMLCanvasElement, width: number, motionOn: boolean) {
  const { Engine, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint } = Matter
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(HEIGHT * dpr)
  const ctx = canvas.getContext('2d')

  const engine = Engine.create()
  const runner = Runner.create()
  const size = Math.round(Math.min(64, Math.max(40, width / 7)))
  const wall = { isStatic: true, render: { visible: false } }
  Composite.add(engine.world, [
    Bodies.rectangle(width / 2, HEIGHT + 30, width + 200, 60, wall),
    Bodies.rectangle(-30, HEIGHT / 2, 60, HEIGHT * 4, wall),
    Bodies.rectangle(width + 30, HEIGHT / 2, 60, HEIGHT * 4, wall)
  ])

  const tiles = APPS.map((app, i) => {
    const body = Bodies.rectangle(
      size + ((i * 53) % Math.max(1, width - size * 2)),
      -size - i * (size * 0.9),
      size,
      size,
      { chamfer: { radius: size * 0.22 }, restitution: 0.55, friction: 0.2 }
    )
    Body.setAngle(body, ((i * 37) % 60) * (Math.PI / 180) - 0.5)
    return { body, color: app.color, label: app.name.slice(0, 2) }
  })
  Composite.add(engine.world, tiles.map((t) => t.body))

  const mouse = Mouse.create(canvas)
  // Canvas pixels differ from CSS pixels by dpr; tell Matter so pointer positions stay in CSS space.
  mouse.pixelRatio = dpr
  // Let the page scroll when the wheel is over the canvas.
  canvas.removeEventListener('mousewheel', (mouse as unknown as { mousewheel: EventListener }).mousewheel)
  canvas.removeEventListener('DOMMouseScroll', (mouse as unknown as { mousewheel: EventListener }).mousewheel)
  const mouseConstraint = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } })
  Composite.add(engine.world, mouseConstraint)

  const draw = () => {
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.round(size * 0.38)}px ui-rounded, system-ui, sans-serif`
    for (const { body, color, label } of tiles) {
      ctx.beginPath()
      body.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(59, 42, 26, 0.25)'
      ctx.stroke()
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
      ctx.shadowBlur = 2
      ctx.fillText(label, 0, 1)
      ctx.restore()
    }
  }
  Events.on(engine, 'afterUpdate', draw)

  let running = false
  const setRunning = (next: boolean) => {
    if (next === running) return
    running = next
    if (next) Runner.run(runner, engine)
    else Runner.stop(runner)
  }
  const settle = () => {
    for (let i = 0; i < 360; i++) Engine.update(engine, 1000 / 60)
    draw()
  }
  if (motionOn) draw()
  else settle()

  const teardown = () => {
    setRunning(false)
    Events.off(engine, 'afterUpdate', draw)
    Composite.clear(engine.world, false)
    Engine.clear(engine)
  }
  return { setRunning, teardown, settle }
}

function TilePhysicsInner() {
  const motion = useMotion()
  const motionOn = motion === 'on'
  const [ready, setReady] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controller = useRef<Controller | null>(null)
  const inView = useRef(false)
  const motionRef = useRef(motionOn)
  motionRef.current = motionOn
  const sync = () => controller.current?.setRunning(motionRef.current && inView.current)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    let cancelled = false
    let teardown: (() => void) | null = null
    let width = 0
    let Matter: MatterModule | null = null

    const build = () => {
      teardown?.()
      if (!Matter) return
      const world = createWorld(Matter, canvas, width, motionRef.current)
      teardown = world.teardown
      controller.current = {
        setRunning: world.setRunning,
        reset: () => build()
      }
      sync()
    }

    const io = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting
      sync()
    })
    io.observe(root)

    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width)
      if (w > 0 && w !== width) {
        width = w
        canvas.style.height = `${HEIGHT}px`
        build()
      }
    })

    import('matter-js').then((mod) => {
      if (cancelled) return
      Matter = (mod as { default?: MatterModule }).default ?? (mod as MatterModule)
      width = Math.floor(root.clientWidth)
      if (width > 0) build()
      setReady(true)
      ro.observe(root)
    })

    return () => {
      cancelled = true
      io.disconnect()
      ro.disconnect()
      teardown?.()
      controller.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sync()
    if (!motionOn) controller.current?.reset()
  }, [motionOn])

  return (
    <div ref={rootRef} className="tp" data-tile-physics data-bodies={ready ? APPS.length : undefined}>
      <canvas
        ref={canvasRef}
        className="tp__canvas"
        role="img"
        aria-label="Twelve app tiles tumbling in a box. Drag them around."
      />
      {!ready && <p className="tp__loading">Loading…</p>}
      <button type="button" className="btn" onClick={() => controller.current?.reset()}>
        Reset
      </button>
    </div>
  )
}

export default function TilePhysics() {
  return (
    <IslandBoundary label="tile-physics">
      <TilePhysicsInner />
    </IslandBoundary>
  )
}
