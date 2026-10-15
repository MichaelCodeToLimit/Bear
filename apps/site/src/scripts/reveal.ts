/** Add `is-visible` to `[data-reveal]` elements as they scroll into view (staggered by `data-reveal-delay` ms). */
export function initReveal(root: ParentNode = document): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
  const show = (el: HTMLElement): void => {
    const delay = Number(el.dataset.revealDelay)
    if (delay > 0) el.style.transitionDelay = `calc(${delay}ms * var(--motion-speed, 1))`
    el.classList.add('is-visible')
  }
  if (typeof IntersectionObserver === 'undefined') {
    items.forEach(show)
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        show(entry.target as HTMLElement)
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.15 }
  )
  items.forEach((el) => observer.observe(el))
}
