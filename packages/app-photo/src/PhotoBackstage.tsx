import { FilePlus2, FolderOpen, Info, Save, SaveAll, X } from 'lucide-react'
import { Backstage, Button, RecentList, useDocumentFile, type BackstageItem } from '@bear/ui'
import type { PhotoDoc } from './model/doc'

export type BackstagePage = 'info' | 'open'

interface PhotoBackstageProps {
  page: BackstagePage | null
  setPage: (p: BackstagePage | null) => void
  accent: string
  file: ReturnType<typeof useDocumentFile>
  doc: PhotoDoc | null
  onNew: () => void
  onClose: () => void
}

/** File view: Info, New, Open (with recent images), Save, Save a copy as, Close. */
export function PhotoBackstage({ page, setPage, accent, file, doc, onNew, onClose }: PhotoBackstageProps) {
  const close = () => setPage(null)
  const items: BackstageItem[] = [
    { id: 'info', label: 'Info', icon: Info, onClick: () => setPage('info') },
    { id: 'new', label: 'New', icon: FilePlus2, onClick: onNew },
    { id: 'open', label: 'Open', icon: FolderOpen, onClick: () => setPage('open') },
    { id: 'save', label: 'Save', icon: Save, disabled: !doc, onClick: () => { close(); void file.save() }, dividerBefore: true },
    { id: 'saveas', label: 'Save a copy as…', icon: SaveAll, disabled: !doc, onClick: () => { close(); void file.saveAs() } },
    { id: 'close', label: 'Close', icon: X, onClick: onClose, dividerBefore: true }
  ]
  const { doc: fileDoc } = file
  return (
    <Backstage open={!!page} onClose={close} accent={accent} items={items}>
      {page === 'info' && (
        <div className="max-w-xl">
          <h1 className="mb-6 text-3xl font-light">Info</h1>
          <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
            <dt className="text-muted">Name</dt><dd>{fileDoc.name}</dd>
            <dt className="text-muted">Location</dt>
            <dd className="break-all">
              {fileDoc.path ?? 'Not saved yet'}
              {fileDoc.path && <button onClick={() => window.bear.showInFolder(fileDoc.path!)} className="ml-3 text-[var(--accent)] hover:underline">Show in folder</button>}
            </dd>
            {doc && (
              <>
                <dt className="text-muted">Size</dt><dd>{doc.width} × {doc.height} px</dd>
                <dt className="text-muted">Layers</dt><dd>{doc.layers.length}</dd>
              </>
            )}
            <dt className="text-muted">Status</dt><dd>{file.dirty ? 'Unsaved changes' : 'Saved'}</dd>
          </dl>
        </div>
      )}
      {page === 'open' && (
        <div className="max-w-3xl">
          <h1 className="mb-6 text-3xl font-light">Open</h1>
          <Button primary accent={accent} onClick={() => file.browseOpen(close)}>Browse…</Button>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-muted">Recent images</h2>
          <RecentList items={file.recent.filter((r) => r.app === 'photo')} onOpen={(r) => file.openRecent(r, close)} empty="No recent images yet." />
        </div>
      )}
    </Backstage>
  )
}
