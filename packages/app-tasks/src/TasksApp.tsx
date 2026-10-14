import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronDown, ChevronRight, Columns3, Inbox, List as ListIcon, ListPlus, Plus, Search, Star,
  Sun, Trash2, X
} from 'lucide-react'
import { getApp } from '@bear/core'
import { ContextMenu, TitleBar, statusLabel, useStoredData, type MenuItem } from '@bear/ui'
import {
  addBucket, addList, addTask, deleteBucket, deleteList, deleteTask, dueLabel, inView, initialTasks, moveToBucket,
  patchTask, renameBucket, renameList, setDone, sortTasks, today, uid, upgradeTasks,
  type SmartView, type Task, type TasksData, type View
} from './model'

const APP = getApp('tasks')

const SMART: { id: SmartView; name: string; icon: typeof Sun }[] = [
  { id: 'myday', name: 'My Day', icon: Sun },
  { id: 'important', name: 'Important', icon: Star },
  { id: 'planned', name: 'Planned', icon: CalendarDays },
  { id: 'all', name: 'All tasks', icon: Inbox }
]

const sameView = (a: View, b: View) => ('smart' in a && 'smart' in b ? a.smart === b.smart : 'list' in a && 'list' in b && a.list === b.list)

export function TasksApp({ onHome }: { onHome: () => void }) {
  const store = useStoredData<TasksData>('tasks', initialTasks, upgradeTasks)
  const [view, setView] = useState<View>({ smart: 'myday' })
  const [mode, setMode] = useState<'list' | 'board'>('list')
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ label: string; data: TasksData } | null>(null)
  const d = store.data
  const update = store.update

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  const viewName = !d ? '' : 'smart' in view ? SMART.find((s) => s.id === view.smart)!.name : d.lists.find((l) => l.id === view.list)?.name ?? ''
  useEffect(() => window.bear.setTitle(`${viewName} - Bear ${APP.name}`), [viewName])

  const list = d && 'list' in view ? d.lists.find((l) => l.id === view.list) : undefined
  const visible = useMemo(() => {
    if (!d) return []
    const q = query.trim().toLowerCase()
    const tasks = q ? d.tasks.filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) : d.tasks.filter((t) => inView(t, view))
    return sortTasks(tasks)
  }, [d, view, query])
  const open = visible.filter((t) => !t.done)
  const done = visible.filter((t) => t.done)
  const task = d?.tasks.find((t) => t.id === selected) ?? null

  if (!d) return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>

  const remove = (t: Task) => {
    setUndo({ label: `Deleted "${t.title}"`, data: d })
    update((x) => deleteTask(x, t.id))
    if (selected === t.id) setSelected(null)
  }

  const listMenu = (id: string, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        { label: 'Rename list', onClick: () => setRenaming(id) },
        {
          label: 'Delete list', disabled: d.lists[0].id === id, divider: true,
          onClick: () => {
            const l = d.lists.find((x) => x.id === id)!
            setUndo({ label: `Deleted list "${l.name}"`, data: d })
            update((x) => deleteList(x, id))
            if ('list' in view && view.list === id) setView({ smart: 'myday' })
          }
        }
      ]
    })

  const count = (v: View) => d.tasks.filter((t) => !t.done && inView(t, v)).length

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <TitleBar app={APP} docName={viewName} dirty={false} status={statusLabel(store.status)} onHome={onHome} />
      {store.error && (
        <div className="flex items-center justify-between bg-red-100 px-4 py-1.5 text-[13px] text-red-900">
          {store.error}
          <button onClick={store.dismissError} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Lists */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface py-3 text-[13px]">
          <div className="mx-3 mb-3 flex items-center gap-2 rounded border border-line bg-canvas px-2">
            <Search size={14} className="text-muted" />
            <input aria-label="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-7 min-w-0 flex-1 bg-transparent text-ink outline-none" />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}
          </div>
          {SMART.map((s) => (
            <NavItem key={s.id} icon={<s.icon size={16} />} label={s.name} count={count({ smart: s.id })} active={!query && sameView(view, { smart: s.id })} onClick={() => { setQuery(''); setView({ smart: s.id }); setMode('list') }} />
          ))}
          <hr className="mx-3 my-2 border-line" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {d.lists.map((l) =>
              renaming === l.id ? (
                <input
                  key={l.id}
                  autoFocus
                  aria-label="List name"
                  defaultValue={l.name}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { update((x) => renameList(x, l.id, e.target.value)); setRenaming(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
                  className="mx-3 my-0.5 h-8 w-[calc(100%-24px)] rounded border border-[var(--accent)] bg-canvas px-2 text-ink outline-none"
                />
              ) : (
                <NavItem
                  key={l.id}
                  icon={<ListIcon size={16} style={{ color: l.color }} />}
                  label={l.name}
                  count={count({ list: l.id })}
                  active={!query && sameView(view, { list: l.id })}
                  onClick={() => { setQuery(''); setView({ list: l.id }) }}
                  onDoubleClick={() => setRenaming(l.id)}
                  onContextMenu={(e) => { e.preventDefault(); listMenu(l.id, e.clientX, e.clientY) }}
                />
              )
            )}
          </div>
          <button
            onClick={() => {
              const { data, list: l } = addList(d, 'Untitled list')
              update(() => data)
              setView({ list: l.id })
              setRenaming(l.id)
            }}
            className="mx-2 mt-2 flex items-center gap-2 rounded px-2 py-2 text-[var(--accent)] hover:bg-hover"
          >
            <ListPlus size={16} /> New list
          </button>
        </aside>

        {/* Tasks */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-end justify-between px-8 pb-3 pt-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink">{query ? `Search: ${query}` : viewName}</h1>
              {'smart' in view && view.smart === 'myday' && !query && (
                <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              )}
            </div>
            {list && !query && (
              <div className="flex rounded border border-line bg-surface text-[12px]" role="group" aria-label="View">
                <button aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={`flex items-center gap-1 px-2.5 py-1 ${mode === 'list' ? 'bg-active font-medium' : ''}`}><ListIcon size={14} /> List</button>
                <button aria-pressed={mode === 'board'} onClick={() => setMode('board')} className={`flex items-center gap-1 px-2.5 py-1 ${mode === 'board' ? 'bg-active font-medium' : ''}`}><Columns3 size={14} /> Board</button>
              </div>
            )}
          </header>

          {list && mode === 'board' && !query ? (
            <BoardView data={d} listId={list.id} onSelect={setSelected} update={update} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
              {!query && <AddTask onAdd={(title) => update((x) => addTask(x, title, view).data)} />}
              <div className="mt-2 space-y-1">
                {open.map((t) => <TaskRow key={t.id} t={t} data={d} selected={t.id === selected} onSelect={() => setSelected(t.id)} update={update} showList={'smart' in view || !!query} />)}
              </div>
              {!open.length && !done.length && (
                <p className="mt-10 text-center text-sm text-muted">{query ? 'No matching tasks.' : 'Nothing here yet. Add a task above.'}</p>
              )}
              {done.length > 0 && <CompletedSection tasks={done} data={d} selected={selected} onSelect={setSelected} update={update} />}
            </div>
          )}
        </main>

        {task && <Details key={task.id} task={task} data={d} update={update} onClose={() => setSelected(null)} onDelete={() => remove(task)} />}
      </div>

      {undo && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-md bg-[#1f1f1f] px-4 py-2.5 text-sm text-white shadow-lg">
          {undo.label}
          <button onClick={() => { const prev = undo.data; update(() => prev); setUndo(null) }} className="font-semibold text-teal-300 hover:underline">Undo</button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function NavItem({ icon, label, count, active, onClick, onDoubleClick, onContextMenu }: {
  icon: React.ReactNode; label: string; count: number; active: boolean; onClick: () => void
  onDoubleClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      aria-current={active ? 'page' : undefined}
      className={`mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded px-2 py-2 text-left ${active ? 'bg-active font-medium text-ink' : 'text-ink hover:bg-hover'}`}
    >
      <span className="text-[var(--accent)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <span className="text-[11px] text-muted">{count}</span>}
    </button>
  )
}

function AddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        onAdd(text)
        setText('')
      }}
      className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 shadow-sm focus-within:border-[var(--accent)]"
    >
      <Plus size={18} className="text-[var(--accent)]" />
      <input aria-label="Add a task" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
    </form>
  )
}

type Update = (fn: (d: TasksData) => TasksData) => void

function CheckCircle({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition"
      style={{ borderColor: 'var(--accent)', background: done ? 'var(--accent)' : 'transparent' }}
    >
      {done && <Check size={11} strokeWidth={3} className="text-white" />}
    </button>
  )
}

function TaskRow({ t, data, selected, onSelect, update, showList }: { t: Task; data: TasksData; selected: boolean; onSelect: () => void; update: Update; showList: boolean }) {
  const due = t.due ? dueLabel(t.due) : null
  const list = data.lists.find((l) => l.id === t.listId)
  const stepsDone = t.steps.filter((s) => s.done).length
  const meta = [
    showList && list ? list.name : null,
    t.myDay === today() ? 'My Day' : null,
    t.steps.length ? `${stepsDone} of ${t.steps.length}` : null,
    t.notes ? 'Note' : null
  ].filter(Boolean)
  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 ${selected ? 'border-[var(--accent)] bg-active' : 'border-transparent bg-surface hover:bg-hover'}`}
    >
      <CheckCircle done={t.done} label={`Complete ${t.title}`} onToggle={() => update((x) => setDone(x, t.id, !t.done))} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${t.done ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</div>
        {(meta.length > 0 || due) && (
          <div className="flex gap-2 text-[11px] text-muted">
            {meta.map((m) => <span key={m as string}>{m}</span>)}
            {due && <span className={due.overdue && !t.done ? 'font-medium text-red-600' : ''}>{due.text}</span>}
          </div>
        )}
      </div>
      <button
        aria-label={t.important ? 'Remove importance' : 'Mark as important'}
        aria-pressed={t.important}
        onClick={(e) => { e.stopPropagation(); update((x) => patchTask(x, t.id, { important: !t.important })) }}
        className="rounded p-1 hover:bg-hover"
      >
        <Star size={16} className="text-[var(--accent)]" fill={t.important ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

function CompletedSection({ tasks, data, selected, onSelect, update }: { tasks: Task[]; data: TasksData; selected: string | null; onSelect: (id: string) => void; update: Update }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[13px] font-medium text-ink">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Completed {tasks.length}
      </button>
      {open && <div className="mt-2 space-y-1">{tasks.map((t) => <TaskRow key={t.id} t={t} data={data} selected={t.id === selected} onSelect={() => onSelect(t.id)} update={update} showList={false} />)}</div>}
    </div>
  )
}

function Details({ task, data, update, onClose, onDelete }: { task: Task; data: TasksData; update: Update; onClose: () => void; onDelete: () => void }) {
  const [step, setStep] = useState('')
  const set = (patch: Partial<Task>) => update((x) => patchTask(x, task.id, patch))
  const inMyDay = task.myDay === today()
  return (
    <aside aria-label="Task details" className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-3">
          <div className="pt-1"><CheckCircle done={task.done} label={`Complete ${task.title}`} onToggle={() => update((x) => setDone(x, task.id, !task.done))} /></div>
          <textarea
            aria-label="Task title"
            value={task.title}
            rows={2}
            onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
            className="min-w-0 flex-1 resize-none bg-transparent text-[15px] font-medium text-ink outline-none"
          />
          <button aria-label={task.important ? 'Remove importance' : 'Mark as important'} onClick={() => set({ important: !task.important })} className="pt-1">
            <Star size={16} className="text-[var(--accent)]" fill={task.important ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="rounded-md border border-line bg-canvas p-2">
          {task.steps.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 px-1 py-1">
              <CheckCircle done={s.done} label={`Complete step ${s.title}`} onToggle={() => set({ steps: task.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
              <span className={`min-w-0 flex-1 text-[13px] ${s.done ? 'text-muted line-through' : 'text-ink'}`}>{s.title}</span>
              <button aria-label={`Delete step ${s.title}`} onClick={() => set({ steps: task.steps.filter((x) => x.id !== s.id) })} className="opacity-0 group-hover:opacity-100"><X size={13} /></button>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; set({ steps: [...task.steps, { id: uid('s'), title: step.trim(), done: false }] }); setStep('') }} className="flex items-center gap-2 px-1">
            <Plus size={14} className="text-[var(--accent)]" />
            <input aria-label="Add step" value={step} onChange={(e) => setStep(e.target.value)} placeholder={task.steps.length ? 'Next step' : 'Add step'} className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" />
          </form>
        </div>

        <button onClick={() => set({ myDay: inMyDay ? null : today() })} className="flex w-full items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5 text-left text-[13px] text-ink hover:bg-hover">
          <Sun size={16} className="text-[var(--accent)]" /> {inMyDay ? 'Added to My Day' : 'Add to My Day'}
          {inMyDay && <X size={14} className="ml-auto text-muted" />}
        </button>

        <label className="flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink">
          <CalendarDays size={16} className="text-[var(--accent)]" />
          <span className="flex-1">Due date</span>
          <input type="date" aria-label="Due date" value={task.due ?? ''} onChange={(e) => set({ due: e.target.value || null })} className="bg-transparent text-ink outline-none" />
        </label>

        <label className="flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink">
          <ListIcon size={16} className="text-[var(--accent)]" />
          <span className="flex-1">List</span>
          <select
            aria-label="List"
            value={task.listId}
            onChange={(e) => {
              const list = data.lists.find((l) => l.id === e.target.value)!
              set({ listId: list.id, bucket: list.buckets[0]?.id ?? null })
            }}
            className="max-w-[140px] bg-transparent text-ink outline-none"
          >
            {data.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <textarea aria-label="Notes" value={task.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Add note" rows={6} className="w-full resize-y rounded-md border border-line bg-canvas p-3 text-[13px] text-ink outline-none focus:border-[var(--accent)]" />
      </div>
      <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-[12px] text-muted">
        <button aria-label="Close details" onClick={onClose} className="rounded p-1 hover:bg-hover"><X size={15} /></button>
        <span>Created {new Date(task.created).toLocaleDateString()}</span>
        <button aria-label="Delete task" onClick={onDelete} className="rounded p-1 hover:bg-hover hover:text-red-600"><Trash2 size={15} /></button>
      </footer>
    </aside>
  )
}

function BoardView({ data, listId, onSelect, update }: { data: TasksData; listId: string; onSelect: (id: string) => void; update: Update }) {
  const list = data.lists.find((l) => l.id === listId)!
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const tasks = sortTasks(data.tasks.filter((t) => t.listId === listId))
  const firstBucket = list.buckets[0]?.id

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-8 pb-6" aria-label="Board">
      {list.buckets.map((b) => {
        const cards = tasks.filter((t) => (t.bucket ?? firstBucket) === b.id)
        return (
          <section
            key={b.id}
            aria-label={`Column ${b.name}`}
            onDragOver={(e) => { e.preventDefault(); setOver(b.id) }}
            onDragLeave={() => setOver((o) => (o === b.id ? null : o))}
            onDrop={(e) => {
              // The card id travels with the drag itself, so it's there even if React hasn't re-rendered yet.
              const id = e.dataTransfer.getData('text/x-bear-task') || dragging
              if (id) update((x) => moveToBucket(x, id, b.id))
              setDragging(null)
              setOver(null)
            }}
            className={`flex w-72 shrink-0 flex-col rounded-lg p-2 ${over === b.id ? 'bg-active' : 'bg-surface'}`}
          >
            <div className="group mb-2 flex items-center gap-2 px-1">
              <input
                aria-label="Column name"
                defaultValue={b.name}
                onBlur={(e) => update((x) => renameBucket(x, listId, b.id, e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-ink outline-none"
              />
              <span className="text-[11px] text-muted">{cards.length}</span>
              {list.buckets.length > 1 && (
                <button aria-label={`Delete column ${b.name}`} onClick={() => update((x) => deleteBucket(x, listId, b.id))} className="opacity-0 group-hover:opacity-100"><X size={13} /></button>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {cards.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/x-bear-task', t.id); e.dataTransfer.effectAllowed = 'move'; setDragging(t.id) }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onSelect(t.id)}
                  role="article"
                  aria-label={t.title}
                  className="cursor-pointer rounded-md border border-line bg-canvas p-3 shadow-sm hover:border-[var(--accent)]"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle done={t.done} label={`Complete ${t.title}`} onToggle={() => update((x) => setDone(x, t.id, !t.done))} />
                    <span className={`text-[13px] ${t.done ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</span>
                  </div>
                  {(t.due || t.important || t.steps.length > 0) && (
                    <div className="mt-2 flex items-center gap-2 pl-6 text-[11px] text-muted">
                      {t.due && <span className={dueLabel(t.due).overdue && !t.done ? 'text-red-600' : ''}>{dueLabel(t.due).text}</span>}
                      {t.steps.length > 0 && <span>{t.steps.filter((s) => s.done).length}/{t.steps.length}</span>}
                      {t.important && <Star size={11} fill="currentColor" className="text-[var(--accent)]" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {adding === b.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const title = addRef.current?.value.trim()
                  if (title) update((x) => {
                    const { data: next, task } = addTask(x, title, { list: listId })
                    return moveToBucket(next, task.id, b.id)
                  })
                  if (addRef.current) addRef.current.value = ''
                }}
              >
                <input ref={addRef} autoFocus aria-label={`New card in ${b.name}`} onBlur={() => setAdding(null)} placeholder="Task name" className="mt-2 h-9 w-full rounded border border-[var(--accent)] bg-canvas px-2 text-[13px] text-ink outline-none" />
              </form>
            ) : (
              <button onClick={() => setAdding(b.id)} className="mt-2 flex items-center gap-1 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-ink"><Plus size={14} /> Add task</button>
            )}
          </section>
        )
      })}
      <button onClick={() => update((x) => addBucket(x, listId, 'New column'))} className="flex h-10 w-48 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[13px] text-muted hover:text-ink">
        <Plus size={14} /> Add column
      </button>
    </div>
  )
}
