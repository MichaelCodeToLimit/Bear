import { useEffect, useReducer, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CaseSensitive, Code, Eraser, Highlighter, ImagePlus, IndentDecrease,
  IndentIncrease, Italic, Link2, List, ListChecks, ListOrdered, Minus, Palette, Quote, Redo2, Strikethrough, Table2,
  Underline, Undo2
} from 'lucide-react'
import { writeExtensions } from '@bear/app-write/src/extensions'
import { insertTable } from '@bear/app-write/src/tables'
import { prepareImage } from '@bear/ui/src/images'
import { IconButton, Swatches, ask, sheet, toast } from './ui'

/** The rich-text engine Write uses on the desktop, set up for touch. Used by Write, Notes and Sites. */
export function usePhoneEditor(opts: { content: JSONContent | string; placeholder?: string; tasks?: boolean; editable?: boolean; onUpdate?: (e: Editor) => void }) {
  const update = useRef(opts.onUpdate)
  update.current = opts.onUpdate
  const editor = useEditor({
    extensions: [...writeExtensions(opts.placeholder ?? 'Start typing…'), ...(opts.tasks ? [TaskList, TaskItem.configure({ nested: true })] : [])],
    content: opts.content,
    editable: opts.editable ?? true,
    editorProps: { attributes: { class: 'write-doc phone-doc', spellcheck: 'true', autocapitalize: 'sentences' } },
    onUpdate: ({ editor: e }) => update.current?.(e)
  })
  useEffect(() => {
    editor?.setEditable(opts.editable ?? true)
  }, [editor, opts.editable])
  return editor
}

export function DocSurface({ editor, className = '' }: { editor: Editor | null; className?: string }) {
  return (
    <div
      className={`min-h-full px-5 pb-28 pt-4 ${className}`}
      onClick={(e) => {
        // Tapping below the last line puts the cursor at the end, like a notes app.
        if (e.target === e.currentTarget) editor?.chain().focus('end').run()
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}

function useRerenderOn(editor: Editor | null) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', force)
    return () => {
      editor.off('transaction', force)
    }
  }, [editor])
}

const STYLES: { label: string; cls: string; apply: (e: Editor) => void; active: (e: Editor) => boolean }[] = [
  { label: 'Title', cls: 'text-[26px] font-bold', apply: (e) => e.chain().focus().setHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
  { label: 'Heading', cls: 'text-[21px] font-semibold', apply: (e) => e.chain().focus().setHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
  { label: 'Subheading', cls: 'text-[17px] font-semibold', apply: (e) => e.chain().focus().setHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  { label: 'Body', cls: 'text-[15px]', apply: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive('paragraph') && !e.isActive('blockquote') },
  { label: 'Quote', cls: 'border-l-4 border-line pl-3 italic text-muted', apply: (e) => e.chain().focus().setParagraph().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
  { label: 'Monospaced', cls: 'font-mono text-[14px]', apply: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive('codeBlock') }
]

const SIZES = ['9pt', '11pt', '14pt', '18pt', '24pt', '36pt']

/** Formatting bar shown above the keyboard. */
export function FormatBar({ editor, tasks }: { editor: Editor | null; tasks?: boolean }) {
  useRerenderOn(editor)
  const imageInput = useRef<HTMLInputElement>(null)
  if (!editor) return null
  const c = () => editor.chain().focus()
  const B = (p: { icon: typeof Bold; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) => <IconButton {...p} size={21} className="text-ink" />

  const styleSheet = () =>
    sheet(
      (close) => (
        <div className="pb-2">
          {STYLES.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                close()
                s.apply(editor)
              }}
              className={`flex w-full items-center px-5 py-3 text-left active:bg-hover ${s.active(editor) ? 'bg-[var(--accent)]/10' : ''}`}
            >
              <span className={s.cls}>{s.label}</span>
            </button>
          ))}
          <div className="px-5 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-muted">Size</div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-2">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  close()
                  c().setFontSize(s).run()
                }}
                className={`h-10 shrink-0 rounded-full border px-4 text-[14px] ${editor.getAttributes('textStyle').fontSize === s ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-line text-ink'}`}
              >
                {s.replace('pt', '')}
              </button>
            ))}
          </div>
        </div>
      ),
      'Text style'
    )

  const colorSheet = (kind: 'color' | 'highlight') =>
    sheet(
      (close) => (
        <Swatches
          colors={kind === 'highlight' ? ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff'] : undefined}
          value={kind === 'color' ? editor.getAttributes('textStyle').color : editor.getAttributes('highlight').color}
          none={kind === 'color' ? 'Automatic' : 'No highlight'}
          onPick={(col) => {
            close()
            if (kind === 'color') (col ? c().setColor(col) : c().unsetColor()).run()
            else (col ? c().setHighlight({ color: col }) : c().unsetHighlight()).run()
          }}
        />
      ),
      kind === 'color' ? 'Text colour' : 'Highlight'
    )

  const link = async () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = await ask('Link', { value: prev ?? 'https://', ok: 'Apply', inputMode: 'url' })
    if (url === null) return
    if (!url.trim() || url.trim() === 'https://') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const addImage = async (file: File) => {
    try {
      const img = await prepareImage(file)
      const w = Math.min(img.width, 600)
      c().insertContent({ type: 'image', attrs: { src: img.src, width: w, height: Math.round((img.height * w) / img.width) } }).run()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const inList = editor.isActive('listItem') || editor.isActive('taskItem')
  const item = editor.isActive('taskItem') ? 'taskItem' : 'listItem'

  return (
    <div className="phone-formatbar shrink-0 border-t border-line bg-surface">
      <div className="no-scrollbar flex items-center overflow-x-auto px-1">
        <B icon={Undo2} label="Undo" disabled={!editor.can().undo()} onClick={() => c().undo().run()} />
        <B icon={Redo2} label="Redo" disabled={!editor.can().redo()} onClick={() => c().redo().run()} />
        <div className="mx-1 h-6 w-px shrink-0 bg-line" />
        <B icon={CaseSensitive} label="Text style" onClick={styleSheet} />
        <B icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
        <B icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
        <B icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
        <B icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
        <div className="mx-1 h-6 w-px shrink-0 bg-line" />
        <B icon={List} label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
        <B icon={ListOrdered} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
        {tasks && <B icon={ListChecks} label="Checklist" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />}
        {inList && <B icon={IndentDecrease} label="Decrease indent" onClick={() => c().liftListItem(item).run()} />}
        {inList && <B icon={IndentIncrease} label="Increase indent" onClick={() => c().sinkListItem(item).run()} />}
        <div className="mx-1 h-6 w-px shrink-0 bg-line" />
        <B icon={Palette} label="Text colour" onClick={() => colorSheet('color')} />
        <B icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => colorSheet('highlight')} />
        <B icon={AlignLeft} label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()} />
        <B icon={AlignCenter} label="Centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()} />
        <B icon={AlignRight} label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()} />
        <B icon={AlignJustify} label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()} />
        <div className="mx-1 h-6 w-px shrink-0 bg-line" />
        <B icon={Link2} label="Link" active={editor.isActive('link')} onClick={() => void link()} />
        <B icon={ImagePlus} label="Picture" onClick={() => imageInput.current?.click()} />
        <B icon={Table2} label="Table" onClick={() => insertTable(editor, 3, 3)} />
        <B icon={Quote} label="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()} />
        <B icon={Code} label="Code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()} />
        <B icon={Minus} label="Divider" onClick={() => c().setHorizontalRule().run()} />
        <B icon={Eraser} label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()} />
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void addImage(f)
        }}
      />
    </div>
  )
}

