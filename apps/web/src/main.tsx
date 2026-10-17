import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APPS } from '@bear/core'
import { webBridge } from './bridge'
import { App } from '../../desktop/src/renderer/App'
import '../../desktop/src/renderer/styles.css'

window.bear = webBridge

// Mail talks IMAP/SMTP from Electron's Node process; browsers can't open those connections.
const mail = APPS.find((a) => a.id === 'mail')
if (mail) mail.ready = false

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
