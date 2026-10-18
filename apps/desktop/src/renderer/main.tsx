import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { parseEdition, setEdition } from '@bear/core'
import { App } from './App'
import './styles.css'

setEdition(parseEdition(__BEAR_EDITION__))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
