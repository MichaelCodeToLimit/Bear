import { useMemo } from 'react'
import {
  AArrowDown, AArrowUp, AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, ArrowRight, BringToFront, Baseline, Bold, Circle, ClipboardPaste, Copy, CopyPlus,
  Grid3x3, ImagePlus, Italic, LayoutTemplate, List, Minus, Monitor, Moon, PaintBucket, Palette, Play, PlayCircle,
  RectangleHorizontal, Scissors, SendToBack, Shapes, Square, SquareDashed, StickyNote, Sun, Trash2, Triangle, Type,
  Underline, AlignStartVertical, AlignEndVertical, AlignCenterVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignCenterHorizontal, ArrowUpToLine, ArrowDownToLine, PenLine
} from 'lucide-react'
import {
  ColorButton, Ribbon, RibbonButton, RibbonDropdown, RibbonGroup, RibbonRow, RibbonRows, RibbonSelect, type ThemeMode
} from '@bear/ui'
import { hasText, type ShapeKind, type TextStyle } from './model'
import { LAYOUTS, newSlide, type LayoutId } from './layouts'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import { THEMES, getTheme } from './themes'

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88]
const FONTS = ['heading', 'body', 'Segoe UI', 'Calibri', 'Arial', 'Georgia', 'Cambria', 'Times New Roman', 'Verdana', 'Consolas']

export const SHAPES: { id: ShapeKind; label: string; icon: typeof Square }[] = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'roundRect', label: 'Rounded rectangle', icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Oval', icon: Circle },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'line', label: 'Line', icon: Minus }
]

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
  present: (fromCurrent: boolean) => void
  insertPicture: () => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

