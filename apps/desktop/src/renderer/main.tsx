import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EDITIONS, setEdition } from '@bear/core'
import { buildEdition } from '../edition'
import { App } from './App'
import './styles.css'

setEdition(buildEdition())
document.title = EDITIONS[buildEdition()].productName

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
