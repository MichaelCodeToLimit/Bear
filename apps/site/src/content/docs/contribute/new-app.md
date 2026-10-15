---
title: Adding a new app
group: Contribute
order: 4
---

A new Bear app is a new package that plugs into the shared registry. Here is the shape of the work.

## 1. Add it to the registry

Open `packages/core/src/apps.ts`. The `APPS` list holds one entry per app: its id, name, tagline, colour, the file extensions it opens, and a `ready` flag. Add yours there. Apps with `ready: false` show on the launcher and this website as "coming soon", and flip to `ready: true` when they can be used.

The launcher, the website's Tour page and the home page tiles all read from this list, so you describe the app once.

## 2. Create the package

Make `packages/app-<id>/`, modelled on an existing app. Build on the shared packages:

- `@bear/core` for the registry, file helpers and bridge types.
- `@bear/ui` for the ribbon, title bar, File menu, modals and theme, so your app matches the others.

## 3. Pick how it saves

- **A document app** (it opens and saves files) should use `useDocumentFile` from `@bear/ui`. You get save, open, AutoSave and the unsaved-changes prompt on close.
- **Any other app** should use `useStoredData`. It keeps JSON in the app's data folder and writes it atomically, so a crash cannot leave a half-written file.

## 4. Keep to the rules

- Stay MIT-friendly. Do not add GPL dependencies.
- The renderer has no Node access. Go through the typed `window.bear` bridge.

## 5. Test it

Add unit tests next to your code and an end-to-end test in `e2e/`. Run `pnpm test` and `pnpm test:e2e`. See [Tests](../tests/).

## 6. Tell the website

When your app is ready, give it a short feature list for the Tour page in `apps/site/src/lib/tour.ts` and a guide page under `apps/site/src/content/docs/apps/`. The site's tests will remind you if a guide is missing.
