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

/** The bear does a little catch when a download button is pressed. */
export function initCatch(): void {
  const bear = document.querySelector<HTMLElement>('[data-catch]')
  if (!bear) return
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('a[data-download]')) return
    bear.classList.remove('is-catching')
    void bear.offsetWidth
    bear.classList.add('is-catching')
  })
}
