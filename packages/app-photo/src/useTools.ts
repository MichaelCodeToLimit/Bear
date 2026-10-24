import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultOptions, toolById, toolForKey, TOOLS } from './tools'
import { rasterizeText } from './render/rasterizeText'
import { ToolDispatcher, type PointerPhase } from './tools/dispatch'
import type { Overlay, ToolContext, ToolId, ToolPointer } from './tools/types'
import type { PhotoEditorState } from './usePhotoEditor'

export type { PointerPhase }

const STATUS_MS = 4000

export interface ToolsState {
  /** Option values of every tool, keyed by tool id then option id. */
  options: Record<ToolId, Record<string, unknown>>
  setOption: (tool: ToolId, id: string, value: unknown) => void
  overlay: Overlay | null
  /** The latest tool message for the status bar, cleared after a few seconds. */
  status: string | null
  cursor: string
  /** Show a message in the status bar for a few seconds. */
  notify: (message: string) => void
  /** True while a drag is in progress. */
  busy: () => boolean
  /** Abandon a drag in progress (its preview is undone). Undo/redo/History call this on their own. */
  cancelGesture: () => void
  /** Pointer events from the canvas, already in document and canvas coordinates. */
  onPointer: (phase: PointerPhase, p: ToolPointer) => void
  /** Tool shortcuts, Space for Hand and the active tool's own keys. True when handled. */
  onKeyDown: (e: KeyboardEvent) => boolean
  onKeyUp: (e: KeyboardEvent) => void
  /** Run `fn` with a fresh ToolContext (UI outside the canvas, such as the text box, talking to its tool). */
  withContext: (fn: (ctx: ToolContext) => void) => void
  /** Commit an open text box (before saving). */
  commitPending: () => void
}

/** Wires the tools in `tools/` to the editor state: one ToolContext per event, built from the latest state. */
export function useTools(state: PhotoEditorState): ToolsState {
  const [options, setOptions] = useState(() => Object.fromEntries(TOOLS.map((t) => [t.id, defaultOptions(t)])) as Record<ToolId, Record<string, unknown>>)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const latest = useRef({ state, options })
  latest.current = { state, options }
  const statusTimer = useRef<ReturnType<typeof setTimeout>>()

  const showStatus = useCallback((msg: string) => {
    setStatus(msg)
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), STATUS_MS)
  }, [])
  useEffect(() => () => clearTimeout(statusTimer.current), [])

  const setOption = useCallback((tool: ToolId, id: string, value: unknown) => {
    setOptions((o) => ({ ...o, [tool]: { ...o[tool], [id]: value } }))
  }, [])

  const [dispatcher] = useState(
    () =>
      new ToolDispatcher(
        (tool?: ToolId): ToolContext => {
          const { state: s, options: o } = latest.current
          const id = tool ?? s.tool
          return {
            editor: s.editor,
            options: o[id],
            setOption: (k, v) => setOption(id, k, v),
            colors: s.colors,
            setColors: s.setColors,
            view: s.view,
            setView: (v) => s.setView(v),
            dpr: window.devicePixelRatio || 1,
            setOverlay,
            status: showStatus,
            refresh: s.refresh,
            rasterizeText
          }
        },
        () => latest.current.state.tool,
        (t) => latest.current.state.setTool(t)
      )
  )

  // Undo, redo and History clicks cancel a drag first, whichever button or key started them.
  useEffect(() => dispatcher.attach(state.editor), [dispatcher, state.editor])

  // A real tool switch drops the old tool's work in progress; a Space hold keeps it.
  const prevTool = useRef(state.tool)
  useEffect(() => {
    const prev = prevTool.current
    prevTool.current = state.tool
    if (prev !== state.tool && dispatcher.toolChanged(prev)) setOverlay(null)
  }, [state.tool, dispatcher])

  // A new document: nothing pending carries over.
  useEffect(() => {
    dispatcher.reset()
    setOverlay(null)
  }, [state.loadId, dispatcher])

  const onPointer = useCallback(
    (phase: PointerPhase, p: ToolPointer) => {
      if (latest.current.state.hasDoc) dispatcher.pointer(phase, p)
    },
    [dispatcher]
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const { state: s } = latest.current
      if (!s.hasDoc || e.ctrlKey || e.metaKey) return false
      if (e.code === 'Space' || e.key === ' ') {
        if (!e.repeat) dispatcher.space('down')
        return true
      }
      if (dispatcher.busy) return false
      if (dispatcher.onKey(e)) return true
      if (e.altKey || e.key.length !== 1) return false
      const id = toolForKey(e.key, { shift: e.shiftKey, current: s.tool })
      if (!id) return false
      if (id !== s.tool) s.setTool(id)
      return true
    },
    [dispatcher]
  )

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') dispatcher.space('up')
    },
    [dispatcher]
  )

  // A Space release in another window never arrives; don't stay stuck on Hand.
  useEffect(() => {
    const release = () => dispatcher.space('up')
    window.addEventListener('blur', release)
    return () => window.removeEventListener('blur', release)
  }, [dispatcher])

  return {
    options,
    setOption,
    overlay,
    status,
    cursor: toolById(state.tool).cursor,
    notify: showStatus,
    busy: () => dispatcher.busy,
    cancelGesture: () => dispatcher.cancelGesture(),
    onPointer,
    onKeyDown,
    onKeyUp,
    withContext: (fn) => dispatcher.withContext(fn),
    commitPending: () => dispatcher.commitPending()
  }
}
