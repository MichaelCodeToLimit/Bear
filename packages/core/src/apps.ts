/** Registry of every app in the suite. `ready` apps can be launched; the rest show as "coming soon". */
export type AppId =
  | 'write' | 'sheets' | 'slides' | 'notes' | 'mail' | 'chat'
  | 'insights' | 'sites' | 'drive' | 'forms' | 'board' | 'tasks'

export interface AppInfo {
  id: AppId
  name: string
  tagline: string
  color: string
  extensions: string[]
  ready: boolean
}

export const APPS: AppInfo[] = [
  { id: 'write', name: 'Write', tagline: 'Documents', color: '#0f766e', extensions: ['docx', 'txt', 'html', 'htm', 'md'], ready: true },
  { id: 'sheets', name: 'Sheets', tagline: 'Spreadsheets', color: '#4d7c0f', extensions: ['xlsx', 'csv'], ready: true },
  { id: 'slides', name: 'Slides', tagline: 'Presentations', color: '#be123c', extensions: ['pptx'], ready: true },
  { id: 'notes', name: 'Notes', tagline: 'Notebooks', color: '#7e22ce', extensions: [], ready: true },
  { id: 'mail', name: 'Mail', tagline: 'Email', color: '#0369a1', extensions: [], ready: true },
  { id: 'chat', name: 'Chat', tagline: 'Teams & calls', color: '#4338ca', extensions: [], ready: false },
  { id: 'insights', name: 'Insights', tagline: 'Data dashboards', color: '#b45309', extensions: [], ready: false },
  { id: 'sites', name: 'Sites', tagline: 'Team sites', color: '#0e7490', extensions: [], ready: true },
  { id: 'drive', name: 'Drive', tagline: 'Files & sync', color: '#1d4ed8', extensions: [], ready: false },
  { id: 'forms', name: 'Forms', tagline: 'Surveys & quizzes', color: '#047857', extensions: [], ready: false },
  { id: 'board', name: 'Board', tagline: 'Whiteboard', color: '#c2410c', extensions: [], ready: true },
  { id: 'tasks', name: 'Tasks', tagline: 'To-dos & plans', color: '#2563eb', extensions: [], ready: true }
]

export function getApp(id: AppId): AppInfo {
  const app = APPS.find((a) => a.id === id)
  if (!app) throw new Error(`Unknown app: ${id}`)
  return app
}
