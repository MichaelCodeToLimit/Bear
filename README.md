# Bear

A free, open-source desktop productivity suite. Documents, spreadsheets, slides, notes, mail, chat and dashboards, all in one app, with no subscription. Bear Studio adds creative apps, starting with Photo.

> Bear is an independent project. It is not affiliated with or endorsed by Microsoft or Adobe. It reads and writes common Office file formats (.docx, .xlsx and .pptx) and layered .psd images for compatibility.

## Status

| App | What it replaces | Status |
|---|---|---|
| **Write** | Word processor | ✅ MVP |
| **Sheets** | Spreadsheets | ✅ MVP |
| **Slides** | Presentations | ✅ MVP |
| **Notes** | Notebooks | ✅ MVP |
| **Mail** | Email | ✅ MVP (calendar next) |
| Chat | Team chat & calls | Planned |
| Insights | Data dashboards | Planned |
| **Sites** | Team sites | ✅ MVP (on this computer; sharing needs the coming server) |
| Drive | File sync | Planned |
| **Tasks** | To-dos & plans | ✅ MVP |
| **Board** | Whiteboard | ✅ MVP |
| Forms | Surveys & quizzes | Planned |

### Bear Studio

Creative apps, free forever.

| App | What it does | Status |
|---|---|---|
| **Photo** | Photo editing | ✅ MVP |
| Vector | Vector graphics | Planned |
| PDF | PDF documents | Planned |
| Video | Video editing | Planned |
| Motion | Motion graphics | Planned |
| Audio | Audio editing | Planned |
| Layout | Page layout | Planned |

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

### Mail features

- **Bear Mail addresses**: choose *Create a Bear Mail address* to get your own `name@bear.com` in seconds. Bear runs this mail service itself, on this computer only. Each message is kept as its own file in Bear's data folder, with an index for fast lists and search. Bear Mail addresses created here can email each other. Reaching Gmail, Outlook and the rest of the internet needs a hosted Bear Mail server and the bear.com domain, which is planned
- **Import into Bear Mail**: copy a Gmail, Outlook or any other account's mail and folders into a new or existing Bear Mail address. You can choose how far back to go, and it can keep bringing in new mail every few minutes. Progress is saved as it goes, so an import interrupted by closing Bear carries on later
- Works with any IMAP/SMTP mailbox: Gmail, iCloud, Yahoo, AOL, Fastmail, Zoho, GMX and Proton Bridge are recognised automatically (use an *app password* where the provider requires one); custom servers under Advanced settings
- Sign in with Microsoft or Google (OAuth with PKCE). Register a free app with the provider and paste its client ID in Mail settings; Bear never sees your password
- Folders with unread counts, paged message list, search, flag, mark unread, archive, delete, keyboard shortcuts and right-click menus
- Compose in the Write editor with To/Cc/Bcc and attachments; reply, reply all and forward keep the original quoted and threaded. Bcc recipients are never revealed to other recipients, and a copy is filed in Sent
- Unsent drafts are kept on this computer and survive a restart
- Safe reading: emails are cleaned (no scripts, forms or frames, `javascript:` links removed) and shown in a locked-down frame; pictures from the internet (often trackers) stay blocked until you choose **Show pictures**
- Passwords and sign-in tokens are encrypted with the operating system's key store

**For developers:** `pnpm mail-server` starts a throwaway test server that keeps mail in memory, so nothing is saved. In Mail, add `bear@bear.com` (password `bear`) with server `127.0.0.1`, IMAP port 1143, SMTP port 1025 and security "None". To use another address, run `pnpm mail-server you@bear.com`. The automated tests use this server.

### Notes, Tasks, Board and Sites

These keep their data in Bear's data folder and save automatically (atomic writes, so a crash can't leave a half-written file).

- **Notes**: notebooks → coloured sections → pages; rich text with to-do checklists, tables, pictures and links; search across all notebooks; move pages between sections
- **Tasks**: My Day, Important, Planned, All tasks and your own lists; steps, due dates, notes, importance; a board view with drag-and-drop columns (moving a card to Done completes it); undo after delete
- **Board**: a gallery of whiteboards built on [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT) — pens, shapes, arrows, text, sticky-note style shapes, PNG/SVG export; fonts ship inside the app
- **Sites**: team sites with a home page (welcome text, news, quick links, recent documents, a linked Tasks list), pages and news posts, a document library connected to any folder (Bear files open in Bear), and settings

### Photo features

- Layers with blend modes and opacity
- Selections: marquee, lasso and magic wand
- Brush, eraser, fill, gradient, shape and text tools
- Adjustments: brightness/contrast, levels, curves, hue/saturation, invert, black & white
- Filters: blurs, sharpen, unsharp mask, noise, pixelate
- Crop, rotate, flip, resize and trim
- Open **.psd**, PNG, JPG, WebP, GIF, BMP and AVIF. Save as **.bearphoto** (keeps every layer) or **.psd**. Export PNG, JPG or WebP
- Crash recovery: a recovery copy is kept as you work and offered back after a crash

## Downloads

