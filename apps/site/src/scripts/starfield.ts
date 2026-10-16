interface Star {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const LINK_DIST = 110
const MAX_STARS = 90
const AREA_PER_STAR = 18000

function readAccent(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#f59e0b'
}

/**
 * Draws a slow, warm "firefly" constellation on `canvas`. The animation loop only runs while
 * motion is allowed and the tab is visible; otherwise one static frame is drawn.
 * Returns a cleanup function.
 */
export function initStarfield(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.dataset.state = 'paused'
    return () => {}
  }
  const root = document.documentElement
  let width = 0
  let height = 0
  let dpr = 1
  let stars: Star[] = []
  let accent = readAccent()
  let raf = 0
  let last = 0
  let resizeTimer: ReturnType<typeof setTimeout> | undefined

  const allowed = (): boolean => root.dataset.motion !== 'off' && !document.hidden

  function publish(): void {
    // Test hook: a tiny fingerprint of the first stars, refreshed whenever the field is built or resized.
    canvas.dataset.stars = stars
      .slice(0, 6)
      .map((s) => `${Math.round(s.x)},${Math.round(s.y)}`)
      .join(';')
  }

  function size(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function build(): void {
    size()
    const count = Math.round(Math.min(MAX_STARS, (width * height) / AREA_PER_STAR))
    stars = Array.from({ length: count }, () => {
      const speed = 0.02 + Math.random() * 0.04 // px per ms
      const angle = Math.random() * Math.PI * 2
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 1.2
      }
    })
    publish()
  }

  function draw(): void {
    const c = ctx!
    c.clearRect(0, 0, width, height)
    c.strokeStyle = accent
    c.fillStyle = accent
    c.lineWidth = 1
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i]
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d = Math.hypot(dx, dy)
        if (d < LINK_DIST) {
          c.globalAlpha = 0.08 + (1 - d / LINK_DIST) * 0.17
          c.beginPath()
          c.moveTo(a.x, a.y)
          c.lineTo(b.x, b.y)
          c.stroke()
        }
      }
    }
    c.globalAlpha = 0.55
    for (const s of stars) {
      c.beginPath()
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
  }

  function step(now: number): void {
    const dt = Math.min(now - last, 64)
    last = now
    for (const s of stars) {
      s.x += s.vx * dt
      s.y += s.vy * dt
      if (s.x < -10) s.x = width + 10
      else if (s.x > width + 10) s.x = -10
      if (s.y < -10) s.y = height + 10
      else if (s.y > height + 10) s.y = -10
    }
    draw()
    raf = requestAnimationFrame(step)
  }

  function start(): void {
    canvas.dataset.state = 'running'
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(step)
  }

  function stop(): void {
    canvas.dataset.state = 'paused'
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    draw()
  }

  function sync(): void {
    if (allowed()) start()
    else stop()
  }

  const onResize = (): void => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      // Phones fire height-only resizes as the address bar shows and hides: keep the stars, just wrap them into the new bounds.
      if (window.innerWidth !== width) build()
      else {
        size()
        for (const s of stars) if (s.y > height) s.y = Math.random() * height
        publish()
      }
      draw()
    }, 150)
  }

  const attrObserver = new MutationObserver(() => {
    accent = readAccent()
    sync()
    if (!raf) draw()
  })
  attrObserver.observe(root, { attributes: true, attributeFilter: ['data-motion', 'data-theme'] })
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('resize', onResize)

  build()
  sync()

  return () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    clearTimeout(resizeTimer)
    attrObserver.disconnect()
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('resize', onResize)
  }
}
