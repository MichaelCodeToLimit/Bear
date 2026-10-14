import type { Editor } from '@tiptap/core'
import Table, { TableView } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

export type TableStyle = 'grid' | 'accent' | 'banded' | 'minimal'
export type VAlign = 'top' | 'middle' | 'bottom'

export const TABLE_STYLES: { id: TableStyle; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'accent', label: 'Accent header' },
  { id: 'banded', label: 'Banded rows' },
  { id: 'minimal', label: 'Minimal' }
]

/**
 * The resizable-table view draws its own <table> and ignores node attributes, so apply the
 * style class to it ourselves (on creation and whenever the node changes).
 */
export class StyledTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number) {
    super(node, cellMinWidth)
    this.applyStyle(node)
  }

  update(node: PMNode): boolean {
    if (!super.update(node)) return false
    this.applyStyle(node)
    return true
  }

  private applyStyle(node: PMNode) {
    const style = (node.attrs.tableStyle as string) || 'grid'
    this.table.className = `tbl-${style}`
    this.table.setAttribute('data-style', style)
  }
}

/** Table with a named style, stored as data-style and shown through CSS classes. */
export const StyledTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableStyle: {
        default: 'grid',
        parseHTML: (el) => el.getAttribute('data-style') || 'grid',
        renderHTML: (attrs) => ({ 'data-style': attrs.tableStyle, class: `tbl-${attrs.tableStyle}` })
      }
    }
  }
})

const cellAttributes = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-bg') || el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.backgroundColor ? { 'data-bg': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` } : {}
  },
  verticalAlign: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-valign') || null,
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.verticalAlign ? { 'data-valign': attrs.verticalAlign, style: `vertical-align: ${attrs.verticalAlign}` } : {}
  }
}

export const ShadedCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  }
})

export const ShadedHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  }
})

/** The table around the cursor and whether its first row / first column are header cells. */
export function tableInfo(editor: Editor): { style: TableStyle; headerRow: boolean; headerCol: boolean } | null {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name !== 'table') continue
    const first = node.firstChild
    let headerRow = !!first && first.childCount > 0
    first?.forEach((c) => (headerRow &&= c.type.name === 'tableHeader'))
    let headerCol = node.childCount > 0
    node.forEach((row) => (headerCol &&= row.firstChild?.type.name === 'tableHeader'))
    return { style: (node.attrs.tableStyle as TableStyle) ?? 'grid', headerRow, headerCol }
  }
  return null
}

/** Clear manual column widths in the current table so columns share the width equally. */
export function distributeColumns(editor: Editor): boolean {
  const { state } = editor
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name !== 'table') continue
    const start = $from.before(d)
    const tr = state.tr
    node.descendants((child, pos) => {
      if ((child.type.name === 'tableCell' || child.type.name === 'tableHeader') && child.attrs.colwidth) {
        tr.setNodeMarkup(start + 1 + pos, undefined, { ...child.attrs, colwidth: null })
      }
      return child.type.name === 'table' || child.type.name === 'tableRow'
    })
    editor.view.dispatch(tr)
    return true
  }
  return false
}

/** Insert a table, optionally styled, and put the cursor in its first cell. */
export function insertTable(editor: Editor, rows: number, cols: number, opts: { header?: boolean; style?: TableStyle } = {}) {
  const chain = editor.chain().focus().insertTable({ rows, cols, withHeaderRow: opts.header ?? true })
  if (opts.style && opts.style !== 'grid') chain.updateAttributes('table', { tableStyle: opts.style })
  chain.run()
}
