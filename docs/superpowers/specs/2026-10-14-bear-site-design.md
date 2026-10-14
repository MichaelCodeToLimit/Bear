# Bear website: design

Date: 2026-10-14
Status: approved (written spec reviewed 2026-10-14; Download page and Mail added after review)

## Goal

A public website for Bear that is full of playful animation. It has five separate pages that share one top bar and one style:

| Page | Purpose |
|---|---|
| Home | Landing page: what Bear is, why use it, download it |
| Tour | Animated demo of every Bear app, picked from a grid |
| Docs | User guides, FAQ and contributor docs |
| Playground | Experimental animated toys built from the Bear brand |
| Download | Every installation file for every system, from the latest GitHub Release |

Success means:

- all five pages work on phone (375px) and desktop with no sideways scroll
- every page feels alive, but stays fast, and works with animations switched off
- the site deploys automatically as static files to GitHub Pages

## Decisions

| Topic | Decision |
|---|---|
| Visual style | **Cozy & playful**: warm cream like the app icon, ink-brown text, bouncy and springy motion, floating app tiles, a bobbing bear |
| Tour format | **App picker**: grid of 12 tiles; clicking one springs open a panel with that app's animated demo |
| Tech | **Astro** (MIT) with **React islands** for interactive parts, TypeScript |
| Hosting | **GitHub Pages** for `https://github.com/MichaelCodeToLimit/Bear`, deployed by GitHub Actions |
| Animations toggle | In the top bar on every page; remembered per visitor; starts off when the system asks for reduced motion |

## Constraints

- **MIT-compatible dependencies only.** Bear is MIT and avoids GPL dependencies. Planned new dependencies are Astro, @astrojs/react, Motion, Matter.js and Pagefind, all MIT.
- **Original branding only.** Use Bear's own logo (`apps/desktop/build/`) and app colours. No Microsoft names, logos or icons, except to say which file formats Bear opens. The footer carries the "not affiliated with Microsoft" note from the README.
- **No drift from the app.** App names, taglines, colours and the ready/coming-soon flag come from `packages/core/src/apps.ts` at build time.
- New packages must satisfy the workspace's pnpm `minimumReleaseAge` policy.
- The site must work under the base path `/Bear/`.

## Prerequisites (owner actions)

1. Make `MichaelCodeToLimit/Bear` public. Pages on a private repo needs a paid plan.
2. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.
3. Push the code to `main` (the owner asked for this on 2026-10-14). `.superpowers/` (brainstorm mockups) and installer output (`release/`) stay ignored.
4. Put installers on a GitHub Release. Installers are 110–130 MB, and GitHub rejects files over 100 MB in a repo, so they can never live in the site itself.

## 1. Location, build and deploy

- New workspace package `apps/site` (`@bear/site`). It depends on `@bear/core` through `workspace:*`.
- `astro.config.mjs`: `site: 'https://michaelcodetolimit.github.io'`, `base: '/Bear/'`, React integration, static output.
- Routes:

  | Page | Address |
  |---|---|
  | Home | `/Bear/` |
  | Tour | `/Bear/tour/` |
  | Docs | `/Bear/docs/<slug>/` |
  | Playground | `/Bear/playground/` |
  | Download | `/Bear/download/` |
  | Not found | `404.html` |

- One config module, `src/site.config.ts`, holds:

  | Setting | Value |
  |---|---|
  | Repo URL | `https://github.com/MichaelCodeToLimit/Bear` |
  | Releases URL | `…/releases` |
  | Releases API | `https://api.github.com/repos/MichaelCodeToLimit/Bear/releases/latest` |
  | Site name | Bear |

- Root scripts:

  | Script | Does |
  |---|---|
  | `site:dev` | Astro dev server |
  | `site:build` | Astro build, then Pagefind index |
  | `site:preview` | Preview the built site |
  | `site:test` | Site Playwright tests |

