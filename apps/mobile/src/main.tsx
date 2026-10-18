import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APPS } from '@bear/core'
import { androidBridge } from './bridge'
import { App } from '../../desktop/src/renderer/App'
import '../../desktop/src/renderer/styles.css'

window.bear = androidBridge

// Mail talks IMAP/SMTP from Electron's Node process, which Android doesn't have.
const mail = APPS.find((a) => a.id === 'mail')
if (mail) mail.ready = false

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
