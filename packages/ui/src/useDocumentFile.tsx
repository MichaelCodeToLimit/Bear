import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  baseName, extensionOf, stripExtension, withExtension,
  type AppInfo, type FileFilter, type OpenedFile, type RecentFile
} from '@bear/core'
import { Button, Modal } from './Modal'

const AUTOSAVE_DELAY = 2500

export interface DocumentFileOptions {
  app: AppInfo
  /** Name for a new, unsaved document ("Document1", "Book1"). */
  untitled: string
  defaultExt: string
  saveFilters: FileFilter[]
  openFilters: FileFilter[]
  /** Extensions that can be written back in place; anything else goes through Save As. */
  savable: Set<string>
  serialize: (path: string) => Promise<Uint8Array>
  /** Load file contents into the app. Return warnings to show the user, if any. */
  load: (file: OpenedFile) => Promise<string[] | void>
  /** Any value that changes on every edit; AutoSave waits for it to settle. */
  changeToken: unknown
}

export interface DocState {
  path: string | null
  name: string
}

/**
 * Everything an editor app needs around "the file": open, save, save as, AutoSave, recent files,
 * the unsaved-changes prompt, window title and close handling.
 */
export function useDocumentFile(opts: DocumentFileOptions) {
  const { app, untitled, defaultExt, saveFilters, openFilters, savable, changeToken } = opts
  const [doc, setDoc] = useState<DocState>({ path: null, name: untitled })
  const [dirty, setDirty] = useState(false)
  const [autosave, setAutosave] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [pending, setPending] = useState<{ label: string; action: () => void } | null>(null)

  // Callers pass fresh closures each render; keep the latest without re-subscribing effects.
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    window.bear.getRecent().then(setRecent)
  }, [])

  useEffect(() => {
    window.bear.setTitle(`${dirty ? '• ' : ''}${doc.name} - Bear ${app.name}`)
  }, [doc.name, dirty, app.name])

  const writeTo = useCallback(async (path: string) => {
    setSaving(true)
    try {
      const bytes = await latest.current.serialize(path)
      await window.bear.saveFile(path, bytes)
      setDoc({ path, name: baseName(path) })
      setDirty(false)
      setRecent(await window.bear.addRecent(path, app.id))
      return true
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`)
      return false
    } finally {
      setSaving(false)
    }
  }, [app.id])

  const saveAs = useCallback(async () => {
    const suggested = withExtension(stripExtension(doc.path ?? doc.name), defaultExt)
    const path = await window.bear.chooseSavePath(suggested, saveFilters)
    return path ? writeTo(path) : false
  }, [doc, defaultExt, saveFilters, writeTo])

  const save = useCallback(async () => {
    if (doc.path && savable.has(extensionOf(doc.path))) return writeTo(doc.path)
    return saveAs()
  }, [doc.path, savable, saveAs, writeTo])

  const canAutosave = !!doc.path && savable.has(extensionOf(doc.path))
  useEffect(() => {
    if (!autosave || !canAutosave || !dirty || saving) return
    const t = setTimeout(() => void writeTo(doc.path!), AUTOSAVE_DELAY)
    return () => clearTimeout(t)
  }, [autosave, canAutosave, dirty, saving, doc.path, writeTo, changeToken])

  const openFile = useCallback(async (file: OpenedFile) => {
    try {
      const warnings = await latest.current.load(file)
      setDoc({ path: file.path, name: file.name })
      setDirty(false)
      setRecent(await window.bear.addRecent(file.path, app.id))
      setNotice(warnings?.length ? `Opened with ${warnings.length} item(s) simplified.` : null)
    } catch (e) {
      setError(`Could not open ${file.name}: ${(e as Error).message}`)
    }
  }, [app.id])

  /** Start a fresh, unsaved document (the caller resets its own content first). */
  const markNew = useCallback((name?: string) => {
    setDoc({ path: null, name: name ?? untitled })
    setDirty(false)
  }, [untitled])

  /** Run `action` now, or after asking to save if there are unsaved changes. */
  const guard = useCallback((label: string, action: () => void) => {
    if (dirty) setPending({ label, action })
    else action()
  }, [dirty])

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(
    () =>
      window.bear.onCloseRequest(() => {
        if (!dirtyRef.current) return true
        setPending({ label: 'close', action: () => window.bear.forceClose() })
        return false
      }),
    []
  )

  const browseOpen = useCallback((after?: () => void) => {
    guard('open another file', async () => {
      const file = await window.bear.openFile(openFilters)
      if (file) {
        after?.()
        await openFile(file)
      }
    })
  }, [guard, openFilters, openFile])

  const openRecent = useCallback((r: RecentFile, after?: () => void) => {
    guard('open another file', async () => {
      try {
        const file = await window.bear.readFile(r.path)
        after?.()
        await openFile(file)
      } catch {
        setRecent(await window.bear.removeRecent(r.path))
        setError(`${r.name} could not be found. It was removed from the recent list.`)
      }
    })
  }, [guard, openFile])

  const exportPdf = useCallback(async () => {
    // Give overlays (the File view) a moment to close before the page is captured.
    await new Promise((r) => setTimeout(r, 50))
    try {
      await window.bear.exportPdf(withExtension(stripExtension(doc.name), 'pdf'))
    } catch (e) {
      setError(`Could not export PDF: ${(e as Error).message}`)
    }
  }, [doc.name])

  const savePrompt: ReactNode = pending && (
    <Modal
      title="Save changes?"
      onClose={() => setPending(null)}
      footer={
        <>
          <Button primary accent={app.color} onClick={async () => {
            const p = pending
            setPending(null)
            if (await save()) p.action()
          }}>Save</Button>
          <Button onClick={() => {
            const p = pending
            setPending(null)
            setDirty(false)
            p.action()
          }}>Don&apos;t save</Button>
          <Button onClick={() => setPending(null)}>Cancel</Button>
        </>
      }
    >
      Do you want to save your changes to <strong>{doc.name}</strong> before you {pending.label}?
    </Modal>
  )

  const banner: ReactNode = (error || notice) && (
    <div className={`flex items-center justify-between px-4 py-1.5 text-[13px] print:hidden ${error ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}>
      <span>{error ?? notice}</span>
      <button onClick={() => { setError(null); setNotice(null) }} className="rounded px-1 hover:bg-black/10" aria-label="Dismiss">×</button>
    </div>
  )

  return {
    doc, dirty, setDirty, saving, recent, setError, setNotice,
    autosave: { enabled: autosave && canAutosave, available: canAutosave, onToggle: () => setAutosave((a) => !a) },
    save, saveAs, openFile, browseOpen, openRecent, markNew, guard, exportPdf,
    statusText: saving ? 'Saving…' : dirty ? 'Unsaved changes' : doc.path ? 'All changes saved' : 'Not saved yet',
    savePrompt, banner
  }
}
