import type { AppId, AppInfo } from '@bear/core'
import { SITE_APPS as APPS } from './officeApps'

export interface TourApp extends AppInfo {
  features: string[]
  docsSlug: string | null
}

/** Short feature lines for each ready app. Apps without an entry fall back to their tagline. */
export const FEATURES: Partial<Record<AppId, string[]>> = {
  write: [
    'Ribbon with fonts, styles, lists and tables',
    'Pictures, links, page breaks and find & replace',
    'Page view with Letter or A4, margins and focus mode',
    'Opens and saves .docx, plus HTML and text',
    'AutoSave, Export to PDF and templates'
  ],
  sheets: [
    'Fast grid with 100,000 rows and freeze panes',
    'Common spreadsheet functions and cross-sheet references',
    'Fill handle, sorting, AutoSum and number formats',
    'Column, bar, line and pie charts',
    'Opens and saves .xlsx and .csv'
  ],
  slides: [
    'Slide editor with thumbnails and layouts',
    'Text boxes, shapes and pictures with snap guides',
    'Six themes and per-slide backgrounds',
    'Full-screen slide show with a slide sorter',
    'Opens and saves .pptx'
  ],
  notes: [
    'Notebooks, coloured sections and pages',
    'Rich text with checklists, tables and pictures',
    'Search across every notebook',
    'Move pages between sections',
    'Saves automatically'
  ],
  mail: [
    'Connect any IMAP account or sign in with your email provider',
    'Folders with unread counts, and search',
    'Reply, reply all and forward, with attachments',
    'Archive, delete and flag messages',
    'Remote images blocked until you allow them'
  ],
  sites: [
    'Team home page with news and quick links',
    'Pages and news posts',
    'Document library linked to any folder',
    'Recent documents and a linked Tasks list'
  ],
  board: [
    'Gallery of whiteboards',
    'Pens, shapes, arrows and text',
    'Sticky-note style shapes',
    'Export to PNG or SVG',
    'Fonts ship inside the app'
  ],
  tasks: [
    'My Day, Important, Planned and All tasks',
    'Your own lists',
    'Steps, due dates, notes and importance',
    'Board view with drag-and-drop columns',
    'Undo after delete'
  ],
  photo: [
    'Layers with blend modes and opacity',
    'Marquee, lasso and magic wand selections',
    'Brush, eraser, fill, gradient, shapes and text',
    'Levels, curves, hue/saturation, blurs and sharpen',
    'Opens .psd, PNG, JPG and WebP; saves .bearphoto and .psd'
  ]
}

/** The tour entry for every app, in registry order. `ready` decides the docs link. */
export function tourApps(apps: AppInfo[] = APPS): TourApp[] {
  return apps.map((app) => ({
    ...app,
    features: FEATURES[app.id] ?? [app.tagline],
    docsSlug: app.ready ? `apps/${app.id}` : null
  }))
}