- Workflow `.github/workflows/site.yml`:
  - **Triggers:** pushes to `main` that touch `apps/site/**`, `packages/core/**` or the workflow itself; `release: published` (so the Download page picks up new installers); and manual `workflow_dispatch`.
  - **Steps:** check out, then set up pnpm and Node 22, then `pnpm install --frozen-lockfile`, then `pnpm site:build`. Next it installs Playwright Chromium and runs `pnpm site:test`. Finally it runs `actions/upload-pages-artifact` on `apps/site/dist` and `actions/deploy-pages`.
  - **Settings:** permissions `pages: write` and `id-token: write`, and a `pages` concurrency group.
  - **Gate:** a failing build or test stops the deploy.

## 2. Shared shell, look and motion

### Layout

`src/layouts/BaseLayout.astro` wraps every page. It contains:

- **Top bar:** bear logo and "Bear" (links home), then Home, Tour, Docs, Playground, a GitHub link, the animations toggle and a Download button that links to the Download page. Below 768px the links collapse into a menu button that opens a sheet.
- **Footer:** links, the MIT licence, and the "independent project, not affiliated with Microsoft" note.
- A skip-to-content link, and one `<main>` landmark.

### Tokens

`src/styles/tokens.css` defines CSS custom properties:

- **Cream background:** a gradient from `#fbf4ea` to `#f1e2cc`.
- **Text:** ink `#3b2a1a`, plus a muted ink.
- **Surfaces:** white card surface, radii (`--r-sm`, `--r-md`, `--r-lg`, `--r-pill`), soft brown shadows.
- **Easings:** `--ease-bounce` (overshoot) and `--ease-pop`.
- **Speed:** `--motion-speed`, a multiplier used by every animation duration and set by the Theme mixer.
- **App colours:** `--app-<id>`, generated from `apps.ts` at build time.
- **Dark theme:** "cabin at night", with a dark cocoa background, cream text and the same app colours. It follows `prefers-color-scheme`.

### Motion

- **Ambient motion** (bobbing bear, floating tiles, pulsing buttons) is CSS keyframes.
- **Reveal on scroll:** `src/scripts/reveal.ts` uses an IntersectionObserver to add `is-visible` to `[data-reveal]` elements, with an optional stagger.
- **Interactive spring motion** in islands uses Motion.

### Animations toggle

- **Before first paint:** an inline script in `<head>` sets `data-motion="on|off"` on `<html>`.
- **Starting value:** the saved preference (`localStorage` key `bear-motion`) wins. Otherwise it's `off` if `prefers-reduced-motion: reduce`, otherwise `on`. Storage access is wrapped in try/catch, and failure falls back to the system setting.
- **`[data-motion="off"]`:** CSS sets `animation-play-state: paused`, removes transitions on decorative elements, and shows `[data-reveal]` content immediately.
- **Islands** read the flag through a `useMotion()` hook (subscribed to attribute changes) and react:
  - physics freezes
  - the bear stops tracking
  - demos jump to their final frame
- **The button** is labelled "Motion on" or "Motion off" with a paw icon and uses `aria-pressed`. Toggling saves the choice.
- `src/lib/motionPref.ts` holds the pure resolve logic (saved → system → default) so it can be unit-tested.

## 3. Pages

### Home (`src/pages/index.astro`)

1. **Hero:** the bobbing bear, the headline "Your office suite, no subscription.", a subline about Bear being free and open source, **Download Bear** (primary, links to the Download page) and **Take the tour** (secondary). The 12 app tiles float around it.
2. **App strip:** 12 tiles in app colours, with names. They wiggle on hover or focus and link to `tour/#<id>`. Coming-soon apps carry a small badge.
3. **Why Bear:** four cards that pop in on scroll:
   - free, no subscription
   - MIT open source
   - opens and saves .docx, .xlsx and .pptx
   - your files stay on your computer
4. **How it compares:** a small table comparing Bear and a typical subscription suite on price, licence, file formats and where files live. No competitor logos.
5. **Final call to action:** the bear waves, with a Download button. Then the footer.

### Tour (`src/pages/tour.astro` + `AppPicker` island)

