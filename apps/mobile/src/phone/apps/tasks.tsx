import { useRef, useState } from 'react'
import {
  ArrowUp, Calendar, CalendarDays, CheckCircle2, Circle, Columns3, Infinity as AllIcon, List, ListPlus, MoreVertical, Pencil,
  Plus, Star, Sun, Trash2, X
} from 'lucide-react'
import { useStoredData, statusLabel } from '@bear/ui/src/useStoredData'
import {
  addBucket, addList, addTask, deleteBucket, deleteList, deleteTask, dueLabel, inView, initialTasks, moveToBucket, patchTask,
  renameBucket, renameList, setDone, sortTasks, today, uid, upgradeTasks, type SmartView, type Task, type TasksData, type View
} from '@bear/app-tasks/src/model'
import { goBack, useLayer } from '../nav'
import { Empty, IconButton, Page, Row, Section, Segmented, ask, confirm, menu } from '../ui'

const SMART: { id: SmartView; name: string; icon: typeof Sun; color: string }[] = [
  { id: 'myday', name: 'My Day', icon: Sun, color: '#ca8a04' },
  { id: 'important', name: 'Important', icon: Star, color: '#db2777' },
  { id: 'planned', name: 'Planned', icon: CalendarDays, color: '#0d9488' },
  { id: 'all', name: 'All', icon: AllIcon, color: '#475569' }
]

type Store = { data: TasksData; update: (fn: (d: TasksData) => TasksData) => void }

export default function TasksPhone() {
  const store = useStoredData<TasksData>('tasks', initialTasks, upgradeTasks)
  const view = useLayer<View>()
  const task = useLayer<string>()
  const d = store.data
  if (!d) return <Page title="Tasks" back tinted>{null}</Page>
  const s: Store = { data: d, update: store.update }

  if (task.value) {
    const t = d.tasks.find((x) => x.id === task.value)
    if (t) return <TaskDetail key={t.id} s={s} t={t} onDeleted={() => task.close()} />
  }
  if (view.value) return <ViewScreen s={s} view={view.value} openTask={task.open} />

  const open = (id: string) => d.tasks.filter((t) => !t.done && (t.listId === id))
  const smartCount = (v: SmartView) => d.tasks.filter((t) => !t.done && inView(t, { smart: v })).length
  return (
    <Page
      title="Tasks"
      subtitle={statusLabel(store.status)}
      tinted
      back
      actions={
        <IconButton
          icon={ListPlus}
          label="New list"
          onClick={async () => {
            const name = await ask('New list', { placeholder: 'List name', ok: 'Create' })
            if (name === null) return
            const r = addList(d, name)
            store.update(() => r.data)
            view.open({ list: r.list.id })
          }}
        />
      }
    >
      {store.error && <div className="mx-4 mt-3 rounded-xl bg-red-100 px-4 py-3 text-[14px] text-red-900">{store.error}</div>}
      <div className="grid grid-cols-2 gap-3 px-3 pt-4">
        {SMART.map((v) => (
          <button
            key={v.id}
            onClick={() => view.open({ smart: v.id })}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-line/60 active:scale-[0.97]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: v.color }}>
                <v.icon size={19} />
              </span>
              <span className="text-[22px] font-semibold text-ink">{smartCount(v.id)}</span>
            </div>
            <span className="text-[15px] font-medium text-ink">{v.name}</span>
          </button>
        ))}
      </div>
      <Section title="My lists">
        {d.lists.map((l, i) => (
          <div key={l.id}>
            {i > 0 && <div className="ml-[60px] h-px bg-line/70" />}
            <Row
              leading={<span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: l.color }}><List size={17} /></span>}
              title={l.name}
              trailing={<span className="text-[14px] text-muted">{open(l.id).length || ''}</span>}
              onClick={() => view.open({ list: l.id })}
              onMore={() => listMenu(s, l.id, i === 0)}
            />
          </div>
        ))}
      </Section>
      <div className="h-10" />
    </Page>
  )
}

function listMenu(s: Store, id: string, first: boolean, onDeleted?: () => void) {
  const l = s.data.lists.find((x) => x.id === id)!
  menu(
    [
      {
        label: 'Rename list',
        icon: Pencil,
        onClick: async () => {
          const name = await ask('Rename list', { value: l.name, ok: 'Rename' })
          if (name !== null) s.update((x) => renameList(x, id, name))
        }
      },
      {
        label: 'Delete list',
        icon: Trash2,
        danger: true,
        disabled: first,
        onClick: async () => {
          if (!(await confirm(`Delete “${l.name}”?`, 'Its tasks are deleted too. This can’t be undone.'))) return
          onDeleted?.()
          s.update((x) => deleteList(x, id))
        }
      }
    ],
    l.name
  )
}

