import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Navigation that works with Android's back button. Capacitor's WebView goes back in browser
 * history when it can (and closes the app when it can't), so every screen, sheet and menu that
 * should close on Back pushes a history entry with a function that closes it. Closing anything
 * from the UI goes through goBack() too, so the history stack and what's on screen stay in step.
 */
const stack: (() => void)[] = []
/** Run after the next Back completes (popstate arrives asynchronously). */
const afterBack: (() => void)[] = []

window.addEventListener('popstate', () => {
  stack.pop()?.()
  afterBack.shift()?.()
})

/** Run `onBack` when the user presses Back (or something calls goBack). */
export function pushBack(onBack: () => void): void {
  stack.push(onBack)
  history.pushState({ depth: stack.length }, '')
}

/** Close the top layer; `then` runs once it has closed (e.g. to open the next one). */
export function goBack(then?: () => void): void {
  if (!stack.length) return then?.()
  afterBack.push(then ?? (() => {}))
  history.back()
}

/** How many layers are open (0 = the home screen). */
export const depth = () => stack.length

/**
 * A screen or panel shown on top of the current one: `open(value)` shows it and arms Back,
 * `close()` goes back. `value` is null while closed.
 */
export function useLayer<T>() {
  const [value, setValue] = useState<T | null>(null)
  const isOpen = useRef(false)
  const open = useCallback((v: T) => {
    if (!isOpen.current) {
      isOpen.current = true
      pushBack(() => {
        isOpen.current = false
        setValue(null)
      })
    }
    setValue(() => v)
  }, [])
  const close = useCallback(() => {
    if (isOpen.current) goBack()
  }, [])
  /** Change what's shown without adding another Back step. */
  const replace = useCallback((v: T) => setValue(() => v), [])
  return { value, open, close, replace }
}

/** True while the on-screen keyboard is up (the window shrinks when it opens). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    const full = { h: Math.max(window.innerHeight, screen.height * 0.6) }
    const check = () => {
      const h = vv?.height ?? window.innerHeight
      if (!document.activeElement || document.activeElement === document.body) full.h = Math.max(full.h, h)
      setOpen(h < full.h * 0.8)
    }
    check()
    vv?.addEventListener('resize', check)
    window.addEventListener('resize', check)
    return () => {
      vv?.removeEventListener('resize', check)
      window.removeEventListener('resize', check)
    }
  }, [])
  return open
}
