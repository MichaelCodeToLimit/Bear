import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, BarChart3, BringToFront, ChevronLeft, ChevronRight, Circle, Copy,
  Eye, EyeOff, FileDown, ImagePlus, LayoutTemplate, Lock, MoreVertical, PaintBucket, Palette, Pencil, Play, Plus, Redo2,
  SendToBack, Shapes, Square, Table2, Trash2, Triangle, Type, Undo2, X, Bold, Italic, Underline, Minus, MoveRight, RectangleHorizontal,
  List, Brush
} from 'lucide-react'
import { baseName, stripExtension } from '@bear/core'
import { prepareImage } from '@bear/ui/src/images'
import { SlidesStore, newPresentation } from '@bear/app-slides/src/store'
import { exportPptx, readPresentation } from '@bear/app-slides/src/file-io'
import { DECK_TEMPLATES } from '@bear/app-slides/src/templates'
import { SlideView } from '@bear/app-slides/src/SlideView'
import { THEMES, getTheme } from '@bear/app-slides/src/themes'
import { LAYOUTS, layoutPreview } from '@bear/app-slides/src/layouts'
import { SLIDE_H, SLIDE_W, hasStyle, hasText, type Box, type ChartElement, type ShapeKind, type SlideElement, type TableElement } from '@bear/app-slides/src/model'
import type { DocInput } from '../Shell'
import { goBack, useLayer } from '../nav'
import { renameDoc, saveNew } from '../files'
import { Button, IconButton, Page, Segmented, Swatches, ask, confirm, menu, sheet, toast, useLongPress } from '../ui'

type Status = 'saved' | 'saving' | 'unsaved' | 'error'
const AUTOSAVE_MS = 1500

export default function SlidesPhone({ input }: { input: DocInput }) {
  const [doc, setDoc] = useState<{ store: SlidesStore; path: string | null; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if ('file' in input) {
      readPresentation(input.file.data)
        .then((pres) => {
          const store = new SlidesStore()
          store.load(pres)
          setDoc({ store, path: input.file.path, name: stripExtension(input.file.name) })
          void window.bear.addRecent(input.file.path, 'slides')
        })
        .catch((e) => setError(`Couldn't open ${input.file.name}: ${(e as Error).message}`))
    } else {
      const t = DECK_TEMPLATES.find((x) => x.id === input.template)
      setDoc({ store: new SlidesStore(t ? t.build() : newPresentation()), path: null, name: !t || t.id === 'blank' ? 'Untitled presentation' : t.name })
    }
  }, [input])
  if (error) return <Page title="Slides" back><div className="m-4 rounded-xl bg-red-100 p-4 text-[14px] text-red-900">{error}</div></Page>
  if (!doc) return <Page title="Opening…" back>{null}</Page>
  return <Deck {...doc} isNew={!('file' in input)} />
}

