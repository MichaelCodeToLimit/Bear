---
title: Dev setup
group: Contribute
order: 1
---

Bear is an Electron app written in TypeScript, in a pnpm monorepo. It is MIT licensed, and contributions are welcome.

## What you need

- Node 20 or newer (the website needs Node 22.12 or newer)
- [pnpm](https://pnpm.io)
- Git

## Get it running

```bash
git clone https://github.com/MichaelCodeToLimit/Bear.git
cd Bear
pnpm install
pnpm dev          # run the desktop app with hot reload
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the desktop app with hot reload |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Build, then drive the real Electron app with Playwright |
| `pnpm typecheck` | Check types across the repo |
| `pnpm site:dev` | Run this website locally |
| `pnpm site:build` | Build this website (and its search index) |
| `pnpm site:test` | Browser tests for this website |

## Conventions

- **License stays MIT.** Do not add GPL dependencies. HyperFormula was rejected for exactly this reason.
- **Shared code lives in `@bear/core` and `@bear/ui`.** Each app is its own package that builds on them.
- **Document apps** (Write, Sheets, Slides) use `useDocumentFile` from `@bear/ui` for saving, opening, AutoSave and the unsaved-changes prompt on close.
- **Apps that are not documents** (Notes, Tasks, Board, Sites) keep their data with `useStoredData`, which saves JSON in the app's data folder using atomic writes.
- **The renderer has no Node access.** All file access goes through the typed `window.bear` bridge.

## Installers

`pnpm build:win`, `pnpm build:mac` and `pnpm build:linux` each build the installers for one OS into `apps/desktop/release/`. Run each on its own OS. The release workflow on GitHub Actions builds all three.

## Next

Find your way around in [Repo layout](../repo-layout/), then see how to [run the tests](../tests/).
