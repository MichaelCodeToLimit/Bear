import { useCallback, useRef } from 'react'
import { clearSelected, copyActiveLayer, invertSelection, selectAll } from './model/clipboardOps'
import { activeLayer } from './model/doc'
import { editableLayer } from './tools/guard'
import { readClipboardImage, writeImageToClipboard } from './clipboard'
import type { PhotoEditorState } from './usePhotoEditor'
import type { ToolsState } from './useTools'

export type EditCommand = 'selectAll' | 'deselect' | 'invertSelection' | 'copy' | 'cut' | 'paste' | 'delete'

/** Selection, clipboard and Delete: runs against the latest editor, so keys and buttons share it. */
export function useEditCommands(state: PhotoEditorState, tools: ToolsState, addIncoming: (files: File[]) => Promise<void>) {
  const latest = useRef({ state, tools, addIncoming })
  latest.current = { state, tools, addIncoming }

  const copy = useCallback(async (cut: boolean) => {
    const { state: s, tools: t } = latest.current
    if (!s.hasDoc || t.busy()) return
    t.commitPending()
    const editor = s.editor
    const ctx = { editor, status: t.notify }
    if (cut && !editableLayer(ctx)) return
    const layer = activeLayer(editor.doc)
    const selection = editor.doc.selection
    const bitmap = copyActiveLayer(editor.doc)
    if (!bitmap) return t.notify('Nothing to copy')
    try {
      await writeImageToClipboard(bitmap)
    } catch {
      return t.notify("Couldn't copy to the clipboard")
    }
    if (!cut) return
    // Something may have changed while the clipboard was being written.
    if (latest.current.state.editor !== editor || activeLayer(editor.doc) !== layer || editor.doc.selection !== selection) return
    clearSelected(editor, layer, 'Cut')
  }, [])

  return useCallback((cmd: EditCommand) => {
    const { state: s, tools: t } = latest.current
    const editor = s.editor
    if (cmd === 'paste') {
      void readClipboardImage().then((file) => (file ? latest.current.addIncoming([file]) : latest.current.tools.notify('The clipboard has no image')))
      return
    }
    if (!s.hasDoc || t.busy()) return
    switch (cmd) {
      case 'copy':
        return void copy(false)
      case 'cut':
        return void copy(true)
      case 'selectAll':
        return selectAll(editor)
      case 'deselect':
        if (editor.doc.selection) editor.setSelection(null)
        return
      case 'invertSelection':
        if (invertSelection(editor) === 'empty') t.notify('Nothing selected')
        return
      case 'delete': {
        if (!editor.doc.selection) return t.notify('Select an area to clear first')
        t.commitPending()
        const layer = editableLayer({ editor, status: t.notify })
        if (layer && !clearSelected(editor, layer, 'Clear')) t.notify('Nothing to clear')
      }
    }
  }, [copy])
}