/** Width of an element, tracked as it resizes. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Deck({ store, path: initialPath, name: initialName, isNew }: { store: SlidesStore; path: string | null; name: string; isNew: boolean }) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const [path, setPath] = useState(initialPath)
  const [name, setName] = useState(initialName)
  const [status, setStatus] = useState<Status>(isNew ? 'unsaved' : 'saved')
  const editor = useLayer<true>()
  const player = useLayer<number>()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const state = useRef({ path, name })
  state.current = { path, name }
  const saving = useRef<Promise<void>>(Promise.resolve())
  const [listRef, listW] = useWidth<HTMLDivElement>()

  useEffect(() => {
    const save = () => {
      dirty.current = false
      setStatus('saving')
      saving.current = saving.current.then(async () => {
        try {
          const data = await exportPptx(store.pres)
          if (state.current.path) await window.bear.saveFile(state.current.path, data)
          else {
            const p = await saveNew(state.current.name, 'pptx', data, 'slides')
            setPath(p)
            setName(stripExtension(baseName(p)))
          }
          setStatus(dirty.current ? 'unsaved' : 'saved')
        } catch (e) {
          dirty.current = true
          setStatus('error')
          toast(`Couldn't save: ${(e as Error).message}`)
        }
      })
    }
    store.onChange = () => {
      dirty.current = true
      setStatus('unsaved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(save, AUTOSAVE_MS)
    }
    if (isNew) store.onChange()
    return () => {
      store.onChange = null
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) save()
    }
  }, [store]) // eslint-disable-line react-hooks/exhaustive-deps

  const pres = store.pres
  const theme = getTheme(pres.theme)
  const statusText = { saved: path ? 'Saved' : 'Not saved yet', saving: 'Saving…', unsaved: path ? 'Editing' : 'Not saved yet', error: 'Not saved' }[status]

  const rename = async () => {
    const v = await ask('Rename presentation', { value: name, ok: 'Rename' })
    if (!v?.trim() || v.trim() === name) return
    if (!path) return setName(v.trim())
    try {
      await saving.current
      const p = await renameDoc(path, v.trim())
      setPath(p)
      setName(stripExtension(baseName(p)))
    } catch (e) {
      toast(`Couldn't rename: ${(e as Error).message}`)
    }
  }

  if (player.value !== null) return <Player store={store} start={player.value} />
  if (editor.value) return <SlideEditor store={store} status={statusText} onPlay={() => player.open(store.current)} />

  const slideMenu = (i: number) => {
    const s = pres.slides[i]
    menu(
      [
        { label: 'Edit', icon: Pencil, onClick: () => { store.goto(i); editor.open(true) } },
        { label: 'Duplicate', icon: Copy, onClick: () => store.duplicateSlide(i) },
        { label: 'Move up', icon: ArrowUp, disabled: i === 0, onClick: () => store.moveSlide(i, i - 1) },
        { label: 'Move down', icon: ArrowDown, disabled: i === pres.slides.length - 1, onClick: () => store.moveSlide(i, i + 1) },
        { label: s.hidden ? 'Show in slide show' : 'Hide in slide show', icon: s.hidden ? Eye : EyeOff, onClick: () => store.setHidden([i], !s.hidden) },
        {
          label: 'Delete slide',
          icon: Trash2,
          danger: true,
          disabled: pres.slides.length <= 1,
          onClick: async () => {
            if (await confirm(`Delete slide ${i + 1}?`, 'Undo brings it back.')) store.deleteSlide(i)
          }
        }
      ],
      `Slide ${i + 1}`
    )
  }

  return (
    <Page
      title={<button onClick={() => void rename()} className="max-w-full truncate text-left">{name}</button>}
      subtitle={`${statusText} · ${pres.slides.length} slide${pres.slides.length === 1 ? '' : 's'}`}
      back
      actions={
        <>
          <IconButton icon={Undo2} label="Undo" onClick={() => store.undo()} />
          <IconButton icon={Play} label="Play from start" onClick={() => player.open(0)} />
          <IconButton
            icon={MoreVertical}
            label="More"
            onClick={() =>
              menu([
                { label: 'Rename', icon: Pencil, onClick: () => void rename() },
                { label: 'Theme', icon: Palette, onClick: () => themeSheet(store) },
                {
                  label: 'Save a copy',
                  icon: FileDown,
                  onClick: async () => {
                    try {
                      const p = await saveNew(`${name} copy`, 'pptx', await exportPptx(store.pres), 'slides')
                      toast(`Saved ${baseName(p)} in Documents/Bear`)
                    } catch (e) {
                      toast(`Couldn't save: ${(e as Error).message}`)
                    }
                  }
                }
              ])
            }
          />
        </>
      }
      fab={
        <button
          onClick={() => layoutSheet(store, () => editor.open(true))}
          className="pointer-events-auto flex h-14 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-white shadow-lg shadow-black/25 active:scale-95"
        >
          <Plus size={22} /> <span className="text-[15px] font-semibold">Slide</span>
        </button>
      }
    >
      <div ref={listRef} className="space-y-4 px-4 pb-28 pt-4">
        {listW > 0 &&
          pres.slides.map((s, i) => (
            <SlideCard
              key={s.id}
              index={i}
              hidden={!!s.hidden}
              onOpen={() => {
                store.goto(i)
                editor.open(true)
              }}
              onMenu={() => slideMenu(i)}
            >
              <SlideView slide={s} theme={theme} width={listW} deck={{ pres, index: i }} />
            </SlideCard>
          ))}
      </div>
    </Page>
  )
}

function SlideCard({ index, hidden, onOpen, onMenu, children }: { index: number; hidden: boolean; onOpen: () => void; onMenu: () => void; children: ReactNode }) {
  const lp = useLongPress(onMenu)
  return (
    <div {...lp.handlers}>
      <div className="mb-1.5 flex items-center gap-2 px-1 text-[13px] text-muted">
        <span className="font-semibold text-ink">{index + 1}</span>
        {hidden && <span className="flex items-center gap-1"><EyeOff size={13} /> Hidden</span>}
        <span className="flex-1" />
        <button aria-label={`Slide ${index + 1} options`} onClick={onMenu} className="-my-2 flex h-9 w-9 items-center justify-center rounded-full active:bg-hover">
          <MoreVertical size={18} />
        </button>
      </div>
      <button onClick={() => !lp.fired.current && onOpen()} className={`block w-full overflow-hidden rounded-xl shadow-md ring-1 ring-black/10 active:opacity-85 ${hidden ? 'opacity-50' : ''}`}>
        {children}
      </button>
    </div>
  )
}

function layoutSheet(store: SlidesStore, after?: () => void) {
  const theme = getTheme(store.pres.theme)
  sheet(
    (close) => (
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-1">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() =>
              close(() => {
                store.addSlide(l.id)
                after?.()
              })
            }
            className="text-left"
          >
            <div className="overflow-hidden rounded-lg ring-1 ring-line">
              <SlideView slide={layoutPreview(l.id, store.pres)} theme={theme} width={(Math.min(window.innerWidth, 600) - 44) / 2} prompts />
            </div>
            <div className="mt-1 text-[13.5px] text-ink">{l.name}</div>
          </button>
        ))}
      </div>
    ),
    'New slide'
  )
}

function themeSheet(store: SlidesStore) {
  const first = store.pres.slides[0]
  sheet(
    (close) => (
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-1">
        {THEMES.map((t) => (
          <button key={t.id} onClick={() => close(() => store.setTheme(t.id))} className="text-left">
            <div className={`overflow-hidden rounded-lg ${store.pres.theme === t.id ? 'ring-[3px] ring-[var(--accent)]' : 'ring-1 ring-line'}`}>
              <SlideView slide={first} theme={t} width={(Math.min(window.innerWidth, 600) - 44) / 2} prompts />
            </div>
            <div className="mt-1 text-[13.5px] text-ink">{t.name}</div>
          </button>
        ))}
      </div>
    ),
    'Theme'
  )
}

// ---------- Editing one slide ----------

function SlideEditor({ store, status, onPlay }: { store: SlidesStore; status: string; onPlay: () => void }) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const [wrapRef, w] = useWidth<HTMLDivElement>()
  const slide = store.slide
  const n = store.pres.slides.length
  const i = store.current
  const sel = store.selection

  useEffect(() => () => store.select([]), [store])

  const editText = (id: string) => {
    const el = store.slide.elements.find((e) => e.id === id)
    if (!el || el.locked) return
    if (hasText(el)) sheet((close) => <TextSheet store={store} id={id} close={close} />, el.kind === 'shape' ? 'Shape text' : 'Text')
    else if (el.kind === 'table') sheet(() => <TableSheet store={store} id={id} />, 'Table', true)
    else if (el.kind === 'chart') sheet(() => <ChartSheet store={store} id={id} />, 'Chart', true)
  }

  return (
    <Page
      title={`Slide ${i + 1} of ${n}`}
      subtitle={status}
      back
      actions={
        <>
          <IconButton icon={Undo2} label="Undo" onClick={() => store.undo()} />
          <IconButton icon={Redo2} label="Redo" onClick={() => store.redo()} />
          <IconButton icon={Play} label="Play from this slide" onClick={onPlay} />
        </>
      }
      bottom={sel.length ? <SelectionBar store={store} onEdit={() => editText(sel[0].id)} /> : <InsertBar store={store} />}
    >
      <div className="px-3 pt-4" ref={wrapRef}>
        {w > 0 && <Canvas store={store} width={w} onEditText={editText} />}
      </div>
      <div className="flex items-center justify-center gap-6 py-3">
        <IconButton icon={ChevronLeft} label="Previous slide" disabled={i === 0} onClick={() => store.goto(i - 1)} className="bg-surface text-ink shadow-sm ring-1 ring-line" />
        <span className="text-[14px] text-muted">{i + 1} / {n}</span>
        <IconButton icon={ChevronRight} label="Next slide" disabled={i === n - 1} onClick={() => store.goto(i + 1)} className="bg-surface text-ink shadow-sm ring-1 ring-line" />
      </div>
      <div className="px-3 pb-8">
        <div className="mb-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Speaker notes</div>
        <textarea
          key={slide.id}
          defaultValue={slide.notes}
          onChange={(e) => store.setNotes(e.target.value)}
          placeholder="Tap to add notes"
          rows={4}
          className="w-full rounded-2xl bg-surface p-4 text-[15px] text-ink shadow-sm outline-none ring-1 ring-line/60"
        />
        {!sel.length && <p className="mt-3 px-1 text-[13px] leading-relaxed text-muted">Tap something on the slide to select it, drag to move it, and tap it again to edit its text. Swipe across the slide to change slides.</p>}
      </div>
    </Page>
  )
}

interface Gesture {
  mode: 'move' | 'resize' | 'swipe'
  x: number
  y: number
  orig: Map<string, Box>
  moved: boolean
  wasSelected: boolean
  id?: string
  ratio?: number
}

function Canvas({ store, width, onEditText }: { store: SlidesStore; width: number; onEditText: (id: string) => void }) {
  const slide = store.slide
  const theme = getTheme(store.pres.theme)
  const scale = width / SLIDE_W
  const g = useRef<Gesture | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const selected = new Set(store.selected)

  const begin = (e: React.PointerEvent, mode: Gesture['mode'], id?: string) => {
    ;(ref.current as HTMLElement).setPointerCapture(e.pointerId)
    const wasSelected = !!id && selected.has(id)
    if (mode === 'move' && id && !wasSelected) store.select(store.withGroupIds([id]))
    const ids = mode === 'resize' && id ? [id] : store.selected
    const orig = new Map<string, Box>()
    for (const el of store.slide.elements) if (ids.includes(el.id)) orig.set(el.id, { x: el.x, y: el.y, w: el.w, h: el.h })
    const el = id ? store.slide.elements.find((x) => x.id === id) : undefined
    g.current = { mode, x: e.clientX, y: e.clientY, orig, moved: false, wasSelected, id, ratio: el?.kind === 'image' ? el.w / el.h : undefined }
  }

  const onMove = (e: React.PointerEvent) => {
    const s = g.current
    if (!s) return
    const dx = (e.clientX - s.x) / scale
    const dy = (e.clientY - s.y) / scale
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return
    if (s.mode === 'swipe') return
    if (!s.moved) {
      s.moved = true
      store.beginLive()
    }
    const locked = new Set(store.slide.elements.filter((x) => x.locked).map((x) => x.id))
    const ids = [...s.orig.keys()].filter((id) => !locked.has(id))
    if (s.mode === 'move') {
      store.update(ids, (el) => {
        const o = s.orig.get(el.id)!
        return { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
      })
    } else {
      store.update(ids, (el) => {
        const o = s.orig.get(el.id)!
        const nw = Math.max(24, Math.round(o.w + dx))
        const nh = s.ratio ? Math.round(nw / s.ratio) : Math.max(el.kind === 'shape' && el.shape === 'line' ? 2 : 24, Math.round(o.h + dy))
        return { w: nw, h: nh }
      })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const s = g.current
    g.current = null
    if (!s) return
    if (s.moved) return store.endLive()
    const dx = e.clientX - s.x
    if (s.mode === 'swipe') {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) store.goto(store.current + (dx < 0 ? 1 : -1))
      else store.select([])
      return
    }
    if (s.mode === 'move' && s.id && s.wasSelected) onEditText(s.id)
  }

  const visible = slide.elements.filter((el) => !el.hidden)
  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-lg shadow-md ring-1 ring-black/10"
      style={{ width, height: (SLIDE_H * width) / SLIDE_W, touchAction: 'none' }}
      onPointerDown={(e) => begin(e, 'swipe')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        if (g.current?.moved) store.endLive()
        g.current = null
      }}
    >
      <SlideView slide={slide} theme={theme} width={width} prompts deck={{ pres: store.pres, index: store.current }}>
        {visible.map((el) => (
          <div
            key={el.id}
            data-el={el.id}
            className="absolute"
            style={{ left: el.x, top: el.y, width: el.w, height: Math.max(el.h, 24), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
            onPointerDown={(e) => {
              e.stopPropagation()
              begin(e, 'move', el.id)
            }}
          >
            {selected.has(el.id) && (
              <>
                <div className="pointer-events-none absolute -inset-[3px] border-[3px] border-[var(--accent)]" style={{ borderWidth: 3 / scale, inset: -3 / scale }} />
                {el.locked ? (
                  <div className="absolute right-0 top-0 flex items-center justify-center rounded-full bg-[var(--accent)] text-white" style={{ width: 28 / scale, height: 28 / scale, transform: 'translate(50%,-50%)' }}>
                    <Lock size={16 / scale} />
                  </div>
                ) : (
                  <div
                    aria-label="Resize"
                    className="absolute bottom-0 right-0 flex items-center justify-center"
                    style={{ width: 44 / scale, height: 44 / scale, transform: 'translate(50%,50%)' }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      begin(e, 'resize', el.id)
                    }}
                  >
                    <span className="rounded-full border-white bg-[var(--accent)] shadow" style={{ width: 18 / scale, height: 18 / scale, borderWidth: 3 / scale }} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </SlideView>
    </div>
  )
}

function Tool({ icon: I, label, onClick, active }: { icon: typeof Type; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[58px] min-w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11.5px] active:bg-hover ${active ? 'text-[var(--accent)]' : 'text-ink'}`}
    >
      <I size={21} />
      {label}
    </button>
  )
}

function InsertBar({ store }: { store: SlidesStore }) {
  const theme = getTheme(store.pres.theme)
  const picture = useRef<HTMLInputElement>(null)
  const shapes: { id: ShapeKind; label: string; icon: typeof Square }[] = [
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'roundRect', label: 'Rounded', icon: RectangleHorizontal },
    { id: 'ellipse', label: 'Oval', icon: Circle },
    { id: 'triangle', label: 'Triangle', icon: Triangle },
    { id: 'arrow', label: 'Arrow', icon: MoveRight },
    { id: 'line', label: 'Line', icon: Minus }
  ]
  return (
    <div className="phone-bottom shrink-0 border-t border-line bg-surface">
      <div className="no-scrollbar flex overflow-x-auto px-1 py-0.5">
        <Tool icon={Type} label="Text" onClick={() => {
          store.addTextBox()
          store.startEditing(null)
          const id = store.selected[0]
          if (id) sheet((close) => <TextSheet store={store} id={id} close={close} />, 'Text')
        }} />
        <Tool icon={Shapes} label="Shape" onClick={() => menu(shapes.map((s) => ({ label: s.label, icon: s.icon, onClick: () => store.addShape(s.id, theme.accents[0]) })), 'Insert shape')} />
        <Tool icon={ImagePlus} label="Picture" onClick={() => picture.current?.click()} />
        <Tool icon={Table2} label="Table" onClick={async () => {
          const v = await ask('Table size (rows × columns)', { value: '3 x 3', ok: 'Insert' })
          const m = v?.match(/(\d+)\D+(\d+)/)
          if (!m) return
          store.addTable(Math.min(20, Math.max(1, +m[1])), Math.min(10, Math.max(1, +m[2])))
        }} />
        <Tool icon={BarChart3} label="Chart" onClick={() => menu((['column', 'bar', 'line', 'pie', 'doughnut'] as const).map((t) => ({ label: t[0].toUpperCase() + t.slice(1), onClick: () => store.addChart(t) })), 'Insert chart')} />
        <Tool icon={LayoutTemplate} label="New slide" onClick={() => layoutSheet(store)} />
        <Tool icon={Brush} label="Background" onClick={() => sheet((close) => <Swatches colors={['#ffffff', '#f5f5f4', '#1f2937', '#111827', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#0f766e', '#be123c', '#4338ca', '#c2410c']} value={store.slide.background} none="Theme background" onPick={(c) => close(() => store.setBackground(c))} />, 'Slide background')} />
        <Tool icon={Palette} label="Theme" onClick={() => themeSheet(store)} />
        <Tool icon={Trash2} label="Delete slide" onClick={async () => {
          if (store.pres.slides.length <= 1) return toast('A presentation needs at least one slide.')
          if (await confirm(`Delete slide ${store.current + 1}?`, 'Undo brings it back.')) store.deleteSlide()
        }} />
      </div>
      <input
        ref={picture}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const img = await prepareImage(f)
            store.addImage(img.src, { w: img.width, h: img.height })
          } catch (err) {
            toast((err as Error).message)
          }
        }}
      />
    </div>
  )
}

function SelectionBar({ store, onEdit }: { store: SlidesStore; onEdit: () => void }) {
  const sel = store.selection
  const el = sel[0]
  const styled = sel.filter(hasStyle)
  const style = styled[0] ? (styled[0] as { style: { fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; align?: string; bullets?: boolean } }).style : null
  const isShape = sel.some((e) => e.kind === 'shape' || (e.kind === 'image' && e.icon))
  const canEdit = el && (hasText(el) || el.kind === 'table' || el.kind === 'chart')
  const size = style?.fontSize ?? 24
  const theme = getTheme(store.pres.theme)
  return (
    <div className="phone-bottom shrink-0 border-t border-line bg-surface">
      <div className="no-scrollbar flex overflow-x-auto px-1 py-0.5">
        <Tool icon={X} label="Done" onClick={() => store.select([])} />
        {canEdit && <Tool icon={Pencil} label="Edit" onClick={onEdit} />}
        {style && (
          <>
            <Tool icon={Minus} label={`${size}pt`} onClick={() => store.setTextStyle({ fontSize: Math.max(8, size - 2) })} />
            <Tool icon={Plus} label="Bigger" onClick={() => store.setTextStyle({ fontSize: Math.min(160, size + 2) })} />
            <Tool icon={Bold} label="Bold" active={style.bold} onClick={() => store.setTextStyle({ bold: !style.bold })} />
            <Tool icon={Italic} label="Italic" active={style.italic} onClick={() => store.setTextStyle({ italic: !style.italic })} />
            <Tool icon={Underline} label="Underline" active={style.underline} onClick={() => store.setTextStyle({ underline: !style.underline })} />
            <Tool icon={Palette} label="Colour" onClick={() => sheet((close) => <Swatches colors={[...theme.accents, theme.title, theme.text, '#ffffff', '#000000', '#dc2626', '#16a34a', '#2563eb', '#ca8a04']} value={style.color} none="Theme colour" onPick={(c) => close(() => store.setTextStyle({ color: c ?? undefined }))} />, 'Text colour')} />
            <Tool
              icon={style.align === 'center' ? AlignCenter : style.align === 'right' ? AlignRight : AlignLeft}
              label="Align"
              onClick={() => store.setTextStyle({ align: style.align === 'left' || !style.align ? 'center' : style.align === 'center' ? 'right' : 'left' })}
            />
            {el && el.kind === 'text' && <Tool icon={List} label="Bullets" active={style.bullets} onClick={() => store.setTextStyle({ bullets: !style.bullets })} />}
          </>
        )}
        {isShape && <Tool icon={PaintBucket} label="Fill" onClick={() => sheet((close) => <Swatches colors={[...theme.accents, '#ffffff', '#000000', '#6b7280', '#dc2626', '#16a34a', '#2563eb', '#ca8a04', '#7c3aed']} none="No fill" onPick={(c) => close(() => store.setFill(c))} />, 'Fill')} />}
        <Tool icon={BringToFront} label="Front" onClick={() => store.reorder('front')} />
        <Tool icon={SendToBack} label="Back" onClick={() => store.reorder('back')} />
        <Tool icon={Copy} label="Duplicate" onClick={() => store.duplicateSelected()} />
        <Tool icon={Lock} label={el?.locked ? 'Unlock' : 'Lock'} active={el?.locked} onClick={() => store.toggleLock()} />
        <Tool icon={Trash2} label="Delete" onClick={() => store.deleteSelected()} />
      </div>
    </div>
  )
}

function TextSheet({ store, id, close }: { store: SlidesStore; id: string; close: () => void }) {
  const el = store.slide.elements.find((e) => e.id === id)
  const [v, setV] = useState(el && hasText(el) ? el.text : '')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(v.length, v.length)
    }, 250)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="px-5 pb-3">
      <textarea
        ref={ref}
        value={v}
        onChange={(e) => {
          setV(e.target.value)
          store.setText(id, e.target.value)
        }}
        rows={5}
        placeholder={el?.kind === 'text' && el.placeholder === 'title' ? 'Title' : 'Text'}
        className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] text-ink outline-none focus:border-[var(--accent)]"
      />
      <p className="mt-1 text-[12.5px] text-muted">Each line becomes a paragraph (or a bullet, in bulleted text).</p>
      <div className="mt-3 flex justify-end">
        <Button onClick={close}>Done</Button>
      </div>
    </div>
  )
}

function TableSheet({ store, id }: { store: SlidesStore; id: string }) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const el = store.slide.elements.find((e): e is TableElement => e.id === id && e.kind === 'table')
  if (!el) return null
  return (
    <div className="px-3 pb-4">
      <div className="mb-3 flex flex-wrap gap-2 px-1">
        <Button kind="tonal" onClick={() => store.insertRow(id, el.rows.length)}>+ Row</Button>
        <Button kind="tonal" onClick={() => store.insertColumn(id, el.rows[0]?.length ?? 0)}>+ Column</Button>
        <Button kind="text" onClick={() => el.rows.length > 1 && store.deleteRow(id, el.rows.length - 1)}>− Row</Button>
        <Button kind="text" onClick={() => (el.rows[0]?.length ?? 0) > 1 && store.deleteColumn(id, el.rows[0].length - 1)}>− Column</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {el.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-line p-0">
                    <input
                      defaultValue={cell}
                      onChange={(e) => store.setCell(id, r, c, e.target.value)}
                      className={`h-11 w-32 bg-transparent px-2 text-[15px] text-ink outline-none focus:bg-[var(--accent)]/10 ${r === 0 && el.header ? 'font-semibold' : ''}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-4 px-1 text-[14.5px] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" checked={el.header} onChange={(e) => store.setTable(id, { header: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" /> Header row</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={el.banded} onChange={(e) => store.setTable(id, { banded: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" /> Banded rows</label>
      </div>
    </div>
  )
}

function ChartSheet({ store, id }: { store: SlidesStore; id: string }) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const el = store.slide.elements.find((e): e is ChartElement => e.id === id && e.kind === 'chart')
  if (!el) return null
  const set = (patch: Partial<Pick<ChartElement, 'chartType' | 'title' | 'categories' | 'series' | 'legend'>>) => store.setChart(id, patch)
  const cellCls = 'h-10 w-24 bg-transparent px-2 text-[14.5px] text-ink outline-none focus:bg-[var(--accent)]/10'
  return (
    <div className="space-y-4 px-4 pb-4">
      <input defaultValue={el.title} onChange={(e) => set({ title: e.target.value })} placeholder="Chart title" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] text-ink outline-none focus:border-[var(--accent)]" />
      <Segmented value={el.chartType} onChange={(t) => set({ chartType: t })} options={(['column', 'bar', 'line', 'pie', 'doughnut'] as const).map((t) => ({ value: t, label: t === 'doughnut' ? 'Ring' : t[0].toUpperCase() + t.slice(1) }))} />
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="border border-line" />
              {el.series.map((s, si) => (
                <th key={si} className="border border-line p-0">
                  <input defaultValue={s.name} onChange={(e) => set({ series: el.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} className={`${cellCls} font-semibold`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {el.categories.map((cat, ci) => (
              <tr key={ci}>
                <td className="border border-line p-0">
                  <input defaultValue={cat} onChange={(e) => set({ categories: el.categories.map((x, i) => (i === ci ? e.target.value : x)) })} className={cellCls} />
                </td>
                {el.series.map((s, si) => (
                  <td key={si} className="border border-line p-0">
                    <input
                      defaultValue={String(s.values[ci] ?? '')}
                      inputMode="decimal"
                      onChange={(e) => set({ series: el.series.map((x, i) => (i === si ? { ...x, values: el.categories.map((_, k) => (k === ci ? Number(e.target.value) || 0 : x.values[k] ?? 0)) } : x)) })}
                      className={cellCls}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button kind="tonal" onClick={() => set({ categories: [...el.categories, `Item ${el.categories.length + 1}`], series: el.series.map((s) => ({ ...s, values: [...s.values, 0] })) })}>+ Category</Button>
        <Button kind="tonal" onClick={() => set({ series: [...el.series, { name: `Series ${el.series.length + 1}`, values: el.categories.map(() => 0) }] })}>+ Series</Button>
        <label className="ml-auto flex items-center gap-2 text-[14.5px] text-ink"><input type="checkbox" checked={el.legend} onChange={(e) => set({ legend: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" /> Legend</label>
      </div>
    </div>
  )
}

// ---------- Slide show ----------

/** Full screen show: turn the phone sideways; tap the right side to go on, the left side to go back. */
function Player({ store, start }: { store: SlidesStore; start: number }) {
  const pres = store.pres
  const shown = pres.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden)
  const [pos, setPos] = useState(() => Math.max(0, shown.findIndex((x) => x.i >= start)))
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [chrome, setChrome] = useState(true)
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    const t = setTimeout(() => setChrome(false), 2500)
    try {
      void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {})
    } catch {
      /* not supported */
    }
    return () => {
      window.removeEventListener('resize', on)
      clearTimeout(t)
      try {
        screen.orientation.unlock?.()
      } catch {
        /* not supported */
      }
    }
  }, [])
  const theme = getTheme(pres.theme)
  const portrait = vp.h > vp.w
  // In portrait the slide is turned sideways so it fills the screen.
  const [aw, ah] = portrait ? [vp.h, vp.w] : [vp.w, vp.h]
  const width = Math.min(aw, (ah * SLIDE_W) / SLIDE_H)
  const cur = shown[pos]
  const done = pos >= shown.length

  const tap = (e: React.MouseEvent) => {
    if (done) return goBack()
    const along = portrait ? e.clientY / vp.h : e.clientX / vp.w
    setChrome(false)
    if (along < 0.3) setPos((p) => Math.max(0, p - 1))
    else setPos((p) => Math.min(shown.length, p + 1))
  }

  return (
    <div className="fixed inset-0 z-40 bg-black" onClick={tap}>
      <div
        className="absolute left-1/2 top-1/2 flex items-center justify-center"
        style={{ width: aw, height: ah, transform: `translate(-50%, -50%)${portrait ? ' rotate(90deg)' : ''}` }}
      >
        {done || !cur ? (
          <div className="text-center text-white/80">
            <div className="text-[18px]">End of slide show</div>
            <div className="mt-2 text-[14px] text-white/50">Tap to go back</div>
          </div>
        ) : (
          <SlideView key={cur.s.id} slide={cur.s} theme={theme} width={width} deck={{ pres, index: cur.i }} live className="phone-fade-in" />
        )}
        {(chrome || done) && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full bg-white/15 px-4 py-1.5 text-[13px] text-white">{done ? 'Press Back to exit' : `${pos + 1} / ${shown.length} · tap right for next, left for back`}</span>
          </div>
        )}
      </div>
      {done && (
        <button onClick={(e) => { e.stopPropagation(); goBack() }} className="absolute right-4 top-4 rounded-full bg-white/15 p-3 text-white" aria-label="Exit slide show">
          <X size={22} />
        </button>
      )}
    </div>
  )
}
