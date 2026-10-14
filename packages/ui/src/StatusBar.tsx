import type { ReactNode } from 'react'

export function StatusBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-3 text-[12px] text-muted print:hidden">
      <div className="flex items-center gap-4">{left}</div>
      <div className="flex items-center gap-3">{right}</div>
    </footer>
  )
}
