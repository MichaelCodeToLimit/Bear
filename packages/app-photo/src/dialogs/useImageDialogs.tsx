import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { activeLayer, getLayer, type PhotoDoc } from '../model/doc'
import type { Turns } from '../model/docTransforms'
import type { FilterId } from '../ops/filters'
import { runFilter } from '../ops/runFilter'
import type { Preview } from '../render/compositor'
import { editableLayer } from '../tools/guard'
import type { ToolsState } from '../useTools'
import type { PhotoEditorState } from '../usePhotoEditor'
import { adjustPreview, commitAdjust, type AdjustKind, type InstantAdjust } from './adjustOps'
import { AdjustDialog } from './AdjustDialog'
import { FilterDialog } from './FilterDialog'
import { FILTER_SPECS, isFilterId } from './filterSpecs'
import { FilterSession } from './filterSession'
import { ImageSizeDialog } from './ImageSizeDialog'

export type DialogKind = AdjustKind | InstantAdjust | FilterId | 'imageSize'
export type ImageCommand = { rotate: Turns } | { flip: 'h' | 'v' } | 'trim'

export interface ImageDialogs {
  /** Open a dialog (Invert and Black & White apply at once). */
  open: (kind: DialogKind) => void
  /** Rotate, flip or trim the whole document. */
  command: (cmd: ImageCommand) => void
  /** The live adjustment preview for the canvas. */
  preview: Preview | undefined
  /** The open dialog, if any. */
  element: ReactNode
  /** `doc` as it really is: while a filter preview has swapped a layer's pixels, the original pixels. For saving. */
  docForSave: (doc: PhotoDoc) => PhotoDoc
}

type Open =
  | { kind: AdjustKind; layerId: string; status: string | null }
  | { kind: FilterId; layerId: string; status: string | null; seed: number }
  | { kind: 'imageSize' }

const isAdjust = (k: string): k is AdjustKind => k === 'brightness' || k === 'levels' || k === 'curves' || k === 'hsl'

/** Wires the Adjust, Filters and Image commands to the editor: dialogs, previews and one history step per Apply. */
export function useImageDialogs({ state, tools, accent, notify }: { state: PhotoEditorState; tools: ToolsState; accent: string; notify: (text: string) => void }): ImageDialogs {
  const [open, setOpen] = useState<Open | null>(null)
  const [preview, setPreview] = useState<Preview | undefined>()
  const [busy, setBusy] = useState(false)
  const session = useRef<FilterSession | null>(null)
  const latest = useRef({ state, tools, notify })
  latest.current = { state, tools, notify }

  const close = useCallback(() => {
    session.current?.cancel()
    session.current = null
    setPreview(undefined)
    setBusy(false)
    setOpen(null)
  }, [])

  /** The active layer if it may be changed; otherwise its reason, also shown in the status bar. */
  const checkLayer = () => {
    let status: string | null = null
    let layer = null
    latest.current.tools.withContext((ctx) => {
      const report = (m: string) => {
        status = m
        ctx.status(m)
      }
      layer = editableLayer({ editor: ctx.editor, status: report })
    })
    return { layer: layer as ReturnType<typeof editableLayer>, status: status as string | null }
  }

  /** Finish whatever a tool had going, so the dialog starts from settled pixels. */
  const settleTools = () => {
    latest.current.tools.cancelGesture()
    latest.current.tools.commitPending()
  }

  const openDialog = useCallback((kind: DialogKind) => {
    const { state: s } = latest.current
    if (!s.hasDoc) return
    settleTools()
    if (kind === 'imageSize') return setOpen({ kind })
    const { layer, status } = checkLayer()
    if (kind === 'invert' || kind === 'bw') {
      if (layer) commitAdjust(s.editor, layer, kind, null)
      return
    }
    const layerId = activeLayer(s.editor.doc).id
    if (isAdjust(kind)) return setOpen({ kind, layerId, status })
    session.current = layer
      ? new FilterSession({
          editor: s.editor,
          layer,
          id: kind,
          title: FILTER_SPECS[kind].title,
          run: runFilter,
          refresh: () => latest.current.state.refresh(),
          onError: (m) => latest.current.notify(m),
          onBusy: setBusy
        })
      : null
    setOpen({ kind, layerId, status, seed: Math.floor(Math.random() * 0x7fffffff) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Undo, redo or a History click while a preview dialog is open cancels it first, so no preview is baked in.
  const editor = state.editor
  const previewOpen = !!open && open.kind !== 'imageSize'
  useEffect(() => {
    if (!previewOpen) return
    const h = editor.history
    const prev = h.beforeNavigate
    const mine = () => {
      close()
      prev?.()
    }
    h.beforeNavigate = mine
    return () => {
      if (h.beforeNavigate === mine) h.beforeNavigate = prev
    }
  }, [previewOpen, editor, close])

  // A new document closes any dialog without touching it.
  useEffect(() => close, [state.loadId, close])

  const command = useCallback((cmd: ImageCommand) => {
    const { state: s, tools: t } = latest.current
    if (!s.hasDoc) return
    settleTools()
    if (cmd === 'trim') {
      if (!s.editor.trim()) t.withContext((ctx) => ctx.status('There is nothing to trim'))
    } else if ('rotate' in cmd) s.editor.rotateDoc(cmd.rotate)
    else s.editor.flipDoc(cmd.flip)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const docForSave = useCallback((doc: PhotoDoc): PhotoDoc => {
    const sess = session.current
    if (!sess?.previewing) return doc
    return { ...doc, layers: doc.layers.map((l) => (l.id === sess.layerId ? { ...l, pixels: sess.originalPixels } : l)) }
  }, [])

  const undo = () => editor.history.undo()
  const redo = () => editor.history.redo()
  let element: ReactNode = null
  if (open?.kind === 'imageSize') {
    const d = editor.doc
    element = (
      <ImageSizeDialog
        accent={accent}
        width={d.width}
        height={d.height}
        onApply={(w, h) => {
          setOpen(null)
          if (w !== d.width || h !== d.height) editor.resizeImage(w, h)
        }}
        onClose={() => setOpen(null)}
      />
    )
  } else if (open && isAdjust(open.kind)) {
    const { kind, layerId, status } = open
    element = (
      <AdjustDialog
        key={kind}
        kind={kind}
        accent={accent}
        status={status}
        onChange={(params) => !status && setPreview(adjustPreview(kind, params, layerId, editor.doc.selection))}
        onApply={(params) => {
          const layer = getLayer(editor.doc, layerId)
          if (layer && !status) commitAdjust(editor, layer, kind, params)
          setPreview(undefined)
          setOpen(null)
        }}
        onCancel={close}
        onUndo={undo}
        onRedo={redo}
      />
    )
  } else if (open && isFilterId(open.kind) && 'seed' in open) {
    element = (
      <FilterDialog
        key={open.kind}
        id={open.kind}
        accent={accent}
        status={open.status}
        busy={busy}
        seed={open.seed}
        onChange={(params) => session.current?.update(params)}
        onApply={(params) => {
          const sess = session.current
          if (!sess) return
          void sess.apply(params).then((ok) => {
            if (!ok || session.current !== sess) return
            session.current = null
            setOpen(null)
          })
        }}
        onCancel={close}
        onUndo={undo}
        onRedo={redo}
      />
    )
  }

  return { open: openDialog, command, preview, element, docForSave }
}
