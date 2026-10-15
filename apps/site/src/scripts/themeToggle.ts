import { resolveTheme, saveTheme, type Theme } from '../lib/themePref'

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function currentTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme ?? null)
}

function syncToggles(value: Theme): void {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((btn) => {
    // Pressed means daylight is on. The visible label ("Light theme" / "Dark theme") is chosen by CSS from html[data-theme].
    btn.setAttribute('aria-pressed', String(value === 'light'))
  })
}

/** Set `<html data-theme>`, persist the choice and sync every toggle button. */
export function setTheme(value: Theme): void {
  document.documentElement.dataset.theme = value
  saveTheme(storage(), value)
  syncToggles(value)
}

/** Wire every `[data-theme-toggle]` button and sync it to the current theme. */
export function bindThemeToggles(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'))
  })
  syncToggles(currentTheme())
}
