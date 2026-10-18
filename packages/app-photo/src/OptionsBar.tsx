import type { ReactNode } from 'react'
import { toolInfo } from './Toolbox'
import type { ToolId } from './tools/types'

/** The strip under the ribbon with the active tool's settings (filled in by the tool framework). */
export function OptionsBar({ tool, children }: { tool: ToolId; children?: ReactNode }) {
  const info = toolInfo(tool)
  return (
    <div data-testid="photo-options" className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 text-[12px] text-ink print:hidden">
      <span className="flex items-center gap-1.5 font-medium">
        <info.icon size={15} strokeWidth={1.8} className="text-[var(--accent)]" />
        {info.label}
      </span>
      {children}
    </div>
  )
}
