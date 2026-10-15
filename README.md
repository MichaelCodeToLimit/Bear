# Bear

A free, open-source desktop productivity suite. Documents, spreadsheets, slides, notes, mail, chat and dashboards, all in one app, with no subscription.

> Bear is an independent project. It is not affiliated with or endorsed by Microsoft. It reads and writes common Office file formats (.docx, .xlsx and .pptx) for compatibility.

## Status

| App | What it replaces | Status |
|---|---|---|
| **Write** | Word processor | ✅ MVP |
| **Sheets** | Spreadsheets | ✅ MVP |
| **Slides** | Presentations | ✅ MVP |
| **Notes** | Notebooks | ✅ MVP |
| Mail | Email & calendar | Planned |
| Chat | Team chat & calls | Planned |
| Insights | Data dashboards | Planned |
| **Sites** | Team sites | ✅ MVP (on this computer; sharing needs the coming server) |
| Drive | File sync | Planned |
| **Tasks** | To-dos & plans | ✅ MVP |
| **Board** | Whiteboard | ✅ MVP |
| Forms | Surveys & quizzes | Planned |

### Write features

- Ribbon UI (Home / Insert / Layout / View, plus a contextual Table tab)
- Fonts, sizes, bold/italic/underline/strike, sub/superscript, text colour, highlight
- Styles (headings, quote, code), bullets and numbering with nesting, alignment
- Tables with a Word-style size picker and Insert table dialog, styles (grid, accent header, banded, minimal), cell shading, vertical alignment, header row/column, merge/split, distribute columns
- Pictures in any common format (insert, paste, drag-drop; large photos scaled down), links, page breaks, horizontal lines
- Find & replace (Ctrl+F / Ctrl+H)
- Page view with Letter/A4, portrait/landscape, margins, zoom, focus mode, light/dark theme
- Open **.docx**, .html, .txt, .md. Save as **.docx**, .html, .txt
- AutoSave, Export to PDF, Print, recent files, templates (letter, resume, report)
- Unsaved-changes prompt on close

### Sheets features

- Fast canvas grid (100,000 rows × 702 columns) with freeze panes, merged cells, text overflow and wrap
- Excel-compatible functions (SUM, IF, VLOOKUP, XLOOKUP, MATCH, SUMIFS, MAX, TEXT, PMT, …; every common function is covered by tests), cross-sheet references, INDIRECT, error values and cycle detection
- Fill handle (series, "Item 1 → Item 2", formula copying), copy/cut/paste with relative references, sort, AutoSum
- Number formats (currency, percent, dates, decimals) with auto-detection as you type (`15%`, `$4.50`, `2026-10-14`)
- Insert/delete rows and columns (formulas adjust), resize and auto-fit columns, multiple sheets (add, rename, reorder)
- Column, bar, line and pie charts
- Open and save **.xlsx** (values, formulas, styles, widths, merges, freeze panes; charts are kept for Bear) and .csv
- Print / Export to PDF, templates (budget, invoice, task tracker), status-bar sum/average/count

### Slides features

- Slide editor with thumbnails (drag to reorder), layouts (title, title + content, section, two content, title only, blank), speaker notes
- Text boxes, shapes (rectangle, rounded, oval, triangle, arrow, line) with text, fill and outline, pictures (insert, paste)
- Select, move, resize (snap guides to slide centre and edges), multi-select, copy/paste/duplicate, arrange and align, undo/redo
- Six themes (theme-coloured shapes follow the theme), per-slide backgrounds
- Full-screen slide show (arrows/space/click, number + Enter to jump, B for black screen, Esc), slide sorter
- Save and open **.pptx** (standard PowerPoint files; Bear imports text, shapes, pictures, backgrounds and notes from other apps' files), Print / Export to PDF, templates

### Notes, Tasks, Board and Sites

These keep their data in Bear's data folder and save automatically (atomic writes, so a crash can't leave a half-written file).

