import { useEffect } from 'react'
import type { PhotoEditor } from './model/editor'
import type { ViewState } from './render/view'

/**
 * End-to-end tests read the document through `window.__bearPhotoTest.editor()` and the view
 * (zoom and pan, in canvas pixels) through `view()`, but only when a test created
 * `window.__bearPhotoTest` before Photo opened; normal use exposes nothing.
 */
export function useTestHook(editorRef: { current: PhotoEditor }, viewRef: { current: ViewState }) {
  useEffect(() => {
    const hook = (globalThis as { __bearPhotoTest?: { editor?: () => PhotoEditor; view?: () => ViewState } }).__bearPhotoTest
    if (!hook) return
    hook.editor = () => editorRef.current
    hook.view = () => viewRef.current
  }, [editorRef, viewRef])
}
