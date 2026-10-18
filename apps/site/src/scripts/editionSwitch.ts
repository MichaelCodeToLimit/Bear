import type { Edition } from '@bear/core'
import { readEdition, saveEdition } from '../lib/editionPref'

function localStore(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The Download page's edition switcher: a radiogroup that shows one of the three server-rendered panels.
 * Without this script the Everything panel shows and the switcher stays hidden (see PlatformCards.astro).
 */
export function initEditionSwitch(): void {
  const group = document.querySelector<HTMLElement>('[data-edition-switch]')
  if (!group) return
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[data-edition-choice]'))
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-edition-panel]'))
  const storage = localStore()

  const show = (edition: Edition, focus = false) => {
    for (const r of radios) {
      const on = r.dataset.editionChoice === edition
      r.setAttribute('aria-checked', String(on))
      r.tabIndex = on ? 0 : -1
      if (on && focus) r.focus()
    }
    for (const p of panels) p.hidden = p.dataset.editionPanel !== edition
  }
  const choose = (edition: Edition, focus = false) => {
    show(edition, focus)
    saveEdition(storage, edition)
  }

  show(readEdition(storage))

  group.addEventListener('click', (e) => {
    const r = (e.target as Element).closest<HTMLElement>('[data-edition-choice]')
    if (r) choose(r.dataset.editionChoice as Edition)
  })
  group.addEventListener('keydown', (e) => {
    const i = radios.findIndex((r) => r === document.activeElement)
    if (i < 0) return
    const last = radios.length - 1
    const step: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last }
    if (!(e.key in step)) return
    e.preventDefault()
    const next = (step[e.key] + radios.length) % radios.length
    choose(radios[next].dataset.editionChoice as Edition, true)
  })
}