- **Data:** `src/data/tour.ts` merges `apps.ts` with site-only content per app: tagline, 4–6 features (taken from the README) and a docs slug.
- **Grid:** 12 tiles. Selecting one springs open a panel below its row (on phones, a full-width sheet) containing:
  - the animated demo
  - the app name and tagline
  - the features
  - "Read the guide →" (finished apps only)
- Finished and coming-soon status always follows `ready` in `apps.ts`. As of this spec, 8 apps are finished and 4 are coming soon.
- **Demos:** one small component per finished app in `src/components/demos/`, drawn in HTML, CSS and SVG and themed with tokens:

  | App | Demo |
  |---|---|
  | Write | Text types out; a word turns bold |
  | Sheets | Cells fill in; a SUM total counts up |
  | Slides | Slides reorder in the sorter |
  | Notes | A checklist ticks off |
  | Mail | A new email drops into the inbox and opens |
  | Sites | News cards slide in |
  | Board | An SVG drawing strokes itself in |
  | Tasks | A card slides into Done |

  Each loops while visible and shows its final frame when motion is off.
- **Coming-soon apps** (Chat, Insights, Drive, Forms) show a sleeping bear with drifting "z"s and a "Coming soon" badge.
- **Deep links:** `#<id>` opens that panel on load and updates as you pick. Arrow keys move between tiles, Enter or Space opens one, Esc closes it, and focus returns to the tile.
- **Without JavaScript:** the page renders every app as a static list (name, tagline, features), so nothing is hidden.

### Docs (`src/pages/docs/[...slug].astro` + content collection)

