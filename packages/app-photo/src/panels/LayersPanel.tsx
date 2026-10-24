import { useEffect, useRef, useState } from 'react'
import { CopyPlus, Eye, EyeOff, Lock, LockOpen, Merge, Plus, Trash2, type LucideIcon } from 'lucide-react'
import type { BlendMode, Layer } from '../model/doc'
import { BLEND_MODES } from '../ops/blend'
import type { PhotoEditorState } from '../usePhotoEditor'
import { layerThumbnail } from './thumbnail'
import { mergeDownBlocked } from './mergeDown'

const THUMB = 64
const BLEND_LABEL = (m: BlendMode) => m.replace('-', ' ').replace(/^./, (c) => c.toUpperCase())

/** Draws a layer thumbnail, recomputed at most every 200 ms while the document changes. */
function Thumbnail({ layer, docW, docH, version }: { layer: Layer; docW: number; docH: number; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      const c = ref.current
      if (!c) return
      const b = layerThumbnail(layer, docW, docH, THUMB)
      c.width = b.width
      c.height = b.height
      c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0)
    }, 200)
    return () => clearTimeout(t)
  }, [layer, docW, docH, version])
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:8px_8px]">
      <canvas ref={ref} className="max-h-full max-w-full" />
    </span>
  )
}

/** `reason`, when given, says why the button is unavailable (shown in its tooltip). */
function PanelButton({ icon: Icon, label, onClick, disabled, reason }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; reason?: string | null }) {
  return (
    <button title={reason ? `${label}: ${reason}` : label} aria-label={label} onClick={onClick} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-hover disabled:opacity-40">
      <Icon size={15} strokeWidth={1.8} />
    </button>
  )
}

/** Layers, top first: thumbnail, eye, lock, name; opacity and blend for the active layer; drag to reorder. */
export function LayersPanel({ state }: { state: PhotoEditorState }) {
  const { editor, version, hasDoc, refresh } = state
  const doc = editor.doc
  const active = hasDoc ? doc.layers.find((l) => l.id === doc.activeLayerId) : undefined
  const [dragId, setDragId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  // A live opacity drag changes the layer directly; it becomes one history step when released.
  const pendingOpacity = useRef<{ id: string; original: number } | null>(null)

  const select = (id: string) => {
    if (doc.activeLayerId === id) return
    doc.activeLayerId = id
    refresh()
  }
  const commitOpacity = () => {
    const p = pendingOpacity.current
    pendingOpacity.current = null
    const l = p && doc.layers.find((x) => x.id === p.id)
    if (!p || !l) return
    const final = l.opacity
    l.opacity = p.original
    if (final !== p.original) editor.setLayerProps(p.id, { opacity: final })
    else refresh()
  }
  const liveOpacity = (value: number) => {
    if (!active) return
    if (!pendingOpacity.current) pendingOpacity.current = { id: active.id, original: active.opacity }
    active.opacity = value
    refresh()
  }
  const below = active ? doc.layers.indexOf(active) - 1 : -1
  const mergeBlock = active && below >= 0 ? mergeDownBlocked(active, doc.layers[below]) : null
  const rows = [...doc.layers].reverse()

  return (
    <section aria-label="Layers" className="flex min-h-0 flex-1 flex-col border-b border-line">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Layers</h3>
      {hasDoc && active && (
        <div className="flex items-center gap-2 px-3 pb-2 text-[12px]">
          <select
            title="Blend mode"
            value={active.blend}
            onChange={(e) => editor.setLayerProps(active.id, { blend: e.target.value as BlendMode })}
            className="h-7 min-w-0 flex-1 rounded border border-line bg-surface px-1 text-ink outline-none focus:border-[var(--accent)]"
          >
            {BLEND_MODES.map((m) => <option key={m} value={m}>{BLEND_LABEL(m)}</option>)}
          </select>
          <input
            type="range"
            title="Opacity"
            aria-label="Opacity"
            min={0}
            max={100}
            value={Math.round(active.opacity * 100)}
            onChange={(e) => liveOpacity(Number(e.target.value) / 100)}
            onPointerUp={commitOpacity}
            onKeyUp={commitOpacity}
            onBlur={commitOpacity}
            className="w-20 accent-[var(--accent)]"
          />
          <span className="w-9 text-right tabular-nums text-muted">{Math.round(active.opacity * 100)}%</span>
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto" data-version={version}>
        {hasDoc && rows.map((l, i) => (
          <li
            key={l.id}
            data-testid="layer-row"
            data-name={l.name}
            aria-selected={l.id === doc.activeLayerId}
            draggable={renaming !== l.id}
            onDragStart={(e) => {
              setDragId(l.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('application/x-bear-layer', l.id)
            }}
            onDragOver={(e) => {
              if (dragId) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dragId !== l.id) editor.moveLayer(dragId, doc.layers.length - 1 - i)
              setDragId(null)
            }}
            onDragEnd={() => setDragId(null)}
            onClick={() => select(l.id)}
            className={`flex cursor-default items-center gap-1.5 px-2 py-1 text-[12px] ${l.id === doc.activeLayerId ? 'bg-active' : 'hover:bg-hover'} ${dragId === l.id ? 'opacity-50' : ''}`}
          >
            <button
              title={l.visible ? 'Hide layer' : 'Show layer'}
              aria-label={l.visible ? 'Hide layer' : 'Show layer'}
              onClick={(e) => {
                e.stopPropagation()
                editor.setLayerProps(l.id, { visible: !l.visible })
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-ink hover:bg-hover"
            >
              {l.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-muted" />}
            </button>
            <Thumbnail layer={l} docW={doc.width} docH={doc.height} version={version} />
            {renaming === l.id ? (
              <input
                autoFocus
                defaultValue={l.name}
                aria-label="Layer name"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  setRenaming(null)
                  const name = e.target.value.trim()
                  if (name && name !== l.name) editor.setLayerProps(l.id, { name })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-surface px-1 text-ink outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setRenaming(l.id)} title="Double-click to rename">{l.name}</span>
            )}
            <button
              title={l.locked ? 'Unlock layer' : 'Lock layer'}
              aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
              onClick={(e) => {
                e.stopPropagation()
                editor.setLayerProps(l.id, { locked: !l.locked })
              }}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-hover ${l.locked ? 'text-ink' : 'text-muted/50'}`}
            >
              {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-0.5 border-t border-line px-2 py-1">
        <PanelButton icon={Plus} label="New layer" disabled={!hasDoc} onClick={() => editor.addLayer()} />
        <PanelButton icon={CopyPlus} label="Duplicate layer" disabled={!active} onClick={() => active && editor.duplicateLayer(active.id)} />
        <PanelButton icon={Merge} label="Merge down" disabled={!active || below < 0 || !!mergeBlock} reason={mergeBlock} onClick={() => active && editor.mergeDown(active.id)} />
        <PanelButton icon={Trash2} label="Delete layer" disabled={!active || doc.layers.length <= 1} onClick={() => active && editor.deleteLayer(active.id)} />
      </div>
    </section>
  )
}
