export interface Step {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  listId: string
  title: string
  done: boolean
  important: boolean
  /** The day (yyyy-mm-dd) it was added to My Day; it only counts on that day. */
  myDay: string | null
  /** yyyy-mm-dd */
  due: string | null
  notes: string
  steps: Step[]
  /** Board column within its list. */
  bucket: string | null
  created: number
  completed: number | null
}

export interface Bucket {
  id: string
  name: string
}

export interface TaskList {
  id: string
  name: string
  color: string
  buckets: Bucket[]
}

export interface TasksData {
  version: 1
  lists: TaskList[]
  tasks: Task[]
}

/** Built-in views across all lists. */
export type SmartView = 'myday' | 'important' | 'planned' | 'all'
export type View = { smart: SmartView } | { list: string }

export const LIST_COLORS = ['#7c3aed', '#0f766e', '#be123c', '#b45309', '#1d4ed8', '#4d7c0f', '#db2777', '#475569']

let n = 0
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`

export function today(now = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function defaultBuckets(): Bucket[] {
  return [
    { id: uid('b'), name: 'To do' },
    { id: uid('b'), name: 'In progress' },
    { id: uid('b'), name: 'Done' }
  ]
}

export function initialTasks(): TasksData {
  return { version: 1, lists: [{ id: 'tasks', name: 'Tasks', color: LIST_COLORS[0], buckets: defaultBuckets() }], tasks: [] }
}

/** Validate stored data loosely; anything unrecognisable starts fresh. */
export function upgradeTasks(raw: unknown): TasksData | null {
  const d = raw as Partial<TasksData> | null
  if (!d || !Array.isArray(d.lists) || !Array.isArray(d.tasks) || !d.lists.length) return null
  return { version: 1, lists: d.lists, tasks: d.tasks }
}

export function inView(t: Task, view: View, day = today()): boolean {
  if ('list' in view) return t.listId === view.list
  switch (view.smart) {
    case 'myday': return t.myDay === day
    case 'important': return t.important
    case 'planned': return !!t.due
    case 'all': return true
  }
}

/** Open tasks first; then by due date (soonest first), important first, then newest. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done && b.done) return (b.completed ?? 0) - (a.completed ?? 0)
    if (a.due !== b.due) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1
    if (a.important !== b.important) return a.important ? -1 : 1
    return b.created - a.created
  })
}

export function addTask(d: TasksData, title: string, view: View, day = today()): { data: TasksData; task: Task } {
  const listId = 'list' in view ? view.list : d.lists[0].id
  const list = d.lists.find((l) => l.id === listId)!
  const task: Task = {
    id: uid('t'), listId, title: title.trim(), done: false,
    important: 'smart' in view && view.smart === 'important',
    myDay: 'smart' in view && view.smart === 'myday' ? day : null,
    due: 'smart' in view && view.smart === 'planned' ? day : null,
    notes: '', steps: [], bucket: list.buckets[0]?.id ?? null, created: Date.now(), completed: null
  }
  return { data: { ...d, tasks: [...d.tasks, task] }, task }
}

export function patchTask(d: TasksData, id: string, patch: Partial<Task>): TasksData {
  return { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
}

/** Completing a task also moves it to the list's last ("Done") column, and back again. */
export function setDone(d: TasksData, id: string, done: boolean): TasksData {
  const task = d.tasks.find((t) => t.id === id)
  if (!task) return d
  const buckets = d.lists.find((l) => l.id === task.listId)?.buckets ?? []
  const last = buckets[buckets.length - 1]?.id ?? null
  const bucket = done ? last : task.bucket === last ? buckets[0]?.id ?? null : task.bucket
  return patchTask(d, id, { done, completed: done ? Date.now() : null, bucket })
}

/** Moving a card into the last column completes it; out of it reopens it. */
export function moveToBucket(d: TasksData, id: string, bucket: string): TasksData {
  const task = d.tasks.find((t) => t.id === id)
  if (!task) return d
  const buckets = d.lists.find((l) => l.id === task.listId)?.buckets ?? []
  const done = bucket === buckets[buckets.length - 1]?.id
  return patchTask(d, id, { bucket, done, completed: done ? task.completed ?? Date.now() : null })
}

export function deleteTask(d: TasksData, id: string): TasksData {
  return { ...d, tasks: d.tasks.filter((t) => t.id !== id) }
}

export function addList(d: TasksData, name: string): { data: TasksData; list: TaskList } {
  const list: TaskList = { id: uid('l'), name: name.trim() || 'Untitled list', color: LIST_COLORS[d.lists.length % LIST_COLORS.length], buckets: defaultBuckets() }
  return { data: { ...d, lists: [...d.lists, list] }, list }
}

export function renameList(d: TasksData, id: string, name: string): TasksData {
  return { ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l)) }
}

/** Deleting a list deletes its tasks. The first list can't be deleted. */
export function deleteList(d: TasksData, id: string): TasksData {
  if (d.lists[0]?.id === id) return d
  return { ...d, lists: d.lists.filter((l) => l.id !== id), tasks: d.tasks.filter((t) => t.listId !== id) }
}

export function addBucket(d: TasksData, listId: string, name: string): TasksData {
  return {
    ...d,
    lists: d.lists.map((l) => {
      if (l.id !== listId) return l
      // New columns go before the final "Done" column.
      const b = [...l.buckets]
      b.splice(Math.max(0, b.length - 1), 0, { id: uid('b'), name: name.trim() || 'New column' })
      return { ...l, buckets: b }
    })
  }
}

export function renameBucket(d: TasksData, listId: string, bucketId: string, name: string): TasksData {
  return {
    ...d,
    lists: d.lists.map((l) => (l.id === listId ? { ...l, buckets: l.buckets.map((b) => (b.id === bucketId ? { ...b, name: name.trim() || b.name } : b)) } : l))
  }
}

export function deleteBucket(d: TasksData, listId: string, bucketId: string): TasksData {
  const list = d.lists.find((l) => l.id === listId)
  if (!list || list.buckets.length <= 1) return d
  const fallback = list.buckets.find((b) => b.id !== bucketId)!.id
  return {
    lists: d.lists.map((l) => (l.id === listId ? { ...l, buckets: l.buckets.filter((b) => b.id !== bucketId) } : l)),
    tasks: d.tasks.map((t) => (t.listId === listId && t.bucket === bucketId ? { ...t, bucket: fallback } : t)),
    version: 1
  }
}

/** "Today", "Tomorrow", "Mon, 3 Nov" — and whether it's overdue. */
export function dueLabel(due: string, day = today()): { text: string; overdue: boolean } {
  const [y, m, dd] = due.split('-').map(Number)
  const date = new Date(y, m - 1, dd)
  const [ty, tm, td] = day.split('-').map(Number)
  const diff = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000)
  const text = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return { text, overdue: diff < 0 }
}
