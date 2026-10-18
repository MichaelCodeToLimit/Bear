import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultOptions, holdSpace, toolById, toolForKey, TOOLS } from './tools'
import type { Overlay, ToolContext, ToolId, ToolPointer } from './tools/types'
import type { PhotoEditorState } from './usePhotoEditor'

export type PointerPhase = 'down' | 'move' | 'up'

const STATUS_MS = 4000

export interface ToolsState {
  /** Option values of every tool, keyed by tool id then option id. */
  options: Record<ToolId, Record<string, unknown>>
  setOption: (tool: ToolId, id: string, value: unknown) => void
  overlay: Overlay | null
  /** The latest tool message for the status bar, cleared after a few seconds. */
  status: string | null
  cursor: string
  /** Pointer events from the canvas, already in document and canvas coordinates. */
  onPointer: (phase: PointerPhase, p: ToolPointer) => void
  /** Tool shortcuts, Space for Hand and the active tool's own keys. True when handled. */
  onKeyDown: (e: KeyboardEvent) => boolean
  onKeyUp: (e: KeyboardEvent) => void
}

/** Wires the tools in `tools/` to the editor state: one ToolContext per event, built from the latest state. */
export function useTools(state: PhotoEditorState): ToolsState {
  const [options, setOptions] = useState(() => Object.fromEntries(TOOLS.map((t) => [t.id, defaultOptions(t)])) as Record<ToolId, Record<string, unknown>>)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const latest = useRef({ state, options })
  latest.current = { state, options }
  const held = useRef<ToolId | null>(null)
  const statusTimer = useRef<ReturnType<typeof setTimeout>>()

  const showStatus = useCallback((msg: string) => {
    setStatus(msg)
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), STATUS_MS)
  }, [])
  useEffect(() => () => clearTimeout(statusTimer.current), [])

  const makeCtx = useCallback((): ToolContext => {
    const { state: s, options: o } = latest.current
    return {
      editor: s.editor,
      options: o[s.tool],
      colors: s.colors,
      setColors: s.setColors,
      view: s.view,
      setView: (v) => s.setView(v),
      setOverlay,
      status: showStatus,
      refresh: s.refresh,
      rasterizeText: () => {
        throw new Error('Text tool not available yet')
      }
    }
  }, [showStatus])

  // Leaving a tool, or replacing the document, drops the tool's work in progress.
  const prevTool = useRef(state.tool)
  useEffect(() => {
    const prev = toolById(prevTool.current)
    prevTool.current = state.tool
    prev.cancel?.(makeCtx())
    setOverlay(null)
  }, [state.tool, state.loadId, makeCtx])

  const onPointer = useCallback(
    (phase: PointerPhase, p: ToolPointer) => {
      const { state: s } = latest.current
      if (!s.hasDoc) return
      const tool = toolById(s.tool)
      tool[phase](makeCtx(), p)
    },
    [makeCtx]
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const { state: s } = latest.current
      if (!s.hasDoc || e.ctrlKey || e.metaKey) return false
      if (e.code === 'Space' || e.key === ' ') {
        const next = holdSpace({ tool: s.tool, held: held.current }, 'down')
        held.current = next.held
        if (next.tool !== s.tool) s.setTool(next.tool)
        return true
      }
      if (toolById(s.tool).onKey?.(makeCtx(), e)) return true
      if (e.altKey || e.key.length !== 1) return false
      const id = toolForKey(e.key, { shift: e.shiftKey, current: s.tool })
      if (!id) return false
      held.current = null // picking a tool while holding Space keeps the new one
      s.setTool(id)
      return true
    },
    [makeCtx]
  )

  const release = useCallback(() => {
    const { state: s } = latest.current
    const next = holdSpace({ tool: s.tool, held: held.current }, 'up')
    held.current = null
    if (next.tool !== s.tool) s.setTool(next.tool)
  }, [])

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') release()
    },
    [release]
  )

  // A Space release in another window never arrives; don't stay stuck on Hand.
  useEffect(() => {
    window.addEventListener('blur', release)
    return () => window.removeEventListener('blur', release)
  }, [release])

  const setOption = useCallback((tool: ToolId, id: string, value: unknown) => {
    setOptions((o) => ({ ...o, [tool]: { ...o[tool], [id]: value } }))
  }, [])

  return { options, setOption, overlay, status, cursor: toolById(state.tool).cursor, onPointer, onKeyDown, onKeyUp }
}