function LayoutGallery({ store, onPick }: { store: SlidesStore; onPick: (l: LayoutId) => void }) {
  const theme = getTheme(store.pres.theme)
  const samples = useMemo(() => LAYOUTS.map((l) => ({ ...l, slide: newSlide(l.id) })), [])
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

export function SlidesRibbon(p: SlidesRibbonProps) {
  const { store, accent } = p
  const theme = getTheme(store.pres.theme)
  const sel = store.selection
  const textEls = sel.filter(hasText)
  const style: TextStyle = textEls[0]?.style ?? {}
  const shapes = sel.filter((e) => e.kind === 'shape')
  const none = !sel.length
  const setStyle = (patch: Partial<TextStyle>) => store.setTextStyle(patch)
  const addShape = (s: ShapeKind) => store.addShape(s, theme.accents[0])
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'design', label: 'Design' },
    { id: 'show', label: 'Slide Show' },
    { id: 'view', label: 'View' }
  ]
  const curSize = style.fontSize ?? 18
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? SIZES.find((s) => s > curSize) ?? curSize : [...SIZES].reverse().find((s) => s < curSize) ?? curSize
    setStyle({ fontSize: next })
  }
  const pickFont = (f: string) => setStyle({ font: f })
  const fontValue = style.font ?? (textEls[0]?.kind === 'text' && textEls[0].placeholder === 'title' ? 'heading' : 'body')

  const newSlideButton = (
    <RibbonDropdown icon={LayoutTemplate} label="New slide" width={400}>
      {(close) => <LayoutGallery store={store} onPick={(l) => { close(); store.addSlide(l) }} />}
    </RibbonDropdown>
  )

  return (
    <Ribbon tabs={tabs} active={p.tab} onChange={p.setTab} onFile={p.onFile} accent={accent}>
      {p.tab === 'home' && (
        <>
          <RibbonGroup label="Slides">
            {newSlideButton}
            <RibbonRows>
              <RibbonButton icon={CopyPlus} label="Duplicate" showLabel onClick={() => store.duplicateSlide()} />
              <RibbonButton icon={Trash2} label="Delete slide" showLabel disabled={store.pres.slides.length <= 1} onClick={() => store.deleteSlide()} />
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Clipboard">
            <RibbonButton large icon={ClipboardPaste} label="Paste" disabled={!store.canPaste} onClick={() => store.paste()} shortcut="Ctrl+V" />
            <RibbonRows>
              <RibbonButton icon={Scissors} label="Cut" showLabel disabled={none} onClick={() => store.cut()} shortcut="Ctrl+X" />
              <RibbonButton icon={Copy} label="Copy" showLabel disabled={none} onClick={() => store.copy()} shortcut="Ctrl+C" />
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Font">
            <RibbonRows>
              <RibbonRow>
                <RibbonSelect title="Font" width={128} value={fontValue}
                  options={FONTS.map((f) => ({ value: f, label: f === 'heading' ? `${theme.headingFont} (Headings)` : f === 'body' ? `${theme.bodyFont} (Body)` : f }))}
                  onChange={pickFont} />
                <RibbonSelect title="Font size" width={54} value={String(curSize)} options={SIZES.map((s) => ({ value: String(s), label: String(s) }))} onChange={(v) => setStyle({ fontSize: Number(v) })} />
                <RibbonButton icon={AArrowUp} label="Grow font" disabled={!textEls.length} onClick={() => step(1)} shortcut="Ctrl+]" />
                <RibbonButton icon={AArrowDown} label="Shrink font" disabled={!textEls.length} onClick={() => step(-1)} shortcut="Ctrl+[" />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={Bold} label="Bold" active={!!style.bold} disabled={!textEls.length} onClick={() => setStyle({ bold: !style.bold })} shortcut="Ctrl+B" />
                <RibbonButton icon={Italic} label="Italic" active={!!style.italic} disabled={!textEls.length} onClick={() => setStyle({ italic: !style.italic })} shortcut="Ctrl+I" />
                <RibbonButton icon={Underline} label="Underline" active={!!style.underline} disabled={!textEls.length} onClick={() => setStyle({ underline: !style.underline })} shortcut="Ctrl+U" />
                <ColorButton icon={Baseline} label="Font color" color={style.color ?? theme.accents[0]} onPick={(c) => setStyle({ color: c ?? undefined })} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Paragraph">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={AlignLeft} label="Align left" active={(style.align ?? 'left') === 'left' && !!textEls.length} disabled={!textEls.length} onClick={() => setStyle({ align: 'left' })} />
                <RibbonButton icon={AlignCenter} label="Center" active={style.align === 'center'} disabled={!textEls.length} onClick={() => setStyle({ align: 'center' })} />
                <RibbonButton icon={AlignRight} label="Align right" active={style.align === 'right'} disabled={!textEls.length} onClick={() => setStyle({ align: 'right' })} />
                <RibbonButton icon={List} label="Bullets" active={!!style.bullets} disabled={!textEls.length} onClick={() => setStyle({ bullets: !style.bullets })} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={AlignVerticalJustifyStart} label="Text top" active={style.valign === 'top'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'top' })} />
                <RibbonButton icon={AlignVerticalJustifyCenter} label="Text middle" active={style.valign === 'middle'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'middle' })} />
                <RibbonButton icon={AlignVerticalJustifyEnd} label="Text bottom" active={style.valign === 'bottom'} disabled={!textEls.length} onClick={() => setStyle({ valign: 'bottom' })} />
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
          <RibbonGroup label="Arrange">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={BringToFront} label="Bring to front" disabled={none} onClick={() => store.reorder('front')} />
                <RibbonButton icon={ArrowUpToLine} label="Bring forward" disabled={none} onClick={() => store.reorder(1)} />
                <RibbonButton icon={ArrowDownToLine} label="Send backward" disabled={none} onClick={() => store.reorder(-1)} />
                <RibbonButton icon={SendToBack} label="Send to back" disabled={none} onClick={() => store.reorder('back')} />
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
        </>
      )}

      {p.tab === 'insert' && (
        <>
          <RibbonGroup label="Slides">{newSlideButton}</RibbonGroup>
          <RibbonGroup label="Text">
            <RibbonButton large icon={Type} label="Text box" onClick={() => store.addTextBox()} />
          </RibbonGroup>
          <RibbonGroup label="Images">
            <RibbonButton large icon={ImagePlus} label="Picture" onClick={p.insertPicture} />
          </RibbonGroup>
          <RibbonGroup label="Shapes">
            {SHAPES.map((s) => (
              <RibbonButton key={s.id} large icon={s.icon} label={s.label.replace(' rectangle', '')} onClick={() => addShape(s.id)} />
            ))}
          </RibbonGroup>
        </>
      )}

      {p.tab === 'design' && (
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
              <ColorButton icon={Palette} label="Slide background" color={store.slide.background ?? theme.backgroundSolid} onPick={(c) => store.setBackground(c)} />
              <RibbonButton icon={SquareDashed} label="Reset background" showLabel disabled={!store.slide.background} onClick={() => store.setBackground(null)} />
            </RibbonRows>
          </RibbonGroup>
        </>
      )}

      {p.tab === 'show' && (
        <RibbonGroup label="Start slide show">
          <RibbonButton large icon={Play} label="From beginning" onClick={() => p.present(false)} shortcut="F5" />
          <RibbonButton large icon={PlayCircle} label="From current slide" onClick={() => p.present(true)} shortcut="Shift+F5" />
        </RibbonGroup>
      )}

      {p.tab === 'view' && (
        <>
          <RibbonGroup label="Presentation views">
            <RibbonButton large icon={RectangleHorizontal} label="Normal" active={p.view === 'normal'} onClick={() => p.setView('normal')} />
            <RibbonButton large icon={Grid3x3} label="Slide sorter" active={p.view === 'sorter'} onClick={() => p.setView('sorter')} />
          </RibbonGroup>
          <RibbonGroup label="Show">
            <RibbonButton large icon={StickyNote} label="Notes" active={p.showNotes} onClick={() => p.setShowNotes(!p.showNotes)} />
          </RibbonGroup>
          <RibbonGroup label="Theme">
            <RibbonButton large icon={Sun} label="Light" active={p.theme === 'light'} onClick={() => p.setTheme('light')} />
            <RibbonButton large icon={Moon} label="Dark" active={p.theme === 'dark'} onClick={() => p.setTheme('dark')} />
            <RibbonButton large icon={Monitor} label="System" active={p.theme === 'system'} onClick={() => p.setTheme('system')} />
          </RibbonGroup>
        </>
      )}
    </Ribbon>
  )
}
