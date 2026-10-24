// Must stay the first import: it sets the edition before the app modules load.
import './edition'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { androidBridge } from './bridge'
import { PhoneShell } from './phone/Shell'
import '../../desktop/src/renderer/styles.css'
import './phone/phone.css'

window.bear = androidBridge

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhoneShell />
  </StrictMode>
)
