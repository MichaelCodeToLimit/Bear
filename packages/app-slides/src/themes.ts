export interface Theme {
  id: string
  name: string
  /** CSS background for slides (a colour or gradient). */
  background: string
  /** Solid colour used where gradients aren't supported (.pptx export). */
  backgroundSolid: string
  title: string
  text: string
  accents: string[]
  headingFont: string
  bodyFont: string
}

export const THEMES: Theme[] = [
  {
    id: 'paper', name: 'Paper', background: '#ffffff', backgroundSolid: '#ffffff',
    title: '#1f2937', text: '#374151', accents: ['#0f766e', '#d97706', '#4f46e5', '#be123c'],
    headingFont: 'Segoe UI Semibold', bodyFont: 'Segoe UI'
  },
  {
    id: 'ember', name: 'Ember', background: 'linear-gradient(135deg, #2b1a10 0%, #5c3522 100%)', backgroundSolid: '#3b2416',
    title: '#fde7b0', text: '#f3e5d8', accents: ['#e8834a', '#f9c784', '#c2410c', '#fbbf24'],
    headingFont: 'Georgia', bodyFont: 'Segoe UI'
  },
  {
    id: 'ocean', name: 'Ocean', background: 'linear-gradient(160deg, #0c4a6e 0%, #155e75 100%)', backgroundSolid: '#0e5470',
    title: '#ffffff', text: '#e0f2fe', accents: ['#38bdf8', '#5eead4', '#fbbf24', '#f472b6'],
    headingFont: 'Segoe UI Semibold', bodyFont: 'Segoe UI'
  },
  {
    id: 'forest', name: 'Forest', background: '#f3f1e8', backgroundSolid: '#f3f1e8',
    title: '#14532d', text: '#1c3326', accents: ['#15803d', '#a16207', '#0f766e', '#9a3412'],
    headingFont: 'Cambria', bodyFont: 'Calibri'
  },
  {
    id: 'midnight', name: 'Midnight', background: '#111827', backgroundSolid: '#111827',
    title: '#f9fafb', text: '#d1d5db', accents: ['#a78bfa', '#34d399', '#f472b6', '#60a5fa'],
    headingFont: 'Segoe UI Semibold', bodyFont: 'Segoe UI'
  },
  {
    id: 'blush', name: 'Blush', background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)', backgroundSolid: '#fff1f2',
    title: '#881337', text: '#4c0519', accents: ['#e11d48', '#db2777', '#9333ea', '#f59e0b'],
    headingFont: 'Georgia', bodyFont: 'Segoe UI'
  }
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function fontFamily(theme: Theme, font: string | undefined, placeholder?: string): string {
  if (font && font !== 'heading' && font !== 'body') return font
  const heading = font === 'heading' || (!font && placeholder === 'title')
  return heading ? theme.headingFont : theme.bodyFont
}
