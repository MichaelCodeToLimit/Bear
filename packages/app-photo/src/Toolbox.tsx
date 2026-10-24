import {
  Blend, Brush, Crop, Eraser, Hand, Lasso, Move, PaintBucket, Pipette, Shapes, SquareDashed, Type, WandSparkles, ZoomIn,
  type LucideIcon
} from 'lucide-react'
import { TOOLS } from './tools'
import type { ToolId } from './tools/types'

/** Toolbox icons; the tools themselves (label, key, behaviour) live in `tools/`. */
export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  move: Move,
  marquee: SquareDashed,
  lasso: Lasso,
  wand: WandSparkles,
  crop: Crop,
  brush: Brush,
  eraser: Eraser,
  fill: PaintBucket,
  gradient: Blend,
  eyedropper: Pipette,
  text: Type,
  shape: Shapes,
  hand: Hand,
  zoom: ZoomIn
}

/** The tool column down the left side. */
export function Toolbox({ tool, setTool }: { tool: ToolId; setTool: (t: ToolId) => void }) {
  return (
    <nav aria-label="Tools" className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-surface py-1.5">
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.id]
        return (
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
            <Icon size={17} strokeWidth={1.8} />
          </button>
        )
      })}
    </nav>
  )
}