- Markdown files in `src/content/docs/`, with frontmatter `title`, `group` and `order`.
- Sidebar groups and initial pages:

  | Group | Pages |
  |---|---|
  | Get started | Install Bear; Your first document |
  | Apps | Write, Sheets, Slides, Notes, Mail, Sites, Board, Tasks (one page each, from the README and each app's features) |
  | FAQ | One page |
  | Contribute | Dev setup; Repo layout; Running tests; Adding a new app |

- `/docs/` redirects to the first page.
- **Search:** Pagefind indexes the built docs. A search box sits at the top of the sidebar and the UI loads only when focused.
- **Reading layout:** a readable measure, with the bear only in the page header. No ambient motion in the reading area.
- Previous and next links sit at the bottom of each page.

### Playground (`src/pages/playground.astro` + four islands)

Each toy sits in its own card and hydrates with `client:visible`.

1. **BearBuddy:** an SVG bear whose pupils and head turn toward the pointer or touch. Click or tap cycles through wave, dance and sleep. Keyboard buttons do the same.
2. **TilePhysics:** Matter.js world with the 12 app tiles dropping under gravity. You can drag and throw them with mouse or touch. Reset puts them back. The world pauses when off-screen or when motion is off.
3. **MiniDemos**, with three tabs:
   - **Mini sheet:** a 3×3 grid where you type numbers or formulas (e.g. `=SUM(A1:C1)`), evaluated by `fast-formula-parser`, loaded lazily.
   - **Doodle:** a canvas pen with the 12 app colours and a clear button.
   - **Tasks:** a checklist that bursts confetti when every item is checked.
4. **ThemeMixer:** sliders for hue shift, roundness and animation speed. They write CSS custom properties on `<html>` and are saved in `localStorage`. It has "Surprise me" and "Reset" buttons. Colour maths keeps text contrast at 4.5:1 or better and refuses values that would break it.

### Download (`src/pages/download.astro`)

- **Data at build time:** `src/lib/releases.ts` fetches the latest release from the Releases API (with `GITHUB_TOKEN` when present, to avoid rate limits) and turns its assets into download entries.
- **Classifying files:** `classifyAsset(name)` maps a file name to a system and a label:

  | File | System | Label |
  |---|---|---|
  | `*.exe` | Windows | Installer (just for you, no admin needed) |
  | `*.msi` | Windows | MSI package (whole computer, for IT) |
  | `*.dmg` | macOS | Disk image |
  | `*-mac.zip` / `*-darwin*.zip` | macOS | Zip |
  | `*.AppImage` | Linux | AppImage (any distro) |
  | `*.deb` | Linux | .deb (Debian, Ubuntu) |
  | `*.blockmap`, `latest*.yml`, anything else | (hidden) | (not shown) |

- **Layout:**
  - A hero with the bear carrying a box and the version and date ("Bear 0.1.0 · 14 Oct 2026"), plus a link to the release notes.
  - A **"Best for you"** card: a small script reads the visitor's system and highlights the matching recommended file (Windows .exe, macOS .dmg, Linux AppImage). Without JavaScript nothing is highlighted and every file is still listed.
  - One group per system (Windows, macOS, Linux), each file a card with its label, file name and size (e.g. "113 MB"). The cards pop in on scroll, and the bear does a little catch when a download button is pressed.
  - A **Build from source** section (clone, `pnpm install`, `pnpm dev`) and a link to all releases.
- **When there's no release or the API fails:** the build still succeeds. The page shows "The first release is on its way" with the bear napping, the build-from-source steps and a link to the Releases page.

### 404 (`src/pages/404.astro`)

A lost bear with a map, and a link home.

## 4. Errors, quality and testing

### Error handling

- Every island is wrapped in an `IslandBoundary` error boundary. On failure the card shows "This one didn't load. Try reloading." and the rest of the page keeps working.
- Lazy imports (Matter.js, the formula engine, Pagefind) show a small loading state and fall back to the boundary message if the import fails.
- Every `localStorage` read and write is wrapped in try/catch.

### Accessibility

- Every toy works by keyboard, and focus rings are visible.
- Decorative SVGs are `aria-hidden`, and meaningful ones are labelled.
- Text contrast is AA in both themes.
- The animations toggle covers all non-essential motion.

### Performance

- Home ships at most 60 KB of JavaScript (gzipped), checked by the Playwright suite from the network log.
- Matter.js, the formula engine and Pagefind load only on the pages and toys that need them.
- Images (logo PNGs) are copied from `apps/desktop/build/` and served at the sizes used.

### Unit tests (Vitest)

These are picked up by the existing `apps/*/src/**/*.test.ts` glob, so they run in `pnpm test`.

| Test file | Covers |
|---|---|
| `motionPref.test.ts` | Saved value beats system, system beats default, storage errors fall back |
| `tour.test.ts` | Every app in `apps.ts` has tour content; finished apps have a demo and a docs slug; coming-soon apps don't link to missing docs |
| `themeMixer.test.ts` | Mixed colours keep contrast at 4.5:1 or better; reset restores defaults |
| `miniSheet.test.ts` | Formulas, references and errors evaluate as expected |
| `releases.test.ts` | Every file type in the table maps to the right system and label; hidden files are dropped; sizes format as MB; a failed or empty fetch returns the fallback |

### Browser tests (Playwright)

- They live in `e2e-site/`, with `playwright.site.config.ts` running Chromium against `astro preview` at the `/Bear/` base. They're separate from the Electron e2e config, so `pnpm test:e2e` is unchanged.
- They check:
  - each page loads with no console errors
  - all internal links resolve under `/Bear/`
  - the toggle sets `data-motion="off"`, pauses animations and survives a reload
  - `tour/#sheets` opens the Sheets panel, and Esc closes it and returns focus
  - docs search finds "formula" on the Sheets guide
  - each Playground toy renders and Reset works
  - the Download page shows either release files grouped by system or the fallback, never an error
  - at 375px width, no page scrolls horizontally

## Out of scope

- A blog or news section, analytics, cookies or any tracking.
- A custom domain. It can be added later through a `CNAME`.
- Translations.
- Real screenshots or video of the desktop app. Demos are drawn mock-ups.
- Building installers. The site lists whatever is on the latest GitHub Release. A CI workflow that builds installers on a version tag is a separate follow-up.
