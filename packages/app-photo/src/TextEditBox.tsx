import { useEffect, useRef } from 'react'
import { cssFont, LINE_HEIGHT } from './render/rasterizeText'
import type { ViewState } from './render/view'
import { commitText, text, textInput } from './tools/text'
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
}

/** The box's callbacks, routed to the Text tool with a fresh context. */
export function textBoxHandlers(tools: Pick<ToolsState, 'withContext'>) {
  return {
    onInput: (s: string) => tools.withContext((ctx) => textInput(ctx, s)),
    onCommit: () => tools.withContext(commitText),
    onCancel: () => tools.withContext((ctx) => text.cancel!(ctx))
  }
}

/**
 * The Text tool's editable box, over the canvas at the click point and drawn at the current zoom.
 * Ctrl+Enter commits and Escape cancels; clicking the canvas commits through the tool. Presses
 * inside a box with text don't reach the canvas.
 */
export function TextEditBox({ box, view, options, onInput, onCommit, onCancel }: TextEditBoxProps) {
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
    return () => el.removeEventListener('pointerdown', stop)
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
        if (e.key === 'Escape') {
          e.preventDefault()
          latest.current.onCancel()
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          latest.current.onCommit()
        }
        e.stopPropagation()
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
