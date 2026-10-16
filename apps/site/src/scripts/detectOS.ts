import { detectOS } from '../lib/releases'

/** Mark the card that matches the visitor's system: reveal its "Your device" badge and give it the accent ring. */
export function initYourDevice(): void {
  const os = detectOS(navigator.userAgent)
  if (!os) return
  const card = document.querySelector<HTMLElement>(`[data-os-group="${os}"]`)
  if (!card) return
  card.setAttribute('data-yours', '')
  card.querySelector<HTMLElement>('[data-your-device]')?.removeAttribute('hidden')
}
