import type { ReactNode } from 'react'
import { Home } from 'lucide-react'
import type { AppInfo } from '@bear/core'
import { AppMark } from './AppMark'

interface TitleBarProps {
  app: AppInfo
  docName: string
  dirty: boolean
  /** Replaces the Edited/Saved text (apps that save automatically). */
  status?: string
  /** `reason`: why AutoSave is unavailable, when it is not just an unsaved file. */
  autosave?: { enabled: boolean; available: boolean; reason?: string | null; onToggle: () => void }
  onHome: () => void
  right?: ReactNode
}

export function TitleBar({ app, docName, dirty, status, autosave, onHome, right }: TitleBarProps) {
  return (
    <header
      className="flex h-10 shrink-0 items-center gap-3 px-3 text-white print:hidden"
      style={{ background: app.color }}
    >
      <button
        onClick={onHome}
        title="Home"
        className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/15"
      >
        <Home size={16} />
        <span className="text-sm font-semibold">{app.name}</span>
      </button>

      {autosave && (
        <label
          className={`flex items-center gap-1.5 text-xs ${autosave.available ? '' : 'opacity-60'}`}
          title={autosave.available ? 'Save automatically every few seconds' : autosave.reason || 'Save the file once to turn on AutoSave'}
        >
          AutoSave
          <button
            role="switch"
            aria-checked={autosave.enabled}
            disabled={!autosave.available}
            onClick={autosave.onToggle}
            className={`relative h-4 w-7 rounded-full transition ${autosave.enabled ? 'bg-white' : 'bg-white/30'}`}
          >
            <span
              className="absolute top-0.5 h-3 w-3 rounded-full transition-all"
              style={{ left: autosave.enabled ? 14 : 2, background: autosave.enabled ? app.color : 'white' }}
            />
          </button>
        </label>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm">
        <AppMark app={app} size={18} />
        <span className="truncate">{docName}</span>
        <span className="text-white/70">{status ? `· ${status}` : dirty ? '· Edited' : '· Saved'}</span>
      </div>

      <div className="flex items-center gap-1">{right}</div>
    </header>
  )
}
