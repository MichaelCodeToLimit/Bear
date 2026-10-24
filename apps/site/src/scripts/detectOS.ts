import { detectOS } from '../lib/releases'

/** Mark the cards that match the visitor's system (one per edition panel): reveal the "Your device" badge and give the accent ring. */
export function initYourDevice(): void {
  const os = detectOS(navigator.userAgent)
  if (!os) return
  for (const card of document.querySelectorAll<HTMLElement>(`[data-os-group="${os}"]`)) {
    card.setAttribute('data-yours', '')
    card.querySelector<HTMLElement>('[data-your-device]')?.removeAttribute('hidden')
  }
}