- **Notes**: notebooks → coloured sections → pages; rich text with to-do checklists, tables, pictures and links; search across all notebooks; move pages between sections
- **Tasks**: My Day, Important, Planned, All tasks and your own lists; steps, due dates, notes, importance; a board view with drag-and-drop columns (moving a card to Done completes it); undo after delete
- **Board**: a gallery of whiteboards built on [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT) — pens, shapes, arrows, text, sticky-note style shapes, PNG/SVG export; fonts ship inside the app
- **Sites**: team sites with a home page (welcome text, news, quick links, recent documents, a linked Tasks list), pages and news posts, a document library connected to any folder (Bear files open in Bear), and settings

## Development

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev          # run the desktop app with hot reload
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # build, then drive the real Electron app with Playwright
pnpm typecheck
```

## Installers

Each command builds the installers for one OS into `apps/desktop/release/`. Run it on that OS; `.github/workflows/release.yml` builds all three on GitHub Actions.

| Command | Output |
|---|---|
| `pnpm build:win` | `Bear-Setup-<version>.exe` (installs per user, no admin needed) and `Bear-<version>.msi` (installs machine-wide, for IT deployment) |
| `pnpm build:mac` | `Bear-<version>-x64.dmg` / `-arm64.dmg`, plus `.zip` files |
| `pnpm build:linux` | `Bear-<version>-x86_64.AppImage` and `bear_<version>_amd64.deb` |

The installers register Bear for .docx, .xlsx and .pptx files. Opening one of those files starts Bear on it, and if Bear is already running the file opens in a new Bear window. The MSI's `upgradeCode` in `apps/desktop/electron-builder.yml` must never change, because Windows uses it to upgrade older installs in place. To release a new version, bump `version` in `apps/desktop/package.json`.

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn on first launch. To sign them, set `CSC_LINK`/`CSC_KEY_PASSWORD` (plus the `APPLE_*` notarization variables on macOS) as repository secrets for the workflow.

## Website

The Bear website lives in `apps/site` (Astro and React) and is published at <https://michaelcodetolimit.github.io/Bear/>. It has a home page, an app tour, the docs, a playground and a download page.

| Command | Does |
|---|---|
| `pnpm site:dev` | Run the site with hot reload |
| `pnpm site:build` | Build the site into `apps/site/dist` and index the docs for search |
| `pnpm site:preview` | Serve the built site locally |
| `pnpm site:test` | Browser tests (Playwright); run `pnpm site:build` first |

`.github/workflows/site.yml` tests and deploys the site to GitHub Pages when `main` changes the site, when a release is published, or when you run it by hand. The repo's Pages source must be set to "GitHub Actions".

To publish installers:

1. Bump `version` in `apps/desktop/package.json`, then push a tag such as `v0.2.0`.
2. `release.yml` builds the installers on each OS and drafts a GitHub release.
3. Review the draft and publish it.
4. Publishing starts the site workflow, which rebuilds the site so the Download page lists the new files.

## Layout

```
apps/desktop/         Electron main, preload bridge, launcher (home screen)
packages/core/        App registry, file helpers, recent files, bridge types
packages/ui/          Shared ribbon, title bar, backstage (File menu), modal, context menu, file handling, theme
packages/app-write/   Word processor (TipTap editor, .docx import/export)
packages/app-sheets/  Spreadsheet (canvas grid, fast-formula-parser + formulajs, ExcelJS .xlsx, ECharts)
packages/app-slides/  Presentations (DOM slide editor, pptxgenjs export, .pptx import)
packages/app-notes/   Notebooks (uses Write's PageEditor)
packages/app-tasks/   To-dos and boards
packages/app-board/   Whiteboards (Excalidraw)
packages/app-sites/   Team sites
e2e/                  Playwright end-to-end tests
```

Each app is its own package and shares `core` and `ui`. The renderer has no Node access: all file I/O goes through the typed `window.bear` bridge (`packages/core/src/bridge.ts`).

## License

MIT
