import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TableRow from '@tiptap/extension-table-row'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { ShadedCell, ShadedHeader, StyledTable, StyledTableView } from './tables'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
    pageBreak: {
      setPageBreak: () => ReturnType
    }
    search: {
      setSearch: (query: string, caseSensitive?: boolean) => ReturnType
      setSearchIndex: (index: number) => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

/** Adds a `fontSize` attribute (e.g. "12pt") to the textStyle mark. */
export const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {})
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

/** Hard page break; renders as a dashed divider on screen and breaks the page in print and .docx. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break' })]
  },
  addCommands() {
    return {
      setPageBreak: () => ({ chain }) => chain().insertContent({ type: this.name }).createParagraphNear().run()
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  }
})

/** Image that keeps width/height attributes and accepts embedded data URLs. */
export const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null }
    }
  }
}).configure({ allowBase64: true, inline: false })

// ---------- Find & replace ----------

export interface SearchState {
  query: string
  caseSensitive: boolean
  results: { from: number; to: number }[]
  index: number
}

export const searchKey = new PluginKey<SearchState>('search')

function findMatches(doc: PMNode, query: string, caseSensitive: boolean): { from: number; to: number }[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Concatenate the block's text, remembering where each text node starts.
    let text = ''
    const offsets: { start: number; pos: number }[] = []
    node.forEach((child, childOffset) => {
      if (child.isText) {
        offsets.push({ start: text.length, pos: pos + 1 + childOffset })
        text += child.text
      } else {
        text += '\u0000' // non-text inline nodes break matches
      }
    })
    const hay = caseSensitive ? text : text.toLowerCase()
    const toPos = (i: number) => {
      let seg = offsets[0]
      for (const o of offsets) if (o.start <= i) seg = o
      return seg.pos + (i - seg.start)
    }
    let i = hay.indexOf(needle)
    while (i !== -1) {
      out.push({ from: toPos(i), to: toPos(i + needle.length - 1) + 1 })
      i = hay.indexOf(needle, i + Math.max(needle.length, 1))
    }
    return false
  })
  return out
}

export const Search = Extension.create({
  name: 'search',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, results: [], index: 0 }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined
            const next = { ...prev, ...meta }
            if (meta || tr.docChanged) {
              next.results = findMatches(tr.doc, next.query, next.caseSensitive)
              next.index = Math.min(next.index, Math.max(next.results.length - 1, 0))
            }
            return next
          }
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state)
            if (!s?.results.length) return null
            return DecorationSet.create(
              state.doc,
              s.results.map((r, i) =>
                Decoration.inline(r.from, r.to, { class: i === s.index ? 'search-hit search-current' : 'search-hit' })
              )
            )
          }
        }
      })
    ]
  },
  addCommands() {
    return {
      setSearch: (query, caseSensitive = false) => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(searchKey, { query, caseSensitive, index: 0 }))
        return true
      },
      setSearchIndex: (index) => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(searchKey, { index }))
        return true
      },
      replaceCurrent: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state)
        const hit = s?.results[s.index]
        if (!hit) return false
        if (replacement) tr.insertText(replacement, hit.from, hit.to)
        else tr.delete(hit.from, hit.to)
        dispatch?.(tr)
        return true
      },
      replaceAll: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state)
        if (!s?.results.length) return false
        // Replace from the end so earlier positions stay valid.
        for (const hit of [...s.results].reverse()) {
          if (replacement) tr.insertText(replacement, hit.from, hit.to)
          else tr.delete(hit.from, hit.to)
        }
        dispatch?.(tr)
        return true
      }
    }
  }
})

export function getSearch(editor: Editor): SearchState {
  return searchKey.getState(editor.state) ?? { query: '', caseSensitive: false, results: [], index: 0 }
}

export function writeExtensions(placeholder = 'Start typing…') {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Underline,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false, autolink: true }),
    SizedImage,
    StyledTable.configure({ resizable: true, View: StyledTableView }),
    TableRow,
    ShadedHeader,
    ShadedCell,
    Subscript,
    Superscript,
    PageBreak,
    Search,
    Placeholder.configure({ placeholder }),
    CharacterCount
  ]
}
