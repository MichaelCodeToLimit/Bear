/** Registry of every app in the suite. `ready` apps can be launched; the rest show as "coming soon". */
export type AppId =
  | 'write' | 'sheets' | 'slides' | 'notes' | 'mail' | 'chat'
  | 'insights' | 'sites' | 'drive' | 'forms' | 'board' | 'tasks'
  | 'photo' | 'vector' | 'pdf' | 'video' | 'motion' | 'audio' | 'layout'

/** Which half of Bear an app belongs to. */
export type Suite = 'office' | 'studio'

export interface AppInfo {
  id: AppId
  name: string
  tagline: string
  color: string
  extensions: string[]
  ready: boolean
  suite: Suite
}

export const APPS: AppInfo[] = [
  { id: 'write', name: 'Write', tagline: 'Documents', color: '#0f766e', extensions: ['docx', 'txt', 'html', 'htm', 'md'], ready: true, suite: 'office' },
  { id: 'sheets', name: 'Sheets', tagline: 'Spreadsheets', color: '#4d7c0f', extensions: ['xlsx', 'csv'], ready: true, suite: 'office' },
  { id: 'slides', name: 'Slides', tagline: 'Presentations', color: '#be123c', extensions: ['pptx'], ready: true, suite: 'office' },
  { id: 'notes', name: 'Notes', tagline: 'Notebooks', color: '#7e22ce', extensions: [], ready: true, suite: 'office' },
  { id: 'mail', name: 'Mail', tagline: 'Email', color: '#0369a1', extensions: [], ready: true, suite: 'office' },
  { id: 'chat', name: 'Chat', tagline: 'Teams & calls', color: '#4338ca', extensions: [], ready: false, suite: 'office' },
  { id: 'insights', name: 'Insights', tagline: 'Data dashboards', color: '#b45309', extensions: [], ready: false, suite: 'office' },
  { id: 'sites', name: 'Sites', tagline: 'Team sites', color: '#0e7490', extensions: [], ready: true, suite: 'office' },
  { id: 'drive', name: 'Drive', tagline: 'Files & sync', color: '#1d4ed8', extensions: [], ready: false, suite: 'office' },
  { id: 'forms', name: 'Forms', tagline: 'Surveys & quizzes', color: '#047857', extensions: [], ready: false, suite: 'office' },
  { id: 'board', name: 'Board', tagline: 'Whiteboard', color: '#c2410c', extensions: [], ready: true, suite: 'office' },
  { id: 'tasks', name: 'Tasks', tagline: 'To-dos & plans', color: '#2563eb', extensions: [], ready: true, suite: 'office' },
  { id: 'photo', name: 'Photo', tagline: 'Photo editing', color: '#9333ea', extensions: ['bearphoto', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'], ready: true, suite: 'studio' },
  { id: 'vector', name: 'Vector', tagline: 'Vector graphics', color: '#db2777', extensions: [], ready: false, suite: 'studio' },
  { id: 'pdf', name: 'PDF', tagline: 'PDF documents', color: '#dc2626', extensions: [], ready: false, suite: 'studio' },
  { id: 'video', name: 'Video', tagline: 'Video editing', color: '#ea580c', extensions: [], ready: false, suite: 'studio' },
  { id: 'motion', name: 'Motion', tagline: 'Motion graphics', color: '#d97706', extensions: [], ready: false, suite: 'studio' },
  { id: 'audio', name: 'Audio', tagline: 'Audio editing', color: '#0d9488', extensions: [], ready: false, suite: 'studio' },
  { id: 'layout', name: 'Layout', tagline: 'Page layout', color: '#65a30d', extensions: [], ready: false, suite: 'studio' }
]

export function getApp(id: AppId): AppInfo {
  const app = APPS.find((a) => a.id === id)
  if (!app) throw new Error(`Unknown app: ${id}`)
  return app
}
