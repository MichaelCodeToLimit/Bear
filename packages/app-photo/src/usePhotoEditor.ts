import { useCallback, useMemo, useRef, useState } from 'react'
import type { Rect, RGBA } from './model/bitmap'
import { createDoc, type PhotoDoc } from './model/doc'
import { PhotoEditor } from './model/editor'
import type { ViewState } from './render/view'
import type { ToolId } from './tools/types'

export interface PhotoColors {
  fg: RGBA
  bg: RGBA
}

/** Why a change listener runs: a recorded edit (or undo/redo), a non-history refresh, or a new document. */
export type ChangeKind = 'edit' | 'refresh' | 'load'

/** `dirty` is in document coordinates; null means "anything may have changed". */
export type ChangeListener = (dirty: Rect | null, kind: ChangeKind) => void

export interface PhotoEditorState {
  /** The current document's editor. A new one is made for each document, so history starts fresh. */
  editor: PhotoEditor
  /** Changes on every edit, undo/redo, refresh and load: use it as a render dependency. */
  version: number
  /** False until a document is created or opened (the editor then holds a 1×1 placeholder). */
  hasDoc: boolean
  /** Label of the first History row. */
  origin: 'New' | 'Open'
  /** Increments for each document loaded, so the canvas can fit it to the window. */
  loadId: number
  tool: ToolId
  setTool: (t: ToolId) => void
  colors: PhotoColors
  setColors: (c: PhotoColors) => void
  view: ViewState
  setView: (v: ViewState | ((v: ViewState) => ViewState)) => void
  /** Replace the document (new image, open, restore). */
  load: (doc: PhotoDoc, origin: 'New' | 'Open') => void
  /** Redraw after a change made outside history (active layer, a live slider preview). */
  refresh: (dirty?: Rect | null) => void
  subscribe: (fn: ChangeListener) => () => void
}

export const DEFAULT_COLORS: PhotoColors = { fg: [0, 0, 0, 255], bg: [255, 255, 255, 255] }

export function usePhotoEditor(): PhotoEditorState {
  const listeners = useRef(new Set<ChangeListener>())
  const [version, setVersion] = useState(0)
  const [hasDoc, setHasDoc] = useState(false)
  const [origin, setOrigin] = useState<'New' | 'Open'>('New')
  const [loadId, setLoadId] = useState(0)
  const [tool, setTool] = useState<ToolId>('brush')
  const [colors, setColorsState] = useState<PhotoColors>(DEFAULT_COLORS)
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0, viewW: 0, viewH: 0 })

  const emit = useCallback((dirty: Rect | null, kind: ChangeKind) => {
    setVersion((v) => v + 1)
    for (const fn of listeners.current) fn(dirty, kind)
  }, [])

  const attach = useCallback(
    (ed: PhotoEditor) => {
      ed.onChange = (dirty) => emit(dirty, 'edit')
      return ed
    },
    [emit]
  )

  const [editor, setEditor] = useState(() => attach(new PhotoEditor(createDoc(1, 1, 'transparent'))))
  const editorRef = useRef(editor)
  editorRef.current = editor

  const load = useCallback(
    (doc: PhotoDoc, from: 'New' | 'Open') => {
      editorRef.current.onChange = undefined
      const ed = attach(new PhotoEditor(doc))
      editorRef.current = ed
      setEditor(ed)
      setHasDoc(true)
      setOrigin(from)
      setLoadId((n) => n + 1)
      setColorsState({ fg: [...doc.foreground], bg: [...doc.background] })
      emit(null, 'load')
    },
    [attach, emit]
  )

  // Colours are saved in .bearphoto files but are not part of undo history.
  const setColors = useCallback((c: PhotoColors) => {
    setColorsState(c)
    editorRef.current.doc.foreground = [...c.fg]
    editorRef.current.doc.background = [...c.bg]
  }, [])

  const refresh = useCallback((dirty: Rect | null = null) => emit(dirty, 'refresh'), [emit])

  const subscribe = useCallback((fn: ChangeListener) => {
    listeners.current.add(fn)
    return () => void listeners.current.delete(fn)
  }, [])

  return useMemo(
    () => ({ editor, version, hasDoc, origin, loadId, tool, setTool, colors, setColors, view, setView, load, refresh, subscribe }),
    [editor, version, hasDoc, origin, loadId, tool, colors, setColors, view, load, refresh, subscribe]
  )
}