function viewInfo(d: TasksData, view: View) {
  if ('smart' in view) {
    const v = SMART.find((x) => x.id === view.smart)!
    return { name: v.name, color: v.color, list: null }
  }
  const l = d.lists.find((x) => x.id === view.list) ?? d.lists[0]
  return { name: l.name, color: l.color, list: l }
}

function ViewScreen({ s, view, openTask }: { s: Store; view: View; openTask: (id: string) => void }) {
  const d = s.data
  const info = viewInfo(d, view)
  const [mode, setMode] = useState<'list' | 'board'>('list')
  const [showDone, setShowDone] = useState(false)
  const tasks = sortTasks(d.tasks.filter((t) => inView(t, view)))
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const dateText = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full" style={{ ['--accent' as string]: info.color }}>
      <Page
        title={info.name}
        subtitle={'smart' in view && view.smart === 'myday' ? dateText : `${open.length} open`}
        back
        tinted
        actions={
          <>
            {info.list && <IconButton icon={mode === 'list' ? Columns3 : List} label={mode === 'list' ? 'Board view' : 'List view'} onClick={() => setMode(mode === 'list' ? 'board' : 'list')} />}
            {info.list && <IconButton icon={MoreVertical} label="List options" onClick={() => listMenu(s, info.list!.id, d.lists[0].id === info.list!.id, () => goBack())} />}
          </>
        }
        bottom={<AddBar onAdd={(title) => s.update((x) => addTask(x, title, view).data)} color={info.color} />}
        scroll={mode === 'list'}
      >
        {mode === 'board' && info.list ? (
          <BoardView s={s} listId={info.list.id} openTask={openTask} />
        ) : (
          <div className="px-3 pb-6 pt-3">
            {!tasks.length && <Empty icon={CheckCircle2} title="Nothing to do" text="Add a task below. Tasks you add here are saved straight away." />}
            <div className="flex flex-col gap-2">
              {open.map((t) => <TaskCard key={t.id} s={s} t={t} onOpen={() => openTask(t.id)} showList={'smart' in view} />)}
            </div>
            {done.length > 0 && (
              <>
                <button onClick={() => setShowDone(!showDone)} className="mb-2 mt-4 flex h-9 items-center gap-2 rounded-full bg-hover px-4 text-[14px] font-medium text-ink">
                  Completed {done.length}
                </button>
                {showDone && <div className="flex flex-col gap-2">{done.map((t) => <TaskCard key={t.id} s={s} t={t} onOpen={() => openTask(t.id)} showList={'smart' in view} />)}</div>}
              </>
            )}
          </div>
        )}
      </Page>
    </div>
  )
}

