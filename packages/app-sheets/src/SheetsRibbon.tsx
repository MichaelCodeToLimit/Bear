import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowDownZA, Baseline, Bold, ChartBar, ChartColumn,
  ChartLine, ChartPie, ClipboardPaste, Columns2, Copy, DollarSign, Eraser, Eye, Grid3x3, Italic, Monitor,
  Moon, PaintBucket, Percent, Rows2, Scissors, Sigma, Snowflake, Strikethrough, Sun, TableCellsMerge,
  Trash2, Underline, WrapText, FunctionSquare, Hash
} from 'lucide-react'
import {
  ColorButton, Ribbon, RibbonButton, RibbonGroup, RibbonRow, RibbonRows, RibbonSelect, type ThemeMode
} from '@bear/ui'
import type { ChartType } from './model'
import type { SheetStore } from './store'
import { NUMBER_FORMATS, stepDecimals } from './values'

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48]

export interface SheetsRibbonProps {
  store: SheetStore
  tab: string
  setTab: (t: string) => void
  onFile: () => void
  accent: string
  copy: (cut: boolean) => void
  paste: () => void
  insertChart: (type: ChartType) => void
  autoSum: (fn: 'SUM' | 'AVERAGE' | 'COUNT' | 'MIN' | 'MAX') => void
  showGridlines: boolean
  setShowGridlines: (v: boolean) => void
  showFormulas: boolean
  setShowFormulas: (v: boolean) => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

export function SheetsRibbon(p: SheetsRibbonProps) {
  const { store, accent } = p
  const style = store.activeStyle
  const chart = store.sheet.charts.find((c) => c.id === store.selectedChart)
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'formulas', label: 'Formulas' },
    { id: 'data', label: 'Data' },
    { id: 'view', label: 'View' },
    ...(chart ? [{ id: 'chart', label: 'Chart' }] : [])
  ]
  const active = p.tab === 'chart' && !chart ? 'home' : p.tab
  const { frozen } = store.sheet
  const anchor = store.sel.anchor

  return (
    <Ribbon tabs={tabs} active={active} onChange={p.setTab} onFile={p.onFile} accent={accent}>
      {active === 'home' && (
        <>
          <RibbonGroup label="Clipboard">
            <RibbonButton large icon={ClipboardPaste} label="Paste" onClick={p.paste} shortcut="Ctrl+V" />
            <RibbonRows>
              <RibbonButton icon={Scissors} label="Cut" showLabel onClick={() => p.copy(true)} shortcut="Ctrl+X" />
              <RibbonButton icon={Copy} label="Copy" showLabel onClick={() => p.copy(false)} shortcut="Ctrl+C" />
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Font">
            <RibbonRows>
              <RibbonRow>
                <RibbonSelect title="Font size" width={56} value={String(style.fontSize ?? 11)}
                  options={SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                  onChange={(v) => store.setStyle({ fontSize: Number(v) === 11 ? undefined : Number(v) })} />
                <RibbonButton icon={Bold} label="Bold" active={!!style.bold} onClick={() => store.toggleStyle('bold')} shortcut="Ctrl+B" />
                <RibbonButton icon={Italic} label="Italic" active={!!style.italic} onClick={() => store.toggleStyle('italic')} shortcut="Ctrl+I" />
                <RibbonButton icon={Underline} label="Underline" active={!!style.underline} onClick={() => store.toggleStyle('underline')} shortcut="Ctrl+U" />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={Strikethrough} label="Strikethrough" active={!!style.strike} onClick={() => store.toggleStyle('strike')} />
                <ColorButton icon={PaintBucket} label="Fill color" color={style.fill ?? '#fef08a'} onPick={(c) => store.setStyle({ fill: c ?? undefined })} />
                <ColorButton icon={Baseline} label="Font color" color={style.color ?? '#b91c1c'} onPick={(c) => store.setStyle({ color: c ?? undefined })} />
                <RibbonButton icon={Eraser} label="Clear formatting" onClick={() => store.setStyle({ bold: undefined, italic: undefined, underline: undefined, strike: undefined, color: undefined, fill: undefined, align: undefined, wrap: undefined, fontSize: undefined, numFmt: undefined })} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Alignment">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={AlignLeft} label="Align left" active={style.align === 'left'} onClick={() => store.setStyle({ align: style.align === 'left' ? undefined : 'left' })} />
                <RibbonButton icon={AlignCenter} label="Center" active={style.align === 'center'} onClick={() => store.setStyle({ align: style.align === 'center' ? undefined : 'center' })} />
                <RibbonButton icon={AlignRight} label="Align right" active={style.align === 'right'} onClick={() => store.setStyle({ align: style.align === 'right' ? undefined : 'right' })} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={WrapText} label="Wrap text" showLabel active={!!style.wrap} onClick={() => store.toggleStyle('wrap')} />
                <RibbonButton icon={TableCellsMerge} label="Merge" showLabel onClick={() => store.toggleMerge()} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Number">
            <RibbonRows>
              <RibbonSelect title="Number format" width={128} value={style.numFmt ?? 'General'} options={NUMBER_FORMATS}
                onChange={(v) => store.setStyle({ numFmt: v === 'General' ? undefined : v })} />
              <RibbonRow>
                <RibbonButton icon={DollarSign} label="Currency" onClick={() => store.setStyle({ numFmt: '$#,##0.00' })} />
                <RibbonButton icon={Percent} label="Percent" onClick={() => store.setStyle({ numFmt: '0%' })} />
                <RibbonButton icon={Hash} label="Thousands separator" onClick={() => store.setStyle({ numFmt: '#,##0' })} />
                <button title="Increase decimals" onMouseDown={(e) => e.preventDefault()} onClick={() => store.setStyle({ numFmt: stepDecimals(style.numFmt, 1) })} className="h-7 rounded px-1 text-[11px] text-ink hover:bg-hover">.0→.00</button>
                <button title="Decrease decimals" onMouseDown={(e) => e.preventDefault()} onClick={() => store.setStyle({ numFmt: stepDecimals(style.numFmt, -1) })} className="h-7 rounded px-1 text-[11px] text-ink hover:bg-hover">.00→.0</button>
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Cells">
            <RibbonRows>
              <RibbonRow>
                <RibbonButton icon={Rows2} label="Insert row" showLabel onClick={() => store.insert('row', true)} />
                <RibbonButton icon={Columns2} label="Insert column" showLabel onClick={() => store.insert('col', true)} />
              </RibbonRow>
              <RibbonRow>
                <RibbonButton icon={Trash2} label="Delete row" showLabel onClick={() => store.remove('row')} />
                <RibbonButton icon={Trash2} label="Delete column" showLabel onClick={() => store.remove('col')} />
              </RibbonRow>
            </RibbonRows>
          </RibbonGroup>

          <RibbonGroup label="Editing">
            <RibbonButton large icon={Sigma} label="AutoSum" onClick={() => p.autoSum('SUM')} shortcut="Alt+=" />
            <RibbonRows>
              <RibbonButton icon={ArrowDownAZ} label="Sort A to Z" showLabel onClick={() => store.sort(false)} />
              <RibbonButton icon={ArrowDownZA} label="Sort Z to A" showLabel onClick={() => store.sort(true)} />
            </RibbonRows>
          </RibbonGroup>
        </>
      )}

      {active === 'insert' && (
        <RibbonGroup label="Charts">
          <RibbonButton large icon={ChartColumn} label="Column" onClick={() => p.insertChart('column')} />
          <RibbonButton large icon={ChartBar} label="Bar" onClick={() => p.insertChart('bar')} />
          <RibbonButton large icon={ChartLine} label="Line" onClick={() => p.insertChart('line')} />
          <RibbonButton large icon={ChartPie} label="Pie" onClick={() => p.insertChart('pie')} />
        </RibbonGroup>
      )}

      {active === 'formulas' && (
        <>
          <RibbonGroup label="Function library">
            <RibbonButton large icon={Sigma} label="Sum" onClick={() => p.autoSum('SUM')} />
            {(['AVERAGE', 'COUNT', 'MIN', 'MAX'] as const).map((fn) => (
              <RibbonButton key={fn} large icon={FunctionSquare} label={fn[0] + fn.slice(1).toLowerCase()} onClick={() => p.autoSum(fn)} />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Auditing">
            <RibbonButton large icon={Eye} label="Show formulas" active={p.showFormulas} onClick={() => p.setShowFormulas(!p.showFormulas)} shortcut="Ctrl+`" />
          </RibbonGroup>
        </>
      )}

      {active === 'data' && (
        <RibbonGroup label="Sort">
          <RibbonButton large icon={ArrowDownAZ} label="Sort A to Z" onClick={() => store.sort(false)} />
          <RibbonButton large icon={ArrowDownZA} label="Sort Z to A" onClick={() => store.sort(true)} />
        </RibbonGroup>
      )}

      {active === 'view' && (
        <>
          <RibbonGroup label="Freeze">
            <RibbonButton large icon={Snowflake} label="Freeze panes" active={frozen.rows === anchor.row && frozen.cols === anchor.col && (frozen.rows > 0 || frozen.cols > 0)} onClick={() => store.setFrozen(anchor.row, anchor.col)} />
            <RibbonButton large icon={Rows2} label="Top row" active={frozen.rows === 1 && frozen.cols === 0} onClick={() => store.setFrozen(1, 0)} />
            <RibbonButton large icon={Columns2} label="First column" active={frozen.rows === 0 && frozen.cols === 1} onClick={() => store.setFrozen(0, 1)} />
            <RibbonButton large icon={Grid3x3} label="Unfreeze" disabled={!frozen.rows && !frozen.cols} onClick={() => store.setFrozen(0, 0)} />
          </RibbonGroup>
          <RibbonGroup label="Show">
            <RibbonButton large icon={Grid3x3} label="Gridlines" active={p.showGridlines} onClick={() => p.setShowGridlines(!p.showGridlines)} />
            <RibbonButton large icon={Eye} label="Formulas" active={p.showFormulas} onClick={() => p.setShowFormulas(!p.showFormulas)} />
          </RibbonGroup>
          <RibbonGroup label="Theme">
            <RibbonButton large icon={Sun} label="Light" active={p.theme === 'light'} onClick={() => p.setTheme('light')} />
            <RibbonButton large icon={Moon} label="Dark" active={p.theme === 'dark'} onClick={() => p.setTheme('dark')} />
            <RibbonButton large icon={Monitor} label="System" active={p.theme === 'system'} onClick={() => p.setTheme('system')} />
          </RibbonGroup>
        </>
      )}

      {active === 'chart' && chart && (
        <>
          <RibbonGroup label="Title">
            <input
              aria-label="Chart title"
              value={chart.title}
              placeholder="Chart title"
              onChange={(e) => store.updateChart(chart.id, { title: e.target.value })}
              className="h-7 w-48 rounded border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-[var(--accent)]"
            />
          </RibbonGroup>
          <RibbonGroup label="Type">
            <RibbonButton large icon={ChartColumn} label="Column" active={chart.type === 'column'} onClick={() => store.updateChart(chart.id, { type: 'column' })} />
            <RibbonButton large icon={ChartBar} label="Bar" active={chart.type === 'bar'} onClick={() => store.updateChart(chart.id, { type: 'bar' })} />
            <RibbonButton large icon={ChartLine} label="Line" active={chart.type === 'line'} onClick={() => store.updateChart(chart.id, { type: 'line' })} />
            <RibbonButton large icon={ChartPie} label="Pie" active={chart.type === 'pie'} onClick={() => store.updateChart(chart.id, { type: 'pie' })} />
          </RibbonGroup>
          <RibbonGroup label="Data">
            <RibbonButton large icon={Grid3x3} label="Use selection" onClick={() => store.updateChart(chart.id, { range: store.range })} />
          </RibbonGroup>
          <RibbonGroup label="Chart">
            <RibbonButton large icon={Trash2} label="Delete chart" onClick={() => store.deleteChart(chart.id)} />
          </RibbonGroup>
        </>
      )}
    </Ribbon>
  )
}
