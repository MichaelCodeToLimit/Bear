import { detectOS, pickBest, formatSize, type DownloadFile } from '../lib/releases'

/** Fill the "Best for you" slot with the file that matches the visitor's system. Leaves it hidden if nothing matches. */
export function initBestForYou(): void {
  const slot = document.querySelector<HTMLElement>('[data-best]')
  const data = document.getElementById('downloads')
  if (!slot || !data?.textContent) return
  try {
    const files = JSON.parse(data.textContent) as DownloadFile[]
    const best = pickBest(files, detectOS(navigator.userAgent))
    if (!best) return
    const link = slot.querySelector<HTMLAnchorElement>('[data-best-link]')
    const name = slot.querySelector<HTMLElement>('[data-best-name]')
    const meta = slot.querySelector<HTMLElement>('[data-best-meta]')
    if (!link || !name || !meta) return
    link.href = best.url
    name.textContent = best.name
    meta.textContent = `${best.label} · ${formatSize(best.size)}`
    slot.hidden = false
    document.querySelectorAll(`[data-file="${CSS.escape(best.name)}"]`).forEach((el) => el.classList.add('is-best'))
  } catch {
    // Malformed data: leave the slot hidden; every file is still listed below.
  }
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