function TaskCard({ s, t, onOpen, showList, compact }: { s: Store; t: Task; onOpen: () => void; showList?: boolean; compact?: boolean }) {
  const due = t.due ? dueLabel(t.due) : null
  const list = s.data.lists.find((l) => l.id === t.listId)
  const doneSteps = t.steps.filter((x) => x.done).length
  const bits = [
    t.myDay === today() && !compact ? 'My Day' : null,
    showList && list ? list.name : null,
    t.steps.length ? `${doneSteps} of ${t.steps.length}` : null,
    t.notes.trim() ? 'Note' : null
  ].filter(Boolean)
  return (
    <div className="flex items-center rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
      <IconButton
        icon={t.done ? CheckCircle2 : Circle}
        label={t.done ? 'Mark as not completed' : 'Mark as completed'}
        onClick={() => {
          if (!t.done) navigator.vibrate?.(10)
          s.update((x) => setDone(x, t.id, !t.done))
        }}
        className={`ml-1 ${t.done ? 'text-[var(--accent)]' : 'text-muted'}`}
      />
      <button onClick={onOpen} className="min-w-0 flex-1 py-3 pr-1 text-left">
        <div className={`text-[15.5px] leading-snug ${t.done ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</div>
        {(due || bits.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
            {due && <span className={`flex items-center gap-1 ${due.overdue && !t.done ? 'font-medium text-red-600' : ''}`}><Calendar size={12} />{due.text}</span>}
            {bits.map((b) => <span key={b}>{b}</span>)}
          </div>
        )}
      </button>
      <IconButton
        icon={Star}
        label={t.important ? 'Remove importance' : 'Mark as important'}
        onClick={() => s.update((x) => patchTask(x, t.id, { important: !t.important }))}
        className={t.important ? 'text-[#db2777] [&_svg]:fill-current' : 'text-muted'}
        size={20}
      />
    </div>
  )
}

function AddBar({ onAdd, color }: { onAdd: (title: string) => void; color: string }) {
  const [v, setV] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const submit = () => {
    if (!v.trim()) return
    onAdd(v)
    setV('')
    input.current?.focus()
  }
  return (
    <div className="phone-bottom shrink-0 border-t border-line bg-surface px-3 py-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-hover px-4">
          <Plus size={20} style={{ color }} />
          <input ref={input} value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a task" enterKeyHint="done" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none" />
        </div>
        {v.trim() && (
          <button type="submit" aria-label="Add task" className="flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <ArrowUp size={22} />
          </button>
        )}
      </form>
    </div>
  )
}

/** The list's columns side by side; swipe between them. */
function BoardView({ s, listId, openTask }: { s: Store; listId: string; openTask: (id: string) => void }) {
  const list = s.data.lists.find((l) => l.id === listId)!
  const tasks = sortTasks(s.data.tasks.filter((t) => t.listId === listId))
  const colOf = (t: Task) => (list.buckets.some((b) => b.id === t.bucket) ? t.bucket : list.buckets[0]?.id)
  return (
    <div className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3">
      {list.buckets.map((b, i) => {
        const items = tasks.filter((t) => colOf(t) === b.id)
        return (
          <div key={b.id} className="flex w-[82%] shrink-0 snap-center flex-col rounded-2xl bg-hover">
            <div className="flex items-center gap-2 px-4 pb-1 pt-3">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{b.name}</span>
              <span className="text-[13px] text-muted">{items.length}</span>
              <IconButton
                icon={MoreVertical}
                label={`${b.name} options`}
                size={18}
                className="h-8 w-8 text-muted"
                onClick={() =>
                  menu(
                    [
                      {
                        label: 'Add task here',
                        icon: Plus,
                        onClick: async () => {
                          const title = await ask('New task', { placeholder: 'Task name', ok: 'Add' })
                          if (!title?.trim()) return
                          s.update((x) => {
                            const r = addTask(x, title, { list: listId })
                            return moveToBucket(r.data, r.task.id, b.id)
                          })
                        }
                      },
                      {
                        label: 'Rename column',
                        icon: Pencil,
                        onClick: async () => {
                          const name = await ask('Rename column', { value: b.name, ok: 'Rename' })
                          if (name !== null) s.update((x) => renameBucket(x, listId, b.id, name))
                        }
                      },
                      {
                        label: 'Add column',
                        icon: Columns3,
                        onClick: async () => {
                          const name = await ask('New column', { placeholder: 'Column name', ok: 'Add' })
                          if (name !== null) s.update((x) => addBucket(x, listId, name))
                        }
                      },
                      {
                        label: 'Delete column',
                        icon: Trash2,
                        danger: true,
                        disabled: list.buckets.length <= 1,
                        onClick: async () => {
                          if (await confirm(`Delete “${b.name}”?`, `Its tasks move to “${list.buckets.find((x) => x.id !== b.id)?.name}”.`)) s.update((x) => deleteBucket(x, listId, b.id))
                        }
                      }
                    ],
                    b.name
                  )
                }
              />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
              {items.map((t) => (
                <div key={t.id}>
                  <TaskCard s={s} t={t} onOpen={() => openTask(t.id)} compact />
                  <div className="flex justify-end gap-1 px-1 pt-1">
                    {i > 0 && <button onClick={() => s.update((x) => moveToBucket(x, t.id, list.buckets[i - 1].id))} className="h-7 rounded-full px-3 text-[12px] text-muted active:bg-active">← {list.buckets[i - 1].name}</button>}
                    {i < list.buckets.length - 1 && <button onClick={() => s.update((x) => moveToBucket(x, t.id, list.buckets[i + 1].id))} className="h-7 rounded-full px-3 text-[12px] text-muted active:bg-active">{list.buckets[i + 1].name} →</button>}
                  </div>
                </div>
              ))}
              {!items.length && <div className="px-3 py-6 text-center text-[13px] text-muted">No tasks</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskDetail({ s, t, onDeleted }: { s: Store; t: Task; onDeleted: () => void }) {
  const list = s.data.lists.find((l) => l.id === t.listId)
  const patch = (p: Partial<Task>) => s.update((x) => patchTask(x, t.id, p))
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes)
  const [step, setStep] = useState('')
  const day = today()
  const tomorrow = (() => {
    const x = new Date()
    x.setDate(x.getDate() + 1)
    return today(x)
  })()

  return (
    <div className="h-full" style={{ ['--accent' as string]: list?.color }}>
      <Page
        title={list?.name ?? 'Task'}
        back
        actions={
          <IconButton
            icon={Trash2}
            label="Delete task"
            onClick={async () => {
              if (!(await confirm(`Delete “${t.title}”?`, 'This can’t be undone.'))) return
              onDeleted()
              s.update((x) => deleteTask(x, t.id))
            }}
          />
        }
      >
        <div className="px-3 pb-10 pt-3">
          <div className="flex items-start rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
            <IconButton icon={t.done ? CheckCircle2 : Circle} label="Completed" onClick={() => s.update((x) => setDone(x, t.id, !t.done))} className={`ml-1 mt-1 ${t.done ? 'text-[var(--accent)]' : 'text-muted'}`} />
            <textarea
              value={title}
              rows={Math.min(4, Math.ceil(title.length / 28) || 1)}
              onChange={(e) => {
                const v = e.target.value.replace(/\n/g, '')
                setTitle(v)
                if (v.trim()) patch({ title: v.trim() })
              }}
              aria-label="Task name"
              className={`min-w-0 flex-1 resize-none bg-transparent py-3.5 text-[19px] font-semibold leading-snug outline-none ${t.done ? 'text-muted line-through' : 'text-ink'}`}
            />
            <IconButton icon={Star} label="Important" onClick={() => patch({ important: !t.important })} className={`mt-1 ${t.important ? 'text-[#db2777] [&_svg]:fill-current' : 'text-muted'}`} />
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
            {t.steps.map((st) => (
              <div key={st.id} className="flex items-center border-b border-line/60">
                <IconButton icon={st.done ? CheckCircle2 : Circle} label="Step done" size={19} onClick={() => patch({ steps: t.steps.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)) })} className={st.done ? 'text-[var(--accent)]' : 'text-muted'} />
                <span className={`min-w-0 flex-1 text-[15px] ${st.done ? 'text-muted line-through' : 'text-ink'}`}>{st.title}</span>
                <IconButton icon={X} label="Remove step" size={18} className="text-muted" onClick={() => patch({ steps: t.steps.filter((x) => x.id !== st.id) })} />
              </div>
            ))}
            <form
              className="flex items-center"
              onSubmit={(e) => {
                e.preventDefault()
                if (!step.trim()) return
                patch({ steps: [...t.steps, { id: uid('st'), title: step.trim(), done: false }] })
                setStep('')
              }}
            >
              <Plus size={20} className="mx-3 text-[var(--accent)]" />
              <input value={step} onChange={(e) => setStep(e.target.value)} placeholder={t.steps.length ? 'Next step' : 'Add step'} enterKeyHint="done" className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none" />
            </form>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
            <Row
              leading={<Sun size={21} className={t.myDay === day ? 'text-[var(--accent)]' : 'text-muted'} />}
              title={t.myDay === day ? 'Added to My Day' : 'Add to My Day'}
              trailing={t.myDay === day ? <X size={18} className="text-muted" /> : undefined}
              onClick={() => patch({ myDay: t.myDay === day ? null : day })}
            />
            <div className="ml-14 h-px bg-line/70" />
            <div className="flex items-center gap-3.5 pl-4 pr-2">
              <Calendar size={21} className={t.due ? 'text-[var(--accent)]' : 'text-muted'} />
              <div className="min-w-0 flex-1 py-2">
                <div className="text-[15.5px] text-ink">{t.due ? `Due ${dueLabel(t.due).text}` : 'Add due date'}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip on={t.due === day} onClick={() => patch({ due: day })}>Today</Chip>
                  <Chip on={t.due === tomorrow} onClick={() => patch({ due: tomorrow })}>Tomorrow</Chip>
                  <label className="relative">
                    <Chip on={!!t.due && t.due !== day && t.due !== tomorrow}>Pick a date</Chip>
                    <input type="date" value={t.due ?? ''} onChange={(e) => patch({ due: e.target.value || null })} className="absolute inset-0 opacity-0" aria-label="Due date" />
                  </label>
                </div>
              </div>
              {t.due && <IconButton icon={X} label="Remove due date" size={18} className="text-muted" onClick={() => patch({ due: null })} />}
            </div>
            {list && list.buckets.length > 1 && (
              <>
                <div className="ml-14 h-px bg-line/70" />
                <div className="px-4 py-3">
                  <div className="mb-2 text-[13px] text-muted">Column</div>
                  <Segmented value={t.bucket ?? list.buckets[0].id} options={list.buckets.map((b) => ({ value: b.id, label: b.name }))} onChange={(b) => s.update((x) => moveToBucket(x, t.id, b))} />
                </div>
              </>
            )}
          </div>

          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              patch({ notes: e.target.value })
            }}
            placeholder="Add note"
            rows={5}
            className="mt-3 w-full rounded-2xl bg-surface p-4 text-[15px] text-ink shadow-sm outline-none ring-1 ring-line/60"
          />
          <div className="mt-3 text-center text-[12.5px] text-muted">
            Created {new Date(t.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            {t.completed && ` · Completed ${new Date(t.completed).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </div>
        </div>
      </Page>
    </div>
  )
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: string }) {
  return (
    <span
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] ${on ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-line text-ink'}`}
    >
      {children}
    </span>
  )
}
