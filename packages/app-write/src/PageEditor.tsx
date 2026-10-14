import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  Bold, Heading1, Heading2, Highlighter, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Pilcrow,
  Quote, Strikethrough, Table2, Underline, Undo2, Redo2
} from 'lucide-react'
import { prepareImage } from '@bear/ui'
import { writeExtensions } from './extensions'
import { insertTable } from './tables'

interface PageEditorProps {
  /** Initial HTML. The editor is uncontrolled: remount (change `key`) to load a different page. */
  html: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  onError?: (message: string) => void
  /** Show the formatting toolbar (off for read-only previews). */
  toolbar?: boolean
  editable?: boolean
  className?: string
}

/**
 * A rich-text page (Write's editor engine plus checklists) for apps that store HTML pages:
 * Notes and Sites. Pictures can be inserted, pasted or dropped.
 */
export function PageEditor({ html, onChange, placeholder, onError, toolbar = true, editable = true, className }: PageEditorProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  const addImage = async (file: File) => {
    try {
      const img = await prepareImage(file)
      editor?.chain().focus().insertContent({ type: 'image', attrs: { src: img.src, width: Math.min(img.width, 640), height: Math.round((img.height * Math.min(img.width, 640)) / img.width) } }).run()
    } catch (e) {
      onError?.((e as Error).message)
    }
  }
  const addImageRef = useRef(addImage)
  addImageRef.current = addImage

  const editor = useEditor({
    extensions: [...writeExtensions(placeholder), TaskList, TaskItem.configure({ nested: true })],
    content: html,
    editable,
    editorProps: {
      attributes: { class: 'write-doc page-doc', spellcheck: 'true' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        files.forEach((f) => void addImageRef.current(f))
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        files.forEach((f) => void addImageRef.current(f))
        return true
      }
    },
    onUpdate: ({ editor: e }) => changeRef.current(e.getHTML(), e.getText())
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  if (!editor) return null
  const c = () => editor.chain().focus()
  const B = ({ icon: Icon, label, active, onClick }: { icon: typeof Bold; label: string; active?: boolean; onClick: () => void }) => (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-hover ${active ? 'bg-active text-[var(--accent)]' : ''}`}
    >
      <Icon size={15} strokeWidth={1.9} />
    </button>
  )

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ''}`}>
      {toolbar && editable && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1">
          <B icon={Undo2} label="Undo" onClick={() => c().undo().run()} />
          <B icon={Redo2} label="Redo" onClick={() => c().redo().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <B icon={Pilcrow} label="Normal text" active={editor.isActive('paragraph')} onClick={() => c().setParagraph().run()} />
          <B icon={Heading1} label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => c().toggleHeading({ level: 1 }).run()} />
          <B icon={Heading2} label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <B icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
          <B icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
          <B icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
          <B icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
          <B icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => c().toggleHighlight({ color: '#fef08a' }).run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <B icon={List} label="Bullets" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
          <B icon={ListOrdered} label="Numbering" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
          <B icon={ListChecks} label="To-do list" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />
          <B icon={Quote} label="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <B icon={Table2} label="Insert table" onClick={() => insertTable(editor, 3, 3, { header: false })} />
          <B icon={ImagePlus} label="Insert picture" onClick={() => imageInput.current?.click()} />
          <B
            icon={Link2}
            label="Link"
            active={editor.isActive('link')}
            onClick={() => {
              const prev = (editor.getAttributes('link').href as string) ?? ''
              const href = window.prompt('Link address', prev)
              if (href === null) return
              if (!href.trim()) c().extendMarkRange('link').unsetLink().run()
              else c().extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run()
            }}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void addImage(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
