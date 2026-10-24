// Must stay the first import: it sets the edition before the app modules load.
import './edition'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { APPS } from '@bear/core'
import { webBridge } from './bridge'
import './styles.css'

window.bear = webBridge

// Mail talks IMAP/SMTP from Electron's Node process; browsers can't open those connections.
const mail = APPS.find((a) => a.id === 'mail')
if (mail) mail.ready = false

// Notes, Tasks, Board and Sites save by themselves, so Ctrl+S there must not open the browser's
// "Save page" dialog. Write, Sheets and Slides still see the key and save as usual.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault()
})

// After a new version is deployed, a tab that's been open a while can ask for an app's code by its
// old name, which no longer exists. Reload once to pick up the new version. This only happens while
// an app is being opened, so there's no unsaved work to lose.
window.addEventListener('vite:preloadError', (e) => {
  const last = Number(sessionStorage.getItem('bear-reloaded') ?? 0)
  if (Date.now() - last < 30_000) return
  sessionStorage.setItem('bear-reloaded', String(Date.now()))
  e.preventDefault()
  location.reload()
})

// Instant repeat visits, offline use and "Install app" (see sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'))
}

// Phones get the phone layout (the Android app's UI); tablets and computers get the desktop one.
// Decided once at start-up, so turning the phone sideways doesn't swap the UI mid-edit.
const phone = window.matchMedia('(max-width: 640px), (pointer: coarse) and (max-height: 640px)').matches

const root = createRoot(document.getElementById('root')!)
const show = (ui: ReactNode) => root.render(<StrictMode>{ui}</StrictMode>)
if (phone) void import('./phone').then(({ PhoneShell }) => show(<PhoneShell />))
else void import('../../desktop/src/renderer/App').then(({ App }) => show(<App />))
