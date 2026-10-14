import { describe, expect, it } from 'vitest'
import {
  addBucket, addList, addTask, deleteBucket, deleteList, dueLabel, inView, initialTasks, moveToBucket, setDone,
  sortTasks, upgradeTasks, type TasksData
} from './model'

const DAY = '2026-10-14'

describe('tasks', () => {
  it('adds tasks with properties that match the view they were added in', () => {
    let d = initialTasks()
    d = addTask(d, 'Plain', { list: 'tasks' }, DAY).data
    d = addTask(d, 'Today thing', { smart: 'myday' }, DAY).data
    d = addTask(d, 'Big deal', { smart: 'important' }, DAY).data
    d = addTask(d, 'Dated', { smart: 'planned' }, DAY).data
    const by = (title: string) => d.tasks.find((t) => t.title === title)!
    expect(inView(by('Today thing'), { smart: 'myday' }, DAY)).toBe(true)
    expect(inView(by('Today thing'), { smart: 'myday' }, '2026-10-15')).toBe(false) // My Day resets daily
    expect(by('Big deal').important).toBe(true)
    expect(by('Dated').due).toBe(DAY)
    expect(d.tasks.every((t) => t.listId === 'tasks')).toBe(true)
  })

  it('sorts open before done, then by due date and importance', () => {
    let d = initialTasks()
    for (const title of ['a', 'b', 'c', 'd']) d = addTask(d, title, { list: 'tasks' }).data
    const id = (t: string) => d.tasks.find((x) => x.title === t)!.id
    d = { ...d, tasks: d.tasks.map((t) => (t.title === 'b' ? { ...t, due: '2026-01-02' } : t.title === 'c' ? { ...t, due: '2026-01-01' } : t.title === 'd' ? { ...t, important: true } : t)) }
    d = setDone(d, id('a'), true)
    expect(sortTasks(d.tasks).map((t) => t.title)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('keeps the board and completion in sync', () => {
    let d: TasksData = initialTasks()
    d = addTask(d, 'card', { list: 'tasks' }).data
    const t = d.tasks[0]
    const [todo, , done] = d.lists[0].buckets
    expect(t.bucket).toBe(todo.id)
    d = moveToBucket(d, t.id, done.id)
    expect(d.tasks[0].done).toBe(true)
    d = setDone(d, t.id, false)
    expect(d.tasks[0].bucket).toBe(todo.id)
  })

  it('manages lists and columns', () => {
    let d = initialTasks()
    const { data, list } = addList(d, 'Groceries')
    d = addTask(data, 'Milk', { list: list.id }).data
    d = addBucket(d, list.id, 'Waiting')
    expect(d.lists[1].buckets.map((b) => b.name)).toEqual(['To do', 'In progress', 'Waiting', 'Done'])
    const todo = d.lists[1].buckets[0].id
    d = deleteBucket(d, list.id, todo)
    expect(d.tasks[0].bucket).toBe(d.lists[1].buckets[0].id) // card moved to a remaining column
    expect(deleteList(d, 'tasks')).toBe(d) // the default list stays
    d = deleteList(d, list.id)
    expect(d.lists).toHaveLength(1)
    expect(d.tasks).toHaveLength(0)
  })

  it('labels due dates', () => {
    expect(dueLabel('2026-10-14', DAY)).toEqual({ text: 'Today', overdue: false })
    expect(dueLabel('2026-10-15', DAY).text).toBe('Tomorrow')
    expect(dueLabel('2026-10-01', DAY).overdue).toBe(true)
  })

  it('rejects unrecognisable stored data', () => {
    expect(upgradeTasks({ nonsense: true })).toBeNull()
    expect(upgradeTasks(initialTasks())).not.toBeNull()
  })
})
