import type { Editor } from '@tiptap/core'
import {
  AArrowDown, AArrowUp, AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, CalendarClock,
  ClipboardPaste, Code, Columns2, Copy, Eraser, FileText, Highlighter, ImagePlus, IndentDecrease,
  IndentIncrease, Italic, Link2, List, ListOrdered, Maximize, Minus, Moon, Quote, Replace,
  Scissors, Search, SeparatorHorizontal, Strikethrough, Subscript, Superscript, Table2, TableCellsMerge,
  TableCellsSplit, Trash2, Underline, ZoomIn, ZoomOut, RectangleHorizontal, RectangleVertical,
  PanelTop, PanelLeft, Sun, Monitor, BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart,
  BetweenVerticalEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  PaintBucket, Columns3, TableProperties
} from 'lucide-react'
import {
  ColorButton, Ribbon, RibbonButton, RibbonDropdown, RibbonGroup, RibbonRow, RibbonRows, RibbonSelect,
  type ThemeMode
} from '@bear/ui'
import type { Margins, PageLayout, PageSize } from './layout'
import { distributeColumns, insertTable, tableInfo } from './tables'
import { TableGridPicker, TableStyleGallery } from './TablePicker'

export const FONTS = ['Calibri', 'Arial', 'Cambria', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana', 'Consolas', 'Courier New']
export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72]
const DEFAULT_SIZE = 11

const STYLES = [
  { value: 'p', label: 'Normal' },
  { value: 'h1', label: 'Heading 1', style: { fontSize: 18, fontWeight: 600 } },
  { value: 'h2', label: 'Heading 2', style: { fontSize: 15, fontWeight: 600 } },
  { value: 'h3', label: 'Heading 3', style: { fontWeight: 600 } },
  { value: 'h4', label: 'Heading 4' },
  { value: 'quote', label: 'Quote', style: { fontStyle: 'italic' } },
  { value: 'code', label: 'Code', style: { fontFamily: 'Consolas, monospace' } }
]

export interface RibbonActions {
  insertImage: () => void
  openTableDialog: () => void
  insertLink: () => void
  openFind: (replace: boolean) => void
  layout: PageLayout
  setLayout: (l: PageLayout) => void
  zoom: number
  setZoom: (z: number) => void
  focusMode: boolean
  setFocusMode: (f: boolean) => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

function currentStyle(editor: Editor): string {
  for (let l = 1; l <= 4; l++) if (editor.isActive('heading', { level: l })) return `h${l}`
  if (editor.isActive('codeBlock')) return 'code'
  if (editor.isActive('blockquote')) return 'quote'
  return 'p'
}

function applyStyle(editor: Editor, value: string) {
  const c = editor.chain().focus()
  if (editor.isActive('blockquote') && value !== 'quote') c.lift('blockquote')
  if (value === 'p') c.setParagraph()
  else if (value === 'code') c.setCodeBlock()
  else if (value === 'quote') c.setParagraph().setBlockquote()
  else c.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 })
  c.run()
}

export function currentSize(editor: Editor): number {
  const s = editor.getAttributes('textStyle').fontSize as string | undefined
  return s ? parseFloat(s) : DEFAULT_SIZE
}

export function stepFontSize(editor: Editor, dir: 1 | -1) {
  const cur = currentSize(editor)
  const next = dir > 0 ? SIZES.find((s) => s > cur) ?? cur : [...SIZES].reverse().find((s) => s < cur) ?? cur
  editor.chain().focus().setFontSize(`${next}pt`).run()
}

function insertDate(editor: Editor) {
  const text = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
  editor.chain().focus().insertContent(text).run()
}

async function paste(editor: Editor) {
  try {
    const text = await navigator.clipboard.readText()
    if (text) editor.chain().focus().insertContent(text).run()
  } catch {
    /* clipboard unavailable; Ctrl+V still works */
  }
}

interface WriteRibbonProps {
  editor: Editor
  tab: string
  setTab: (t: string) => void
  onFile: () => void
  accent: string
  actions: RibbonActions
}

