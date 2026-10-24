import { useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Play, Trash2, X } from 'lucide-react'
import { elementName, type AnimStart } from './model'
import type { SlidesStore } from './store'
import { EFFECTS, buildSteps, effectKind, effectLabel } from './animation'

const KIND_COLOR = { entrance: '#15803d', emphasis: '#b45309', exit: '#be123c' }

function PaneShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside aria-label={title} className="flex w-[260px] shrink-0 flex-col border-l border-line bg-surface text-[13px] text-ink print:hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="font-semibold">{title}</h2>
        <button aria-label={`Close ${title.toLowerCase()}`} onClick={onClose} className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><X size={14} /></button>
      </div>
      {children}
    </aside>
  )
}

/** Every animation on the slide, in the order it plays: change, reorder, remove, preview. */
export function AnimationPane({ store, onClose, onPreview }: { store: SlidesStore; onClose: () => void; onPreview: () => void }) {
  const slide = store.slide
  const anims = slide.animations ?? []
  const steps = buildSteps(anims)
  const stepOf = new Map(steps.flatMap((s, i) => s.map((t) => [t.anim.id, i])))
  const [open, setOpen] = useState<string | null>(null)
  return (
    <PaneShell title="Animation pane" onClose={onClose}>
      <div className="flex gap-2 border-b border-line px-3 py-2">
        <button onClick={onPreview} disabled={!anims.length} className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:bg-hover disabled:opacity-40"><Play size={13} /> Play from start</button>
      </div>
      <ol aria-label="Animations" className="min-h-0 flex-1 overflow-y-auto">
        {!anims.length && <li className="p-3 text-muted">Select an object, then choose an effect on the Animations tab.</li>}
        {anims.map((a, i) => {
          const el = slide.elements.find((e) => e.id === a.elementId)
          const idx = el ? slide.elements.indexOf(el) : 0
          const kind = effectKind(a.effect)
          return (
            <li key={a.id} className={`border-b border-line ${store.selected.includes(a.elementId) ? 'bg-active' : ''}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="w-5 text-center text-[11px] text-muted">{stepOf.get(a.id) || ''}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[kind] }} title={kind} />
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => { store.select([a.elementId]); setOpen(open === a.id ? null : a.id) }}>
                  {effectLabel(a.effect)}: {el ? elementName(el, idx) : 'missing'}
                </button>
                <button aria-label="Move earlier" disabled={i === 0} onClick={() => store.moveAnimation(a.id, -1)} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><ArrowUp size={13} /></button>
                <button aria-label="Move later" disabled={i === anims.length - 1} onClick={() => store.moveAnimation(a.id, 1)} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><ArrowDown size={13} /></button>
                <button aria-label="Remove animation" onClick={() => store.removeAnimation(a.id)} className="rounded p-0.5 hover:bg-hover"><Trash2 size={13} /></button>
              </div>
              {open === a.id && (
                <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5 px-3 pb-2 text-[12px]">
                  <span className="text-muted">Effect</span>
                  <select aria-label="Effect" value={a.effect} onChange={(e) => store.updateAnimation(a.id, { effect: e.target.value as typeof a.effect })} className="h-7 rounded border border-line bg-surface">
                    {EFFECTS.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.kind})</option>)}
                  </select>
                  <span className="text-muted">Start</span>
                  <select aria-label="Start" value={a.start} onChange={(e) => store.updateAnimation(a.id, { start: e.target.value as AnimStart })} className="h-7 rounded border border-line bg-surface">
                    <option value="click">On click</option>
                    <option value="with">With previous</option>
                    <option value="after">After previous</option>
                  </select>
                  <span className="text-muted">Duration</span>
                  <label className="flex items-center gap-1"><input aria-label="Duration in seconds" type="number" min={0} max={20} step={0.25} value={a.duration / 1000} onChange={(e) => store.updateAnimation(a.id, { duration: Math.round(Number(e.target.value) * 1000) })} className="h-7 w-16 rounded border border-line bg-surface px-1" /> s</label>
                  <span className="text-muted">Delay</span>
                  <label className="flex items-center gap-1"><input aria-label="Delay in seconds" type="number" min={0} max={60} step={0.25} value={a.delay / 1000} onChange={(e) => store.updateAnimation(a.id, { delay: Math.round(Number(e.target.value) * 1000) })} className="h-7 w-16 rounded border border-line bg-surface px-1" /> s</label>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </PaneShell>
  )
}

/** Every object on the slide, front first: select, show/hide, lock, rename, reorder. */
export function SelectionPane({ store, onClose }: { store: SlidesStore; onClose: () => void }) {
  const els = store.slide.elements
  const [renaming, setRenaming] = useState<string | null>(null)
  const ordered = els.map((el, i) => ({ el, i })).reverse()
  return (
    <PaneShell title="Selection pane" onClose={onClose}>
      <div className="flex gap-2 border-b border-line px-3 py-2 text-[12px]">
        <button onClick={() => els.forEach((e) => e.hidden && store.setElementHidden(e.id, false))} className="rounded border border-line px-2 py-1 hover:bg-hover">Show all</button>
        <button onClick={() => els.forEach((e) => !e.hidden && store.setElementHidden(e.id, true))} className="rounded border border-line px-2 py-1 hover:bg-hover">Hide all</button>
      </div>
      <ul aria-label="Objects on this slide" className="min-h-0 flex-1 overflow-y-auto">
        {!els.length && <li className="p-3 text-muted">This slide has no objects.</li>}
        {ordered.map(({ el, i }, pos) => (
          <li key={el.id} className={`flex items-center gap-1 border-b border-line px-2 py-1 ${store.selected.includes(el.id) ? 'bg-active' : ''}`}>
            {renaming === el.id ? (
              <input
                autoFocus
                aria-label="Object name"
                defaultValue={elementName(el, i)}
                onBlur={(e) => { store.rename(el.id, e.target.value); setRenaming(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                className="h-6 min-w-0 flex-1 rounded border border-line bg-surface px-1"
              />
            ) : (
              <button className={`min-w-0 flex-1 truncate text-left ${el.hidden ? 'text-muted line-through' : ''}`} onClick={(e) => (e.shiftKey ? store.toggleSelect(el.id) : store.select([el.id]))} onDoubleClick={() => setRenaming(el.id)} title="Double-click to rename">
                {elementName(el, i)}{el.groupId ? ' (group)' : ''}
              </button>
            )}
            <button aria-label="Bring forward" disabled={pos === 0} onClick={() => store.moveLayer(el.id, i + 1)} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><ArrowUp size={13} /></button>
            <button aria-label="Send backward" disabled={pos === ordered.length - 1} onClick={() => store.moveLayer(el.id, i - 1)} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><ArrowDown size={13} /></button>
            <button aria-label={el.locked ? `Unlock ${elementName(el, i)}` : `Lock ${elementName(el, i)}`} onClick={() => store.toggleLock([el.id])} className="rounded p-0.5 hover:bg-hover">{el.locked ? <Lock size={13} /> : <LockOpen size={13} className="text-muted" />}</button>
            <button aria-label={el.hidden ? `Show ${elementName(el, i)}` : `Hide ${elementName(el, i)}`} onClick={() => store.setElementHidden(el.id, !el.hidden)} className="rounded p-0.5 hover:bg-hover">{el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          </li>
        ))}
      </ul>
    </PaneShell>
  )
}
