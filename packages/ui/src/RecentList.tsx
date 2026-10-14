import { FileSpreadsheet, FileText } from 'lucide-react'
import { APPS, type RecentFile } from '@bear/core'

export function RecentList({ items, onOpen, empty = 'No recent files yet.' }: { items: RecentFile[]; onOpen: (r: RecentFile) => void; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line rounded border border-line">
      {items.map((r) => {
        const app = APPS.find((a) => a.id === r.app)
        const Icon = r.app === 'sheets' ? FileSpreadsheet : FileText
        return (
          <li key={r.path}>
            <button onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover">
              <Icon size={18} style={{ color: app?.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.name}</span>
                <span className="block truncate text-xs text-muted">{r.path}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{new Date(r.openedAt).toLocaleDateString()}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
