import { useEffect } from 'react'
import type { PhotoEditor } from './model/editor'

/**
 * End-to-end tests read the document through `window.__bearPhotoTest.editor()`, but only when a
 * test created `window.__bearPhotoTest` before Photo opened; normal use exposes nothing.
 */
export function useTestHook(editorRef: { current: PhotoEditor }) {
  useEffect(() => {
    const hook = (globalThis as { __bearPhotoTest?: { editor?: () => PhotoEditor } }).__bearPhotoTest
    if (hook) hook.editor = () => editorRef.current
  }, [editorRef])
}
