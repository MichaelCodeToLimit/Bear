import { TOOL_ICONS } from './Toolbox'
import { toolById } from './tools'
import type { OptionSpec, ToolId } from './tools/types'

function OptionControl({ spec, value, onChange }: { spec: OptionSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = `photo-opt-${spec.id}`
  if (spec.type === 'toggle') {
    return (
      <label className="flex items-center gap-1.5">
        <input id={id} data-testid={`option-${spec.id}`} type="checkbox" checked={value !== false} onChange={(e) => onChange(e.target.checked)} />
        {spec.label}
      </label>
    )
  }
  if (spec.type === 'select') {
    return (
      <label className="flex items-center gap-1.5">
        {spec.label}
        <select id={id} data-testid={`option-${spec.id}`} value={String(value)} onChange={(e) => onChange(e.target.value)} className="rounded border border-line bg-canvas px-1 py-0.5">
          {spec.choices.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="flex items-center gap-1.5">
      {spec.label}
      <input
        id={id}
        data-testid={`option-${spec.id}`}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 accent-[var(--accent)]"
      />
      <span className="w-7 tabular-nums text-muted">{Number(value)}</span>
    </label>
  )
}

/** The strip under the ribbon with the active tool's settings, built from the tool's `options`. */
export function OptionsBar({ tool, values, onChange }: { tool: ToolId; values: Record<string, unknown>; onChange: (id: string, v: unknown) => void }) {
  const t = toolById(tool)
  const Icon = TOOL_ICONS[tool]
  return (
    <div data-testid="photo-options" className="flex h-9 shrink-0 items-center gap-4 border-b border-line bg-surface px-3 text-[12px] text-ink print:hidden">
      <span className="flex items-center gap-1.5 font-medium">
        <Icon size={15} strokeWidth={1.8} className="text-[var(--accent)]" />
        {t.label}
      </span>
      {t.options.map((spec) => (
        <OptionControl key={spec.id} spec={spec} value={values[spec.id] ?? spec.default} onChange={(v) => onChange(spec.id, v)} />
      ))}
    </div>
  )
}
