---
title: Repo layout
group: Contribute
order: 2
---

Bear is a monorepo. Each app is its own package, and they all share `core` and `ui`.

```
apps/desktop/         Electron main, preload bridge, launcher (home screen)
apps/site/            This website (Astro)
packages/core/        App registry, file helpers, recent files, bridge types
packages/ui/          Shared ribbon, title bar, File menu, modal, context menu, file handling, theme
packages/app-write/   Word processor (TipTap editor, .docx import and export)
packages/app-sheets/  Spreadsheet (canvas grid, formula engine, .xlsx, charts)
packages/app-slides/  Presentations (slide editor, .pptx import and export)
packages/app-notes/   Notebooks (reuses Write's page editor)
packages/app-mail/    Email (IMAP and SMTP)
packages/app-tasks/   To-dos and boards
packages/app-board/   Whiteboards (Excalidraw)
packages/app-sites/   Team sites
e2e/                  Playwright tests that drive the real Electron app
e2e-site/             Playwright tests for this website
```

## The ideas that tie it together

**The app registry.** `packages/core/src/apps.ts` lists every app with its id, name, tagline, colour and whether it is ready. The launcher and this website both read it, so a new app only has to be described once.

**The bridge.** The renderer has no Node access. Anything that touches the disk or the network goes through the typed `window.bear` bridge, defined in `packages/core/src/bridge.ts`. The Electron main process in `apps/desktop` does the real work.

**Shared UI.** `@bear/ui` holds the pieces every app needs, so Write, Sheets and Slides all feel alike: the ribbon, title bar, File menu, modal and context menu.

**Two kinds of app.** Document apps open and save files, and use `useDocumentFile`. The others save their own data automatically with `useStoredData`.

Next: [how the tests work](../tests/).