export function WriteRibbon({ editor, tab, setTab, onFile, accent, actions }: WriteRibbonProps) {
  const inTable = editor.isActive('table')
  const table = inTable ? tableInfo(editor) : null
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'layout', label: 'Layout' },
    { id: 'view', label: 'View' },
    ...(inTable ? [{ id: 'table', label: 'Table' }] : [])
  ]
  const active = tab === 'table' && !inTable ? 'home' : tab
  const ch = () => editor.chain().focus()
  const font = (editor.getAttributes('textStyle').fontFamily as string | undefined)?.split(',')[0].replace(/["']/g, '') ?? 'Calibri'
  const { layout, setLayout } = actions

  return (
    <Ribbon tabs={tabs} active={active} onChange={setTab} onFile={onFile} accent={accent}>
      {active === 'home' && (
        <>
          <RibbonGroup label="Clipboard">
            <RibbonButton large icon={ClipboardPaste} label="Paste" onClick={() => paste(editor)} shortcut="Ctrl+V" />
            <RibbonRows>
              <RibbonButton icon={Scissors} label="Cut" showLabel onClick={() => document.execCommand('cut')} shortcut="Ctrl+X" />
              <RibbonButton icon={Copy} label="Copy" showLabel onClick={() => document.execCommand('copy')} shortcut="Ctrl+C" />
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Font">
            <RibbonRows>
              <RibbonRow>
                <RibbonSelect
                  title="Font"
                  width={136}
                  value={font}
                  options={FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
                  onChange={(f) => ch().setFontFamily(f).run()}
                />
                <RibbonSelect
                  title="Font size"
                  width={56}
                  value={String(currentSize(editor))}
                  options={SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                  onChange={(s) => ch().setFontSize(`${s}pt`).run()}
                />
                <RibbonButton icon={AArrowUp} label="Grow font" onClick={() => stepFontSize(editor, 1)} shortcut="Ctrl+]" />
                <RibbonButton icon={AArrowDown} label="Shrink font" onClick={() => stepFontSize(editor, -1)} shortcut="Ctrl+[" />
                <RibbonButton icon={Eraser} label="Clear formatting" onClick={() => ch().unsetAllMarks().run()} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => ch().toggleBold().run()} shortcut="Ctrl+B" />
                <RibbonButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => ch().toggleItalic().run()} shortcut="Ctrl+I" />
                <RibbonButton icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => ch().toggleUnderline().run()} shortcut="Ctrl+U" />
                <RibbonButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => ch().toggleStrike().run()} />
                <RibbonButton icon={Subscript} label="Subscript" active={editor.isActive('subscript')} onClick={() => ch().toggleSubscript().run()} shortcut="Ctrl+," />
                <RibbonButton icon={Superscript} label="Superscript" active={editor.isActive('superscript')} onClick={() => ch().toggleSuperscript().run()} shortcut="Ctrl+." />
                <ColorButton
                  icon={Highlighter}
                  label="Highlight"
                  color={(editor.getAttributes('highlight').color as string) ?? '#fef08a'}
                  onPick={(c) => (c ? ch().setHighlight({ color: c }).run() : ch().unsetHighlight().run())}
                />
                <ColorButton
                  icon={Baseline}
                  label="Font color"
                  color={(editor.getAttributes('textStyle').color as string) ?? '#b91c1c'}
                  onPick={(c) => (c ? ch().setColor(c).run() : ch().unsetColor().run())}
                />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Paragraph">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={List} label="Bullets" active={editor.isActive('bulletList')} onClick={() => ch().toggleBulletList().run()} />
                <RibbonButton icon={ListOrdered} label="Numbering" active={editor.isActive('orderedList')} onClick={() => ch().toggleOrderedList().run()} />
                <RibbonButton icon={IndentDecrease} label="Decrease indent" disabled={!editor.can().liftListItem('listItem')} onClick={() => ch().liftListItem('listItem').run()} shortcut="Shift+Tab" />
                <RibbonButton icon={IndentIncrease} label="Increase indent" disabled={!editor.can().sinkListItem('listItem')} onClick={() => ch().sinkListItem('listItem').run()} shortcut="Tab" />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={AlignLeft} label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => ch().setTextAlign('left').run()} shortcut="Ctrl+Shift+L" />
                <RibbonButton icon={AlignCenter} label="Center" active={editor.isActive({ textAlign: 'center' })} onClick={() => ch().setTextAlign('center').run()} shortcut="Ctrl+Shift+E" />
                <RibbonButton icon={AlignRight} label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => ch().setTextAlign('right').run()} shortcut="Ctrl+Shift+R" />
                <RibbonButton icon={AlignJustify} label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => ch().setTextAlign('justify').run()} shortcut="Ctrl+Shift+J" />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Styles">
            <div className="flex flex-col gap-1">
              <RibbonSelect title="Style" width={130} value={currentStyle(editor)} options={STYLES} onChange={(v) => applyStyle(editor, v)} />
              <div className="flex gap-0.5">
                <RibbonButton icon={Quote} label="Quote" active={editor.isActive('blockquote')} onClick={() => ch().toggleBlockquote().run()} />
                <RibbonButton icon={Code} label="Inline code" active={editor.isActive('code')} onClick={() => ch().toggleCode().run()} />
              </div>
            </div>
          </RibbonGroup>

          <RibbonGroup label="Editing">
            <RibbonRows>
              <RibbonButton icon={Search} label="Find" showLabel onClick={() => actions.openFind(false)} shortcut="Ctrl+F" />
              <RibbonButton icon={Replace} label="Replace" showLabel onClick={() => actions.openFind(true)} shortcut="Ctrl+H" />
            </RibbonRows>
          </RibbonGroup>
        </>
      )}

      {active === 'insert' && (
        <>
          <RibbonGroup label="Pages">
            <RibbonButton large icon={SeparatorHorizontal} label="Page break" onClick={() => ch().setPageBreak().run()} shortcut="Ctrl+Enter" />
          </RibbonGroup>
          <RibbonGroup label="Tables">
            <RibbonDropdown icon={Table2} label="Table" width={228}>
              {(close) => (
                <TableGridPicker
                  onPick={(rows, cols) => {
                    close()
                    insertTable(editor, rows, cols, { header: false })
                  }}
                  onMore={() => {
                    close()
                    actions.openTableDialog()
                  }}
                />
              )}
            </RibbonDropdown>
          </RibbonGroup>
          <RibbonGroup label="Illustrations">
            <RibbonButton large icon={ImagePlus} label="Picture" onClick={actions.insertImage} />
          </RibbonGroup>
          <RibbonGroup label="Links">
            <RibbonButton large icon={Link2} label="Link" onClick={actions.insertLink} shortcut="Ctrl+K" />
          </RibbonGroup>
          <RibbonGroup label="Text">
            <RibbonButton large icon={Minus} label="Line" onClick={() => ch().setHorizontalRule().run()} />
            <RibbonButton large icon={CalendarClock} label="Date & time" onClick={() => insertDate(editor)} />
          </RibbonGroup>
        </>
      )}

      {active === 'layout' && (
        <>
          <RibbonGroup label="Page setup">
            <div className="flex flex-col gap-1 text-[12px] text-ink">
              <label className="flex items-center justify-between gap-2">
                Size
                <RibbonSelect title="Page size" width={92} value={layout.size}
                  options={[{ value: 'Letter', label: 'Letter' }, { value: 'A4', label: 'A4' }]}
                  onChange={(v) => setLayout({ ...layout, size: v as PageSize })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                Margins
                <RibbonSelect title="Margins" width={92} value={layout.margins}
                  options={[{ value: 'normal', label: 'Normal' }, { value: 'narrow', label: 'Narrow' }, { value: 'wide', label: 'Wide' }]}
                  onChange={(v) => setLayout({ ...layout, margins: v as Margins })} />
              </label>
            </div>
          </RibbonGroup>
          <RibbonGroup label="Orientation">
            <RibbonButton large icon={RectangleVertical} label="Portrait" active={!layout.landscape} onClick={() => setLayout({ ...layout, landscape: false })} />
            <RibbonButton large icon={RectangleHorizontal} label="Landscape" active={layout.landscape} onClick={() => setLayout({ ...layout, landscape: true })} />
          </RibbonGroup>
        </>
      )}

      {active === 'view' && (
        <>
          <RibbonGroup label="Zoom">
            <RibbonButton large icon={ZoomOut} label="Zoom out" onClick={() => actions.setZoom(Math.max(0.5, actions.zoom - 0.1))} />
            <RibbonButton large icon={FileText} label="100%" onClick={() => actions.setZoom(1)} />
            <RibbonButton large icon={ZoomIn} label="Zoom in" onClick={() => actions.setZoom(Math.min(2, actions.zoom + 0.1))} />
          </RibbonGroup>
          <RibbonGroup label="Immersive">
            <RibbonButton large icon={Maximize} label="Focus" active={actions.focusMode} onClick={() => actions.setFocusMode(!actions.focusMode)} />
          </RibbonGroup>
          <RibbonGroup label="Theme">
            <RibbonButton large icon={Sun} label="Light" active={actions.theme === 'light'} onClick={() => actions.setTheme('light')} />
            <RibbonButton large icon={Moon} label="Dark" active={actions.theme === 'dark'} onClick={() => actions.setTheme('dark')} />
            <RibbonButton large icon={Monitor} label="System" active={actions.theme === 'system'} onClick={() => actions.setTheme('system')} />
          </RibbonGroup>
        </>
      )}

      {active === 'table' && (
        <>
          <RibbonGroup label="Table styles">
            <RibbonDropdown icon={TableProperties} label="Styles" width={260}>
              {(close) => (
                <TableStyleGallery
                  current={table?.style}
                  onPick={(s) => {
                    close()
                    ch().updateAttributes('table', { tableStyle: s }).run()
                  }}
                />
              )}
            </RibbonDropdown>
            <RibbonRows>
              <RibbonButton icon={PanelTop} label="Header row" showLabel active={table?.headerRow} onClick={() => ch().toggleHeaderRow().run()} />
              <RibbonButton icon={PanelLeft} label="Header column" showLabel active={table?.headerCol} onClick={() => ch().toggleHeaderColumn().run()} />
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Rows & columns">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={BetweenHorizontalStart} label="Insert above" showLabel onClick={() => ch().addRowBefore().run()} />
                <RibbonButton icon={BetweenVerticalStart} label="Insert left" showLabel onClick={() => ch().addColumnBefore().run()} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={BetweenHorizontalEnd} label="Insert below" showLabel onClick={() => ch().addRowAfter().run()} />
                <RibbonButton icon={BetweenVerticalEnd} label="Insert right" showLabel onClick={() => ch().addColumnAfter().run()} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Delete">
            <RibbonRows>
              <RibbonButton icon={Trash2} label="Delete row" showLabel onClick={() => ch().deleteRow().run()} />
              <RibbonButton icon={Trash2} label="Delete column" showLabel onClick={() => ch().deleteColumn().run()} />
            </RibbonRows>
            <RibbonButton large icon={Trash2} label="Delete table" onClick={() => ch().deleteTable().run()} />
          </RibbonGroup>
          <RibbonGroup label="Cells">
            <RibbonRows>
              <RibbonRow>
                <ColorButton
                  icon={PaintBucket}
                  label="Shading"
                  color={(editor.getAttributes('tableCell').backgroundColor as string) ?? (editor.getAttributes('tableHeader').backgroundColor as string) ?? '#fef08a'}
                  onPick={(c) => ch().setCellAttribute('backgroundColor', c).run()}
                />
                <RibbonButton icon={AlignVerticalJustifyStart} label="Align top" onClick={() => ch().setCellAttribute('verticalAlign', 'top').run()} />
                <RibbonButton icon={AlignVerticalJustifyCenter} label="Align middle" onClick={() => ch().setCellAttribute('verticalAlign', 'middle').run()} />
                <RibbonButton icon={AlignVerticalJustifyEnd} label="Align bottom" onClick={() => ch().setCellAttribute('verticalAlign', 'bottom').run()} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={TableCellsMerge} label="Merge" showLabel disabled={!editor.can().mergeCells()} onClick={() => ch().mergeCells().run()} />
                <RibbonButton icon={TableCellsSplit} label="Split" showLabel disabled={!editor.can().splitCell()} onClick={() => ch().splitCell().run()} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Size">
            <RibbonButton large icon={Columns3} label="Distribute columns" onClick={() => distributeColumns(editor)} />
          </RibbonGroup>
        </>
      )}
    </Ribbon>
  )
}
