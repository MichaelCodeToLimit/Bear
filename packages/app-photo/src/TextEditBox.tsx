import { useEffect, useRef } from 'react'
import { cssFont, LINE_HEIGHT } from './render/rasterizeText'
import type { ViewState } from './render/view'
import { attachTextSource, commitText, text, textInput } from './tools/text'
import type { Overlay } from './tools/types'
import type { ToolsState } from './useTools'

type TextOverlay = Extract<Overlay, { kind: 'text' }>

interface TextEditBoxProps {
  box: TextOverlay
  view: ViewState
  /** The Text tool's options (font, size, align), so changes show while typing. */
  options: Record<string, unknown>
  onInput: (text: string) => void
  onCommit: () => void
  onCancel: () => void
  /** The box is up: `read` returns its current text. */
  onMount: (read: () => string) => void
}

/** The box's callbacks, routed to the Text tool with a fresh context. */
export function textBoxHandlers(tools: Pick<ToolsState, 'withContext'>) {
  return {
    onInput: (s: string) => tools.withContext((ctx) => textInput(ctx, s)),
    onCommit: () => tools.withContext(commitText),
    onCancel: () => tools.withContext((ctx) => text.cancel!(ctx)),
    onMount: (read: () => string) => tools.withContext((ctx) => attachTextSource(ctx, read))
  }
}

/**
 * The Text tool's editable box, over the canvas at the click point and drawn at the current zoom.
 * Ctrl+Enter commits and Escape cancels (not during IME composition); clicking the canvas commits
 * through the tool, and a press elsewhere in the app (not the options bar) commits too. Presses
 * inside a box with text don't reach the canvas. Commit reads the box's text as shown.
 */
export function TextEditBox({ box, view, options, onInput, onCommit, onCancel, onMount }: TextEditBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ onInput, onCommit, onCancel })
  latest.current = { onInput, onCommit, onCancel }

  // A new box (session) starts with its text and the caret at the end.
  useEffect(() => {
    const el = ref.current!
    el.innerText = box.text
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // The canvas wrapper listens natively; stop presses here before they get there. An empty box
    // lets them through, so a double-click on a text layer (whose first click opened this box
    // under the pointer) still reaches the Text tool.
    const stop = (e: Event) => {
      if (el.innerText.trim()) e.stopPropagation()
    }
    el.addEventListener('pointerdown', stop)
    onMount(() => el.innerText)
    // A press anywhere else in the app (ribbon, panels, title bar) commits. The canvas is left to
    // the Text tool, and the options bar to font/size changes while typing.
    const outside = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target : null
      if (!t || el.contains(t) || t.closest('[data-photo-viewport], [data-testid=photo-options]')) return
      latest.current.onCommit()
    }
    window.addEventListener('pointerdown', outside, true)
    return () => {
      el.removeEventListener('pointerdown', stop)
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [box.session]) // eslint-disable-line react-hooks/exhaustive-deps

  const dpr = window.devicePixelRatio || 1
  const scale = view.zoom / dpr
  const size = Math.max(1, Number(options.size) || 48)
  const font = String(options.font ?? 'Arial')
  const [r, g, b, a] = box.color
  return (
    <div
      ref={ref}
      data-testid="photo-text-box"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => latest.current.onInput(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        // Keys that pick or end an IME composition are the input method's, not ours.
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Escape') {
          e.preventDefault()
          latest.current.onCancel()
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          latest.current.onCommit()
        }
        // Other keys reach the window: the app ignores typing here, except Ctrl+S.
      }}
      className="absolute whitespace-pre outline outline-1 outline-dashed outline-[var(--accent)]"
      style={{
        left: (box.x * view.zoom + view.panX) / dpr,
        top: (box.y * view.zoom + view.panY) / dpr,
        font: cssFont({ font, size: size * scale }),
        lineHeight: LINE_HEIGHT,
        textAlign: String(options.align ?? 'Left').toLowerCase() as 'left' | 'center' | 'right',
        color: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
        minWidth: '0.5em',
        cursor: 'text'
      }}
    />
  )
}
