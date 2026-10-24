import { useMemo } from 'react'
import {
  AArrowDown, AArrowUp, AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, ArrowRight, BringToFront, Baseline, Bold, Circle, ClipboardPaste, Copy, CopyPlus,
  Grid3x3, ImagePlus, Italic, LayoutTemplate, List, ListOrdered, Minus, Monitor, Moon, PaintBucket, Palette, Play, PlayCircle,
  RectangleHorizontal, Scissors, SendToBack, Shapes, Square, SquareDashed, StickyNote, Sun, Trash2, Triangle, Type,
  Underline, AlignStartVertical, AlignEndVertical, AlignCenterVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignCenterHorizontal, ArrowUpToLine, ArrowDownToLine, PenLine, Strikethrough, Paintbrush, Search, Replace, Group,
  Ungroup, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, Lock, Layers, Table2, Smile, ChartColumn, Film, Music,
  Sparkles, Clapperboard, Timer, Settings2, EyeOff, Presentation, PanelRight, LayoutPanelTop, X, Crop, Blend, Rows3,
  Columns3, BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart, BetweenVerticalEnd, Heading, Highlighter,
  ChartPie, ChartBar, ChartLine, CircleDot, PanelTop, Type as TextIcon, ImageDown, FileText
} from 'lucide-react'
import {
  ColorButton, Ribbon, RibbonButton, RibbonDropdown, RibbonGroup, RibbonRow, RibbonRows, RibbonSelect, type ThemeMode
} from '@bear/ui'
import { hasStyle, type ChartType, type ImageElement, type MediaElement, type ShapeKind, type TableElement, type TextStyle, type TransitionType } from './model'
import { LAYOUTS, newSlide, type LayoutId } from './layouts'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import { THEMES, getTheme } from './themes'
import { EFFECTS, TRANSITIONS } from './animation'
import { CropControls, IconPicker, TableSizePicker, TransparencyControl } from './pickers'
import type { ShowMode } from './Presenter'

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88]
const FONTS = ['heading', 'body', 'Segoe UI', 'Calibri', 'Arial', 'Georgia', 'Cambria', 'Times New Roman', 'Verdana', 'Consolas']
const SPACING = [1, 1.15, 1.5, 2, 2.5, 3]

export const SHAPES: { id: ShapeKind; label: string; icon: typeof Square }[] = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'roundRect', label: 'Rounded rectangle', icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Oval', icon: Circle },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'line', label: 'Line', icon: Minus }
]

const CHARTS: { id: ChartType; label: string; icon: typeof Square }[] = [
  { id: 'column', label: 'Column', icon: ChartColumn },
  { id: 'bar', label: 'Bar', icon: ChartBar },
  { id: 'line', label: 'Line', icon: ChartLine },
  { id: 'pie', label: 'Pie', icon: ChartPie },
  { id: 'doughnut', label: 'Doughnut', icon: CircleDot }
]

export type SlidesDialog = 'find' | 'replace' | 'footer' | 'setup' | 'chart' | 'media'

export interface SlidesRibbonProps {
  store: SlidesStore
  tab: string
  setTab: (t: string) => void
  onFile: () => void
  accent: string
  view: 'normal' | 'sorter'
  setView: (v: 'normal' | 'sorter') => void
  showNotes: boolean
  setShowNotes: (v: boolean) => void
  present: (mode: ShowMode, fromCurrent: boolean) => void
  insertPicture: () => void
  insertMedia: (kind: 'video' | 'audio') => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  pane: 'animation' | 'selection' | null
  setPane: (p: 'animation' | 'selection' | null) => void
  openDialog: (d: SlidesDialog) => void
  exportPictures: () => void
  exportNotes: () => void
}

function LayoutGallery({ store, onPick }: { store: SlidesStore; onPick: (l: LayoutId) => void }) {
  const theme = getTheme(store.pres.theme)
  const samples = useMemo(() => LAYOUTS.map((l) => ({ ...l, slide: newSlide(l.id, store.pres) })), [store.pres.layoutBoxes]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-3 gap-2">
      {samples.map((l) => (
        <button key={l.id} aria-label={`${l.name} layout`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(l.id)} className="rounded p-1 text-left hover:bg-hover">
          <div className="pointer-events-none rounded-sm border border-line"><SlideView slide={l.slide} theme={theme} width={112} prompts /></div>
          <div className="mt-1 text-[11px] text-ink">{l.name}</div>
        </button>
      ))}
    </div>
  )
}