Every release comes in three editions. Pick one on the [Download page](https://michaelcodetolimit.github.io/Bear/download/):

- **Bear**: everything, the office apps and Bear Studio in one install (`Bear-…`, `bear_…` files)
- **Bear Office**: only the office apps (`Bear-Office-…`, `bear-office_…`)
- **Bear Studio**: only the creative apps (`Bear-Studio-…`, `bear-studio_…`)

The editions are separate apps: you can install any of them side by side and run them at the same time. They share Bear's data folder, so notebooks, tasks, boards, sites, mail and the recent files list are the same in each (each app lists only the recent files it can open). On macOS and Linux a mail password saved by one edition may have to be entered again in another, because each app has its own keychain entry. `.github/workflows/release.yml` lists every file name.

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

Each command builds the installers for one OS into `apps/desktop/release/`. Run it on that OS; `.github/workflows/release.yml` builds all of them on GitHub Actions.

| Command | Output |
|---|---|
| `pnpm build:win` | `Bear-Setup-<version>.exe` (installs per user, no admin needed) and `Bear-<version>.msi` (installs machine-wide, for IT deployment) |
| `pnpm build:mac` | `Bear-<version>-arm64.dmg` / `-x64.dmg`, plus `Bear-<version>-arm64-mac.zip` / `-x64-mac.zip` |
| `pnpm build:linux:main` | `Bear-<version>-x64.AppImage`, `bear_<version>_amd64.deb`, `Bear-<version>-x64.rpm` and `Bear-<version>-x64.tar.gz` (the rpm needs `rpmbuild`) |
| `pnpm build:linux:flatpak` | `Bear-<version>-x64.flatpak` (needs `flatpak-builder` plus the 24.08 Freedesktop runtime, SDK and Electron BaseApp from Flathub) |

### Building an edition

Set `BEAR_EDITION` to `all` (the default when it's unset), `office` or `studio`; any other value stops the build. For example, on Windows (Git Bash or any POSIX shell):

```bash
BEAR_EDITION=studio pnpm build:win    # Bear-Studio-Setup-<version>.exe and Bear-Studio-<version>.msi
BEAR_EDITION=office pnpm build:dir    # an unpacked Bear Office in apps/desktop/release/win-unpacked
```

In PowerShell, set it first: `$env:BEAR_EDITION = 'studio'; pnpm build:win`. The end-to-end tests run against whatever `pnpm build` produced last; the test that checks a Studio build only runs when `BEAR_EDITION_BUILD` is set:

```bash
BEAR_EDITION=studio pnpm build && BEAR_EDITION_BUILD=studio npx playwright test e2e/editions.spec.ts
pnpm build    # back to the full suite before running the rest of the suite
```

The installers register Bear for .docx, .xlsx and .pptx files (Bear Office: those; Bear Studio: .bearphoto and .psd; Bear: all five). Opening one of those files starts Bear on it, and if Bear is already running the file opens in a new Bear window. The MSI's `upgradeCode` in `apps/desktop/electron-builder.config.cjs` must never change, because Windows uses it to upgrade older installs in place. To release a new version, bump `version` in `apps/desktop/package.json`.

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn on first launch. To sign them, set `CSC_LINK`/`CSC_KEY_PASSWORD` (plus the `APPLE_*` notarization variables on macOS) as repository secrets for the workflow.

## Website

The Bear website lives in `apps/site` (Astro and React) and is published at <https://michaelcodetolimit.github.io/Bear/>. It has a home page, an app tour, the docs, a playground and a download page.

**Android.** The Download page lists the `.apk` attached to the latest GitHub release. If the release has none, it serves the newest `*.apk` in `apps/site/public/downloads/` (the site computes its size and SHA-256 at build time). To publish a new Android build, copy the new `Bear-<version>-debug.apk` into that folder, delete the old one and push. (The Android app project is not in this repository yet.) Each committed APK stays in git history, so keep only the latest.

| Command | Does |
|---|---|
| `pnpm site:dev` | Run the site with hot reload |
| `pnpm site:build` | Build the site into `apps/site/dist` and index the docs for search |
| `pnpm site:preview` | Serve the built site locally |
| `pnpm site:test` | Browser tests (Playwright); run `pnpm site:build` first |

`.github/workflows/site.yml` tests and deploys the site to GitHub Pages when `main` changes the site, when a release is published, or when you run it by hand. The repo's Pages source must be set to "GitHub Actions". In Settings > Environments > github-pages, the deployment branches must include `main` (the default). A published release does not deploy by itself (a release run's ref is the tag, which that environment rejects); it re-runs the workflow on `main`, which builds with the new release and deploys, so no tag rule is needed.

To publish installers:

1. Bump `version` in `apps/desktop/package.json`, then push a tag such as `v0.2.0`.
2. `release.yml` builds the installers on each OS (Flatpak in its own job, which can fail without blocking the release) and drafts one GitHub release with every file.
3. Review the draft and publish it. To test the whole pipeline without releasing anything, push to the `ci/release-dry-run` branch: it builds everything and keeps the files as workflow artifacts, but creates no release.
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
packages/app-photo/   Photo editor (Bear Studio)
e2e/                  Playwright end-to-end tests
```

Each app is its own package and shares `core` and `ui`. The renderer has no Node access: all file I/O goes through the typed `window.bear` bridge (`packages/core/src/bridge.ts`).

## License

MIT
