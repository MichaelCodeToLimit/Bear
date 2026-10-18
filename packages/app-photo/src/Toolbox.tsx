import {
  Blend, Brush, Crop, Eraser, Hand, Lasso, Move, PaintBucket, Pipette, Shapes, SquareDashed, Type, WandSparkles, ZoomIn,
  type LucideIcon
} from 'lucide-react'
import type { ToolId } from './tools/types'

export interface ToolInfo {
  id: ToolId
  label: string
  /** Keyboard shortcut (spec §3); Fill and Gradient share G, with Shift+G switching between them. */
  key: string
  icon: LucideIcon
}

export const TOOL_INFO: ToolInfo[] = [
  { id: 'move', label: 'Move', key: 'V', icon: Move },
  { id: 'marquee', label: 'Marquee', key: 'M', icon: SquareDashed },
  { id: 'lasso', label: 'Lasso', key: 'L', icon: Lasso },
  { id: 'wand', label: 'Magic wand', key: 'W', icon: WandSparkles },
  { id: 'crop', label: 'Crop', key: 'C', icon: Crop },
  { id: 'brush', label: 'Brush', key: 'B', icon: Brush },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser },
  { id: 'fill', label: 'Fill', key: 'G', icon: PaintBucket },
  { id: 'gradient', label: 'Gradient', key: 'G', icon: Blend },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I', icon: Pipette },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'shape', label: 'Shape', key: 'U', icon: Shapes },
  { id: 'hand', label: 'Hand', key: 'H', icon: Hand },
  { id: 'zoom', label: 'Zoom', key: 'Z', icon: ZoomIn }
]

export const toolInfo = (id: ToolId): ToolInfo => TOOL_INFO.find((t) => t.id === id)!

/** The tool column down the left side. */
export function Toolbox({ tool, setTool }: { tool: ToolId; setTool: (t: ToolId) => void }) {
  return (
    <nav aria-label="Tools" className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-surface py-1.5">
      {TOOL_INFO.map((t) => (
        <button
          key={t.id}
          data-testid={`tool-${t.id}`}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => setTool(t.id)}
          onMouseDown={(e) => e.preventDefault()}
          className={`flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-hover ${tool === t.id ? 'bg-active text-[var(--accent)]' : ''}`}
        >
          <t.icon size={17} strokeWidth={1.8} />
        </button>
      ))}
    </nav>
  )
}
