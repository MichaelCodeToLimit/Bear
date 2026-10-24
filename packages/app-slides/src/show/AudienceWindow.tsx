import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** Rendered into the window, sized to it. */
  children: (size: { w: number; h: number }) => ReactNode
  onKey: (e: KeyboardEvent) => void
  /** The window couldn't open, or the audience closed it. */
  onClosed: () => void
}

/**
 * The audience's screen: a second window Bear opens full screen on the other display (see the
 * main process). It's a blank same-origin page; the show renders into it through a portal, so
 * one show state drives both screens.
 */
export function AudienceWindow({ children, onKey, onClosed }: Props) {
  const [target, setTarget] = useState<{ win: Window; root: HTMLElement } | null>(null)
  const [size, setSize] = useState({ w: 1280, h: 720 })

  useEffect(() => {
    const win = window.open('about:blank', 'bear-audience')
    if (!win) {
      onClosed()
      return
    }
    const doc = win.document
    doc.title = 'Slide show'
    // Bring the app's styles (Tailwind, fonts, animation keyframes) along.
    for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) doc.head.appendChild(node.cloneNode(true))
    doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden;cursor:none'
    const root = doc.createElement('div')
    root.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000'
    doc.body.appendChild(root)
    const fit = () => setSize({ w: win.innerWidth, h: win.innerHeight })
    fit()
    win.addEventListener('resize', fit)
    win.addEventListener('keydown', onKey)
    const closed = () => onClosed()
    win.addEventListener('pagehide', closed)
    setTarget({ win, root })
    return () => {
      win.removeEventListener('pagehide', closed)
      win.removeEventListener('keydown', onKey)
      win.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return target ? createPortal(children(size), target.root) : null
}
