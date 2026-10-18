import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { icons } from 'lucide-react'

/** Every icon name in the open-source Lucide set (ISC licence), e.g. "Star", "ChartBar". */
export const ICON_NAMES = Object.keys(icons).sort()

/** Words to search by: "ChartBarBig" -> "chart bar big". */
export const iconWords = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()

/** An icon as an SVG data URL, drawn in `color`. */
export function iconSrc(name: string, color: string): string {
  const Icon = icons[name as keyof typeof icons]
  if (!Icon) throw new Error(`No icon called ${name}`)
  const svg = renderToStaticMarkup(createElement(Icon, { color, size: 256, strokeWidth: 1.75 }))
  const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(withNs)))}`
}
