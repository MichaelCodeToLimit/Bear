import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { getSearch } from './extensions'

interface FindPanelProps {
  editor: Editor
  showReplace: boolean
  onClose: () => void
}

export function FindPanel({ editor, showReplace, onClose }: FindPanelProps) {
  const [query, setQuery] = useState(getSearch(editor).query)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(showReplace)
  const input = useRef<HTMLInputElement>(null)
  const { results, index } = getSearch(editor)

  useEffect(() => setReplaceOpen((o) => o || showReplace), [showReplace])
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [showReplace])
  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive)
  }, [editor, query, caseSensitive])
  useEffect(() => () => void editor.commands.setSearch(''), [editor])
  // Esc closes the panel wherever focus is (e.g. after clicking Replace).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const go = (delta: number) => {
    if (!results.length) return
    const next = (index + delta + results.length) % results.length
    editor.commands.setSearchIndex(next)
    const hit = results[next]
    editor.chain().setTextSelection(hit).scrollIntoView().run()
  }

  return (
    <div className="absolute right-6 top-3 z-30 w-[340px] rounded-md border border-line bg-surface p-2 text-[13px] text-ink shadow-lg print:hidden">
      <div className="flex items-center gap-1">
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(e.shiftKey ? -1 : 1)
            if (e.key === 'Escape') onClose()
          }}
          placeholder="Find in document"
          className="h-7 min-w-0 flex-1 rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]"
        />
        <span className="w-14 text-center text-[11px] text-muted">
          {query ? (results.length ? `${index + 1} of ${results.length}` : 'No results') : ''}
        </span>
        <button title="Previous (Shift+Enter)" onClick={() => go(-1)} className="rounded p-1 hover:bg-hover"><ChevronUp size={15} /></button>
        <button title="Next (Enter)" onClick={() => go(1)} className="rounded p-1 hover:bg-hover"><ChevronDown size={15} /></button>
        <button title="Close (Esc)" onClick={onClose} className="rounded p-1 hover:bg-hover"><X size={15} /></button>
      </div>

      {replaceOpen && (
        <div className="mt-1.5 flex items-center gap-1">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Replace with"
            className="h-7 min-w-0 flex-1 rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]"
          />
          <button onClick={() => editor.commands.replaceCurrent(replacement)} disabled={!results.length} className="rounded border border-line px-2 py-1 text-[12px] hover:bg-hover disabled:opacity-40">Replace</button>
          <button onClick={() => editor.commands.replaceAll(replacement)} disabled={!results.length} className="rounded border border-line px-2 py-1 text-[12px] hover:bg-hover disabled:opacity-40">All</button>
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Match case
        </label>
        {!replaceOpen && (
          <button onClick={() => setReplaceOpen(true)} className="hover:text-ink">Replace…</button>
        )}
      </div>
    </div>
  )
}