function ShapeGallery({ onPick }: { onPick: (s: ShapeKind) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {SHAPES.map((s) => (
        <button key={s.id} title={s.label} aria-label={s.label} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s.id)} className="flex flex-col items-center gap-1 rounded p-2 text-[11px] text-ink hover:bg-hover">
          <s.icon size={22} strokeWidth={1.6} className="text-[var(--accent)]" />
          {s.label}
        </button>
      ))}
    </div>
  )
}

function ChartGallery({ onPick }: { onPick: (c: ChartType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {CHARTS.map((c) => (
        <button key={c.id} aria-label={`${c.label} chart`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c.id)} className="flex flex-col items-center gap-1 rounded p-2 text-[11px] text-ink hover:bg-hover">
          <c.icon size={22} strokeWidth={1.6} className="text-[var(--accent)]" />
          {c.label}
        </button>
      ))}
    </div>
  )
}

export function SlidesRibbon(p: SlidesRibbonProps) {
  const { store, accent } = p
  const theme = getTheme(store.pres.theme)
  const sel = store.selection
  const textEls = sel.filter(hasStyle)
  const style: TextStyle = textEls[0]?.style ?? {}
  const shapes = sel.filter((e) => e.kind === 'shape')
  const none = !sel.length
  const single = sel.length === 1 ? sel[0] : null
  const image = single?.kind === 'image' ? (single as ImageElement) : null
  const table = single?.kind === 'table' ? (single as TableElement) : null
  const chart = single?.kind === 'chart' ? single : null
  const media = single?.kind === 'media' ? (single as MediaElement) : null
  const master = store.masterTarget
  const setStyle = (patch: Partial<TextStyle>) => store.setTextStyle(patch)
  const addShape = (s: ShapeKind) => store.addShape(s, theme.accents[0])
  const slide = store.pres.slides[store.current]

  const tabs = master
    ? [{ id: 'master', label: 'Slide Master' }, { id: 'home', label: 'Home' }, { id: 'insert', label: 'Insert' }]
    : [
        { id: 'home', label: 'Home' },
        { id: 'insert', label: 'Insert' },
        { id: 'design', label: 'Design' },
        { id: 'transitions', label: 'Transitions' },
        { id: 'animations', label: 'Animations' },
        { id: 'show', label: 'Slide Show' },
        { id: 'view', label: 'View' }
      ]
  // Tool tabs for what's selected, as in other presentation apps.
  if (sel.length && !table && !chart && !media) tabs.push({ id: 'format', label: image ? 'Picture Format' : 'Shape Format' })
  if (table) tabs.push({ id: 'table', label: 'Table Design' })
  if (chart) tabs.push({ id: 'chart', label: 'Chart Design' })
  if (media) tabs.push({ id: 'media', label: media.mediaType === 'video' ? 'Video' : 'Audio' })
  const active = tabs.some((t) => t.id === p.tab) ? p.tab : tabs[0].id

  const curSize = style.fontSize ?? 18
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? SIZES.find((s) => s > curSize) ?? curSize : [...SIZES].reverse().find((s) => s < curSize) ?? curSize
    setStyle({ fontSize: next })
  }
  const fontValue = style.font ?? (textEls[0]?.kind === 'text' && textEls[0].placeholder === 'title' ? 'heading' : 'body')
  const transition = slide?.transition
  const firstAnim = single && slide?.animations?.find((a) => a.elementId === single.id)

  const newSlideButton = (
    <RibbonDropdown icon={LayoutTemplate} label="New slide" width={400}>
      {(close) => <LayoutGallery store={store} onPick={(l) => { close(); store.addSlide(l) }} />}
    </RibbonDropdown>
  )

  const arrange = (
    <RibbonGroup label="Arrange">
      <RibbonRows>
        <RibbonRow>
          <RibbonButton icon={BringToFront} label="Bring to front" disabled={none} onClick={() => store.reorder('front')} />
          <RibbonButton icon={ArrowUpToLine} label="Bring forward" disabled={none} onClick={() => store.reorder(1)} />
          <RibbonButton icon={ArrowDownToLine} label="Send backward" disabled={none} onClick={() => store.reorder(-1)} />
          <RibbonButton icon={SendToBack} label="Send to back" disabled={none} onClick={() => store.reorder('back')} />
          <RibbonButton icon={Group} label="Group" disabled={!store.canGroup} onClick={() => store.group()} shortcut="Ctrl+G" />
          <RibbonButton icon={Ungroup} label="Ungroup" disabled={!store.canUngroup} onClick={() => store.ungroup()} shortcut="Ctrl+Shift+G" />
        </RibbonRow>
        <RibbonRow>
          <RibbonButton icon={AlignStartVertical} label="Align left edges" disabled={none} onClick={() => store.align('left')} />
          <RibbonButton icon={AlignCenterVertical} label="Align centers" disabled={none} onClick={() => store.align('center')} />
          <RibbonButton icon={AlignEndVertical} label="Align right edges" disabled={none} onClick={() => store.align('right')} />
          <RibbonButton icon={AlignStartHorizontal} label="Align tops" disabled={none} onClick={() => store.align('top')} />
          <RibbonButton icon={AlignCenterHorizontal} label="Align middles" disabled={none} onClick={() => store.align('middle')} />
          <RibbonButton icon={AlignEndHorizontal} label="Align bottoms" disabled={none} onClick={() => store.align('bottom')} />
        </RibbonRow>
      </RibbonRows>
    </RibbonGroup>
  )

  const insertGroups = (
    <>
      {!master && <RibbonGroup label="Slides">{newSlideButton}</RibbonGroup>}
      <RibbonGroup label="Tables">
        <RibbonDropdown icon={Table2} label="Table" width={240}>
          {(close) => <TableSizePicker onPick={(r, c) => { close(); store.addTable(r, c) }} />}
        </RibbonDropdown>
      </RibbonGroup>
      <RibbonGroup label="Images">
        <RibbonButton large icon={ImagePlus} label="Picture" onClick={p.insertPicture} />
        <RibbonDropdown icon={Smile} label="Icons" width={320}>
          {(close) => <IconPicker onPick={(n) => { close(); store.addIcon(n, theme.accents[0]) }} />}
        </RibbonDropdown>
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <RibbonDropdown icon={Shapes} label="Shapes" width={250}>
          {(close) => <ShapeGallery onPick={(s) => { close(); addShape(s) }} />}
        </RibbonDropdown>
        <RibbonDropdown icon={ChartColumn} label="Chart" width={250}>
          {(close) => <ChartGallery onPick={(c) => { close(); store.addChart(c) }} />}
        </RibbonDropdown>
      </RibbonGroup>
      <RibbonGroup label="Text">
        <RibbonButton large icon={Type} label="Text box" onClick={() => store.addTextBox()} />
        {!master && <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => p.openDialog('footer')} />}
      </RibbonGroup>
      <RibbonGroup label="Media">
        <RibbonButton large icon={Film} label="Video" onClick={() => p.insertMedia('video')} />
        <RibbonButton large icon={Music} label="Audio" onClick={() => p.insertMedia('audio')} />
      </RibbonGroup>
    </>
  )

  return (
    <Ribbon tabs={tabs} active={active} onChange={p.setTab} onFile={p.onFile} accent={accent}>
      {active === 'master' && master && (
        <>
          <RibbonGroup label="Edit">
            <RibbonButton large icon={LayoutPanelTop} label="Slide master" active={master === 'master'} onClick={() => store.editMaster('master')} />
            <RibbonButton large icon={RotateCcw} label="Reset layout" disabled={master === 'master' || !store.pres.layoutBoxes?.[master]} onClick={() => master !== 'master' && store.resetLayout(master)} />
          </RibbonGroup>
          <RibbonGroup label="Insert">
            <RibbonButton large icon={Type} label="Text box" disabled={master !== 'master'} onClick={() => store.addTextBox()} />
            <RibbonButton large icon={ImagePlus} label="Picture" disabled={master !== 'master'} onClick={p.insertPicture} />
            <RibbonDropdown icon={Shapes} label="Shapes" width={250}>
              {(close) => <ShapeGallery onPick={(s) => { close(); if (master === 'master') addShape(s) }} />}
            </RibbonDropdown>
          </RibbonGroup>
          <RibbonGroup label="Footer">
            <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => p.openDialog('footer')} />
          </RibbonGroup>
          <RibbonGroup label="Close">
            <RibbonButton large icon={X} label="Close master view" onClick={() => store.editMaster(null)} />
          </RibbonGroup>
        </>
      )}

      {active === 'home' && (
        <>
          {!master && (
            <RibbonGroup label="Slides">
              {newSlideButton}
              <RibbonRows>
                <RibbonButton icon={CopyPlus} label="Duplicate" showLabel onClick={() => store.duplicateSlide()} />
                <RibbonButton icon={Trash2} label="Delete slide" showLabel disabled={store.pres.slides.length <= 1} onClick={() => store.deleteSlide()} />
              </RibbonRows>
            </RibbonGroup>
          )}
          <RibbonGroup label="Clipboard">
            <RibbonButton large icon={ClipboardPaste} label="Paste" disabled={!store.canPaste} onClick={() => store.paste()} shortcut="Ctrl+V" />
            <RibbonRows>
              <RibbonButton icon={Scissors} label="Cut" showLabel disabled={none} onClick={() => store.cut()} shortcut="Ctrl+X" />
              <RibbonButton icon={Copy} label="Copy" showLabel disabled={none} onClick={() => store.copy()} shortcut="Ctrl+C" />
              <RibbonButton icon={Paintbrush} label="Format painter" showLabel active={!!store.painter} disabled={!single && !store.painter} onClick={() => (store.painter ? store.cancelPainter() : store.copyFormat())} />
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Font">
            <RibbonRows>
              <RibbonRow>
                <RibbonSelect title="Font" width={128} value={fontValue}
                  options={FONTS.map((f) => ({ value: f, label: f === 'heading' ? `${theme.headingFont} (Headings)` : f === 'body' ? `${theme.bodyFont} (Body)` : f }))}
                  onChange={(f) => setStyle({ font: f })} />
                <RibbonSelect title="Font size" width={54} value={String(curSize)} options={SIZES.map((s) => ({ value: String(s), label: String(s) }))} onChange={(v) => setStyle({ fontSize: Number(v) })} />
                <RibbonButton icon={AArrowUp} label="Grow font" disabled={!textEls.length} onClick={() => step(1)} shortcut="Ctrl+]" />
                <RibbonButton icon={AArrowDown} label="Shrink font" disabled={!textEls.length} onClick={() => step(-1)} shortcut="Ctrl+[" />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={Bold} label="Bold" active={!!style.bold} disabled={!textEls.length} onClick={() => setStyle({ bold: !style.bold })} shortcut="Ctrl+B" />
                <RibbonButton icon={Italic} label="Italic" active={!!style.italic} disabled={!textEls.length} onClick={() => setStyle({ italic: !style.italic })} shortcut="Ctrl+I" />
                <RibbonButton icon={Underline} label="Underline" active={!!style.underline} disabled={!textEls.length} onClick={() => setStyle({ underline: !style.underline })} shortcut="Ctrl+U" />
                <RibbonButton icon={Strikethrough} label="Strikethrough" active={!!style.strike} disabled={!textEls.length} onClick={() => setStyle({ strike: !style.strike })} />
                <RibbonButton icon={Highlighter} label="Text shadow" active={!!style.shadow} disabled={!textEls.length} onClick={() => setStyle({ shadow: !style.shadow })} />
                <ColorButton icon={Baseline} label="Font color" color={style.color ?? theme.accents[0]} onPick={(c) => setStyle({ color: c ?? undefined })} />
                <ColorButton icon={TextIcon} label="Text outline" color={style.outline ?? '#1f2937'} onPick={(c) => setStyle({ outline: c ?? undefined })} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Paragraph">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={AlignLeft} label="Align left" active={(style.align ?? 'left') === 'left' && !!textEls.length} disabled={!textEls.length} onClick={() => setStyle({ align: 'left' })} />
                <RibbonButton icon={AlignCenter} label="Center" active={style.align === 'center'} disabled={!textEls.length} onClick={() => setStyle({ align: 'center' })} />
                <RibbonButton icon={AlignRight} label="Align right" active={style.align === 'right'} disabled={!textEls.length} onClick={() => setStyle({ align: 'right' })} />
                <RibbonButton icon={List} label="Bullets" active={!!style.bullets} disabled={!textEls.length} onClick={() => setStyle({ bullets: !style.bullets, numbered: undefined })} />
                <RibbonButton icon={ListOrdered} label="Numbering" active={!!style.numbered} disabled={!textEls.length} onClick={() => setStyle({ numbered: !style.numbered, bullets: undefined })} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={AlignVerticalJustifyStart} label="Text top" active={style.valign === 'top'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'top' })} />
                <RibbonButton icon={AlignVerticalJustifyCenter} label="Text middle" active={style.valign === 'middle'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'middle' })} />
                <RibbonButton icon={AlignVerticalJustifyEnd} label="Text bottom" active={style.valign === 'bottom'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'bottom' })} />
                <RibbonSelect title="Line spacing" width={64} value={String(style.lineSpacing ?? 1)} options={SPACING.map((s) => ({ value: String(s), label: `${s}×` }))} onChange={(v) => setStyle({ lineSpacing: Number(v) === 1 ? undefined : Number(v) })} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Drawing">
            <RibbonDropdown icon={Shapes} label="Shapes" width={250}>
              {(close) => <ShapeGallery onPick={(s) => { close(); addShape(s) }} />}
            </RibbonDropdown>
            <RibbonRows>
              <ColorButton icon={PaintBucket} label="Shape fill" color={(shapes[0] as { fill?: string })?.fill ?? theme.accents[0]} onPick={(c) => store.setFill(c)} />
              <ColorButton icon={PenLine} label="Shape outline" color={(shapes[0] as { stroke?: string })?.stroke ?? '#1f2937'} onPick={(c) => store.setOutline(c)} />
            </RibbonRows>
          </RibbonGroup>
          {arrange}
          <RibbonGroup label="Editing">
            <RibbonRows>
              <RibbonButton icon={Search} label="Find" showLabel onClick={() => p.openDialog('find')} shortcut="Ctrl+F" />
              <RibbonButton icon={Replace} label="Replace" showLabel onClick={() => p.openDialog('replace')} shortcut="Ctrl+H" />
              <RibbonButton icon={Layers} label="Selection pane" showLabel active={p.pane === 'selection'} onClick={() => p.setPane(p.pane === 'selection' ? null : 'selection')} />
            </RibbonRows>
          </RibbonGroup>
        </>
      )}

      {active === 'insert' && insertGroups}

      {active === 'design' && (
        <>
          <RibbonGroup label="Themes">
            <div className="flex items-center gap-2 px-1">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  title={t.name}
                  aria-label={`${t.name} theme`}
                  aria-pressed={t.id === store.pres.theme}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => store.setTheme(t.id)}
                  className="rounded-sm"
                  style={{ outline: t.id === store.pres.theme ? `2.5px solid ${accent}` : '1px solid var(--line)', outlineOffset: 1 }}
                >
                  <div className="flex h-[52px] w-[92px] flex-col justify-center overflow-hidden px-2 text-left" style={{ background: t.background }}>
                    <div className="truncate text-[13px] font-semibold" style={{ color: t.title, fontFamily: t.headingFont }}>Aa</div>
                    <div className="mt-1 flex gap-0.5">{t.accents.map((c) => <span key={c} className="h-1.5 w-3 rounded-sm" style={{ background: c }} />)}</div>
                  </div>
                </button>
              ))}
            </div>
          </RibbonGroup>
          <RibbonGroup label="Background">
            <RibbonRows>
              <ColorButton icon={Palette} label="Slide background" color={slide?.background ?? theme.backgroundSolid} onPick={(c) => store.setBackground(c)} />
              <RibbonButton icon={SquareDashed} label="Reset background" showLabel disabled={!slide?.background} onClick={() => store.setBackground(null)} />
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Master">
            <RibbonButton large icon={LayoutPanelTop} label="Slide master" onClick={() => { store.editMaster('master'); p.setTab('master') }} />
            <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => p.openDialog('footer')} />
          </RibbonGroup>
        </>
      )}

      {active === 'transitions' && (
        <>
          <RibbonGroup label="Transition to this slide">
            <div className="flex items-center gap-1 px-1">
              {TRANSITIONS.map((t) => (
                <button
                  key={t.id}
                  aria-label={`${t.label} transition`}
                  aria-pressed={(transition?.type ?? 'none') === t.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => store.setTransition(t.id === 'none' ? null : { type: t.id as TransitionType, duration: transition?.duration ?? 700 })}
                  className={`flex h-[58px] w-[58px] flex-col items-center justify-center gap-1 rounded border text-[11px] text-ink hover:bg-hover ${(transition?.type ?? 'none') === t.id ? 'border-[var(--accent)] bg-active' : 'border-line'}`}
                >
                  <Clapperboard size={18} strokeWidth={1.6} className="text-[var(--accent)]" />
                  {t.label}
                </button>
              ))}
            </div>
          </RibbonGroup>
          <RibbonGroup label="Timing">
            <RibbonRows>
              <label className="flex items-center gap-1 text-[12px] text-ink">Duration
                <input aria-label="Transition duration in seconds" type="number" min={0.1} max={10} step={0.1} disabled={!transition} value={(transition?.duration ?? 700) / 1000}
                  onChange={(e) => transition && store.setTransition({ ...transition, duration: Math.round(Number(e.target.value) * 1000) })}
                  className="h-7 w-16 rounded border border-line bg-surface px-1 disabled:opacity-40" /> s
              </label>
              <label className="flex items-center gap-1 text-[12px] text-ink">
                <input type="checkbox" aria-label="Advance after" checked={!!slide?.advanceAfter} onChange={(e) => store.setAdvanceAfter(e.target.checked ? 5 : null)} /> After
                <input aria-label="Advance after seconds" type="number" min={1} max={600} disabled={!slide?.advanceAfter} value={slide?.advanceAfter ?? 5} onChange={(e) => store.setAdvanceAfter(Number(e.target.value))} className="h-7 w-14 rounded border border-line bg-surface px-1 disabled:opacity-40" /> s
              </label>
            </RibbonRows>
            <RibbonButton large icon={Copy} label="Apply to all" onClick={() => { store.setTransition(transition ?? null, true); store.setAdvanceAfter(slide?.advanceAfter ?? null, true) }} />
          </RibbonGroup>
          <RibbonGroup label="Preview">
            <RibbonButton large icon={Play} label="Preview" onClick={() => p.present('show', true)} />
          </RibbonGroup>
        </>
      )}

      {active === 'animations' && (
        <>
          {(['entrance', 'emphasis', 'exit'] as const).map((kind) => (
            <RibbonGroup key={kind} label={kind === 'entrance' ? 'Entrance' : kind === 'emphasis' ? 'Emphasis' : 'Exit'}>
              <div className="grid grid-flow-col grid-rows-2 gap-0.5">
                {EFFECTS.filter((e) => e.kind === kind).map((e) => (
                  <button key={e.id} aria-label={`${e.label} animation`} disabled={none} onMouseDown={(ev) => ev.preventDefault()} onClick={() => store.addAnimation(e.id)}
                    className="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-ink hover:bg-hover disabled:opacity-40">
                    <Sparkles size={13} style={{ color: kind === 'entrance' ? '#15803d' : kind === 'emphasis' ? '#b45309' : '#be123c' }} /> {e.label}
                  </button>
                ))}
              </div>
            </RibbonGroup>
          ))}
          <RibbonGroup label="Timing">
            <RibbonRows>
              <RibbonSelect title="Start" width={130} value={firstAnim?.start ?? 'click'} options={[{ value: 'click', label: 'On click' }, { value: 'with', label: 'With previous' }, { value: 'after', label: 'After previous' }]}
                onChange={(v) => firstAnim && store.updateAnimation(firstAnim.id, { start: v as 'click' | 'with' | 'after' })} />
              <label className="flex items-center gap-1 text-[12px] text-ink">Duration
                <input aria-label="Animation duration" type="number" min={0} max={20} step={0.25} disabled={!firstAnim} value={(firstAnim?.duration ?? 500) / 1000}
                  onChange={(e) => firstAnim && store.updateAnimation(firstAnim.id, { duration: Math.round(Number(e.target.value) * 1000) })} className="h-7 w-14 rounded border border-line bg-surface px-1 disabled:opacity-40" /> s
              </label>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Advanced">
            <RibbonButton large icon={PanelRight} label="Animation pane" active={p.pane === 'animation'} onClick={() => p.setPane(p.pane === 'animation' ? null : 'animation')} />
            <RibbonButton large icon={Play} label="Preview" disabled={!slide?.animations?.length} onClick={() => p.present('show', true)} />
          </RibbonGroup>
        </>
      )}

      {active === 'show' && (
        <>
          <RibbonGroup label="Start slide show">
            <RibbonButton large icon={Play} label="From beginning" onClick={() => p.present('show', false)} shortcut="F5" />
            <RibbonButton large icon={PlayCircle} label="From current slide" onClick={() => p.present('show', true)} shortcut="Shift+F5" />
            <RibbonButton large icon={Presentation} label="Presenter view" onClick={() => p.present('presenter', true)} shortcut="Alt+F5" />
          </RibbonGroup>
          <RibbonGroup label="Set up">
            <RibbonButton large icon={Settings2} label="Set up show" onClick={() => p.openDialog('setup')} />
            <RibbonButton large icon={EyeOff} label="Hide slide" active={!!slide?.hidden} onClick={() => store.setHidden([store.current], !slide?.hidden)} />
            <RibbonButton large icon={Timer} label="Rehearse timings" onClick={() => p.present('rehearse', false)} />
          </RibbonGroup>
          <RibbonGroup label="Options">
            <label className="flex items-center gap-1.5 px-1 text-[12px] text-ink"><input type="checkbox" checked={!!store.pres.show?.useTimings} onChange={(e) => store.setShow({ useTimings: e.target.checked })} /> Use timings</label>
            <label className="flex items-center gap-1.5 px-1 text-[12px] text-ink"><input type="checkbox" checked={!!store.pres.show?.loop} onChange={(e) => store.setShow({ loop: e.target.checked })} /> Loop until Esc</label>
          </RibbonGroup>
        </>
      )}

      {active === 'view' && (
        <>
          <RibbonGroup label="Presentation views">
            <RibbonButton large icon={RectangleHorizontal} label="Normal" active={p.view === 'normal'} onClick={() => p.setView('normal')} />
            <RibbonButton large icon={Grid3x3} label="Slide sorter" active={p.view === 'sorter'} onClick={() => p.setView('sorter')} />
          </RibbonGroup>
          <RibbonGroup label="Master views">
            <RibbonButton large icon={LayoutPanelTop} label="Slide master" onClick={() => { p.setView('normal'); store.editMaster('master'); p.setTab('master') }} />
          </RibbonGroup>
          <RibbonGroup label="Show">
            <RibbonButton large icon={StickyNote} label="Notes" active={p.showNotes} onClick={() => p.setShowNotes(!p.showNotes)} />
            <RibbonButton large icon={Layers} label="Selection pane" active={p.pane === 'selection'} onClick={() => p.setPane(p.pane === 'selection' ? null : 'selection')} />
            <RibbonButton large icon={PanelRight} label="Animation pane" active={p.pane === 'animation'} onClick={() => p.setPane(p.pane === 'animation' ? null : 'animation')} />
          </RibbonGroup>
          <RibbonGroup label="Export">
            <RibbonButton large icon={ImageDown} label="Export pictures" onClick={p.exportPictures} />
            <RibbonButton large icon={FileText} label="Notes pages PDF" onClick={p.exportNotes} />
          </RibbonGroup>
          <RibbonGroup label="Theme">
            <RibbonButton large icon={Sun} label="Light" active={p.theme === 'light'} onClick={() => p.setTheme('light')} />
            <RibbonButton large icon={Moon} label="Dark" active={p.theme === 'dark'} onClick={() => p.setTheme('dark')} />
            <RibbonButton large icon={Monitor} label="System" active={p.theme === 'system'} onClick={() => p.setTheme('system')} />
          </RibbonGroup>
        </>
      )}

      {active === 'format' && (
        <>
          {image && (
            <RibbonGroup label="Size">
              <RibbonDropdown icon={Crop} label="Crop" width={260}>
                {() => <CropControls store={store} el={image} />}
              </RibbonDropdown>
            </RibbonGroup>
          )}
          <RibbonGroup label="Style">
            {(shapes.length > 0 || image?.icon) && <ColorButton icon={PaintBucket} label="Fill" color={(shapes[0] as { fill?: string })?.fill ?? image?.icon?.color ?? theme.accents[0]} onPick={(c) => store.setFill(c)} />}
            {shapes.length > 0 && <ColorButton icon={PenLine} label="Outline" color={(shapes[0] as { stroke?: string })?.stroke ?? '#1f2937'} onPick={(c) => store.setOutline(c)} />}
            <RibbonDropdown icon={Blend} label="Transparency" width={240}>
              {() => <TransparencyControl store={store} />}
            </RibbonDropdown>
          </RibbonGroup>
          <RibbonGroup label="Rotate">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={RotateCcw} label="Rotate left 90°" onClick={() => store.rotate(-90)} />
                <RibbonButton icon={RotateCw} label="Rotate right 90°" onClick={() => store.rotate(90)} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={FlipHorizontal2} label="Flip horizontal" onClick={() => store.flip('h')} />
                <RibbonButton icon={FlipVertical2} label="Flip vertical" onClick={() => store.flip('v')} />
              </RibbonRow>
            </RibbonRows>
            <label className="flex flex-col items-center text-[11px] text-ink">Angle
              <input aria-label="Rotation angle" type="number" min={0} max={359} value={single?.rotation ?? 0} disabled={!single} onChange={(e) => single && store.setRotation([single.id], Number(e.target.value))} className="h-7 w-16 rounded border border-line bg-surface px-1" />
            </label>
          </RibbonGroup>
          {arrange}
          <RibbonGroup label="Protect">
            <RibbonButton large icon={Lock} label={sel.every((e) => e.locked) ? 'Unlock' : 'Lock'} active={sel.every((e) => e.locked)} onClick={() => store.toggleLock()} />
          </RibbonGroup>
        </>
      )}

      {active === 'table' && table && (
        <>
          <RibbonGroup label="Table style options">
            <RibbonRows>
              <label className="flex items-center gap-1.5 text-[12px] text-ink"><input type="checkbox" checked={table.header} onChange={(e) => store.setTable(table.id, { header: e.target.checked })} /> Header row</label>
              <label className="flex items-center gap-1.5 text-[12px] text-ink"><input type="checkbox" checked={table.banded} onChange={(e) => store.setTable(table.id, { banded: e.target.checked })} /> Banded rows</label>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Colour">
            <div className="flex gap-1">
              {theme.accents.map((c, i) => (
                <button key={c} aria-label={`Table colour ${i + 1}`} aria-pressed={table.accent === i} onClick={() => store.setTable(table.id, { accent: i })} className="h-8 w-8 rounded" style={{ background: c, outline: table.accent === i ? `2px solid ${accent}` : undefined, outlineOffset: 2 }} />
              ))}
            </div>
          </RibbonGroup>
          <RibbonGroup label="Rows & columns">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={BetweenHorizontalStart} label="Insert row above" showLabel onClick={() => store.insertRow(table.id, store.tableCell?.[0] ?? 0)} />
                <RibbonButton icon={BetweenHorizontalEnd} label="Insert row below" showLabel onClick={() => store.insertRow(table.id, (store.tableCell?.[0] ?? table.rows.length - 1) + 1)} />
                <RibbonButton icon={Rows3} label="Delete row" showLabel disabled={table.rows.length <= 1} onClick={() => store.deleteRow(table.id, store.tableCell?.[0] ?? table.rows.length - 1)} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={BetweenVerticalStart} label="Insert column left" showLabel onClick={() => store.insertColumn(table.id, store.tableCell?.[1] ?? 0)} />
                <RibbonButton icon={BetweenVerticalEnd} label="Insert column right" showLabel onClick={() => store.insertColumn(table.id, (store.tableCell?.[1] ?? (table.rows[0]?.length ?? 1) - 1) + 1)} />
                <RibbonButton icon={Columns3} label="Delete column" showLabel disabled={(table.rows[0]?.length ?? 0) <= 1} onClick={() => store.deleteColumn(table.id, store.tableCell?.[1] ?? (table.rows[0]?.length ?? 1) - 1)} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Edit">
            <RibbonButton large icon={Heading} label="Edit text" onClick={() => store.startEditing(table.id)} />
          </RibbonGroup>
          {arrange}
        </>
      )}

      {active === 'chart' && chart && (
        <>
          <RibbonGroup label="Data">
            <RibbonButton large icon={Table2} label="Edit data" onClick={() => p.openDialog('chart')} />
          </RibbonGroup>
          <RibbonGroup label="Type">
            {CHARTS.map((c) => (
              <RibbonButton key={c.id} large icon={c.icon} label={c.label} active={chart.chartType === c.id} onClick={() => store.setChart(chart.id, { chartType: c.id })} />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Elements">
            <label className="flex items-center gap-1.5 px-1 text-[12px] text-ink"><input type="checkbox" checked={chart.legend} onChange={(e) => store.setChart(chart.id, { legend: e.target.checked })} /> Legend</label>
          </RibbonGroup>
          {arrange}
        </>
      )}

      {active === 'media' && media && (
        <>
          <RibbonGroup label="Preview">
            <RibbonButton large icon={Play} label="Play" onClick={() => p.openDialog('media')} />
          </RibbonGroup>
          <RibbonGroup label="Playback">
            <RibbonRows>
              <label className="flex items-center gap-1.5 text-[12px] text-ink"><input type="checkbox" checked={!!media.autoplay} onChange={(e) => store.setMedia(media.id, { autoplay: e.target.checked || undefined })} /> Start automatically</label>
              <label className="flex items-center gap-1.5 text-[12px] text-ink"><input type="checkbox" checked={!!media.loop} onChange={(e) => store.setMedia(media.id, { loop: e.target.checked || undefined })} /> Loop until stopped</label>
            </RibbonRows>
          </RibbonGroup>
          {arrange}
        </>
      )}
    </Ribbon>
  )
}
