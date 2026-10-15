import { saveMotion, type Motion } from '../lib/motionPref'

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function syncToggles(value: Motion): void {
  document.querySelectorAll<HTMLElement>('[data-motion-toggle]').forEach((btn) => {
    // The visible label is chosen by CSS from html[data-motion].
    btn.setAttribute('aria-pressed', String(value === 'on'))
  })
}

function currentMotion(): Motion {
  return document.documentElement.dataset.motion === 'off' ? 'off' : 'on'
}

/** Set `<html data-motion>`, persist the choice and sync every toggle button. */
export function setMotion(value: Motion): void {
  document.documentElement.dataset.motion = value
  saveMotion(storage(), value)
  syncToggles(value)
}

/** Wire every `[data-motion-toggle]` button and sync it to the current state. */
export function bindMotionToggles(): void {
  document.querySelectorAll<HTMLElement>('[data-motion-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => setMotion(currentMotion() === 'on' ? 'off' : 'on'))
  })
  syncToggles(currentMotion())
}
