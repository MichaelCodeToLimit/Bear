# Bear Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `apps/site` into the dark JConnect-style "Cabin at night" design, rebuild Home, and add "Download for Windows" buttons, without losing any existing feature or test guarantee.

**Architecture:**
- **Theme:** tokens flip to dark by default, with daylight available through a `data-theme` toggle.
- **Background:** layers come from CSS, plus a small vanilla starfield script.
- **Home:** becomes seven Astro section components, with no React on that page.
- **Other pages:** restyled through shared classes and page CSS. Their markup contracts and test selectors stay the same.

**Tech Stack:** Astro 7, React 18 islands, TypeScript, `@fontsource-variable/inter` (OFL-1.1), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-bear-site-redesign-design.md` (builds on `2026-10-14-bear-site-design.md`).

**Branch:** `feat/site-redesign` (cut from `feat/site` = `main` @ 8bbc92d). Pushing to `main` deploys.

## Global Constraints

- Everything in the 2026-10-14 plan's Global Constraints still holds:
  - the base path is `/Bear/` via `url()`
  - app data comes from `APPS`
  - no Microsoft names except the formats and the non-affiliation note
  - `localStorage` is always in try/catch
  - reveal content is hidden only under `html.js`
  - Home ships 60 KB or less of gzipped JS
  - packages must meet the minimum release age of 7 days or more
- **Themes:**
  - Dark is the default. `html[data-theme='light']` switches to daylight. The storage key is `bear-theme`, and any value other than `light` means dark.
  - The `prefers-color-scheme` block is removed.
- **Dark tokens:**

  | Token | Value |
  |---|---|
  | bg | `#0d0907` → `#140d09` |
  | ink | `#f6ead9` |
  | muted | `#b8a48e` |
  | surface | `#1a120c` |
  | accent | `#f59e0b` |
  | gradient stops | `#fbbf24`, `#f59e0b`, `#fb923c` |
  | primary button | `#fbf4ea` background, `#2a1c10` text |

- **Light tokens:**

  | Token | Value |
  |---|---|
  | bg | `#fbf4ea` → `#f1e2cc` |
  | ink | `#2a1c10` |
  | muted | `#6f5a46` |
  | surface | `#ffffff` |
  | accent | `#9a4508` |
  | gradient stops | `#9a4508`, `#b23a0c`, `#be123c` |
  | primary button | `#2a1c10` background, `#fbf4ea` text |

  A gradient stop that fails 4.5:1 against either background stop in its theme is adjusted, and the new value is recorded in the commit message.
- **Contrast:** app colours are never used as text on dark. App names render in `--ink`.
- **Selectors:** keep the selectors and data attributes that existing tests use, including `data-demo`, `data-os-group`, `data-bodies`, `data-mood`, `[data-motion-toggle]`, `[data-reveal]` and the tour tile and panel roles. Only home tests are rewritten.

## Review Focus

1. **Theme switching before first paint:** a reload with `bear-theme=light` must never flash dark. *Test: Task 1 shell spec, plus the head-script ordering.*
2. **Starfield cost and pausing:** it must not run on hidden tabs, with motion off, or on docs. *Test: Task 2 shell spec.*
3. **Phone layout of the product window and panel, and of the diagram:** no horizontal scroll at 375px. *Test: Task 3 home spec plus `site.spec`.*
4. **No release, or no Windows files:** the Windows button falls back to the Releases page and never breaks. *Test: Task 4 unit and e2e.*
5. **Daylight theme across restyled pages:** the toggle must leave no page unreadable. *Test: Task 7 runs the contrast unit tests, plus a light-theme pass of `site.spec`.*

---

### Task 1: Theme foundation (tokens, toggle, font, shared classes, background, top bar)

**Files:**
- Create: `src/lib/themePref.ts`, `src/lib/themePref.test.ts`, `src/components/ThemeToggle.astro`, `src/scripts/themeToggle.ts`
- Modify:
  - `src/styles/tokens.css`, `src/styles/base.css`
  - `src/layouts/BaseLayout.astro` (head script, Inter import, background layers)
  - `src/components/TopBar.astro`, `src/components/Footer.astro`
  - `src/lib/themeMixer.ts` (LIGHT and DARK palettes, plus the `grad` and button pairs in `isReadable`), `src/lib/themeMixer.test.ts`, `src/lib/contrast.test.ts`
  - `apps/site/package.json` (add `@fontsource-variable/inter`)
  - `e2e-site/shell.spec.ts`

**Interfaces:**
- Produces:
  - `type Theme = 'dark' | 'light'`, `THEME_KEY = 'bear-theme'`, `resolveTheme(saved: string | null): Theme`
  - `setTheme(t: Theme): void` in `themeToggle.ts`, which sets `html[data-theme]`, saves the choice, and syncs the `[data-theme-toggle]` `aria-pressed` and label ("Light theme"/"Dark theme")
  - the CSS classes `.display`, `.grad`, `.eyebrow`, `.lede`, `.glass`, `.pill`, `.btn--ghost`, `.section`, with `.btn` and `.btn--primary` restyled
  - the CSS variables `--glass`, `--edge`, `--grad`, `--btn-bg`, `--btn-ink`, `--glow`, `--grid-line`, `--font-mono`

- [ ] **Step 1: Write failing tests.**
  - **`themePref.test.ts`:** `resolveTheme(null)` gives `'dark'`, `'light'` gives `'light'`, `'dark'` gives `'dark'`, and `'banana'` gives `'dark'`.
  - **`contrast.test.ts` and `themeMixer.test.ts`** use the new palettes and assert at least 4.5 for each of these pairs, in both themes:
    - ink and muted against both background stops and the surface
    - accent against both background stops
    - every `--grad` stop against both background stops
    - `--btn-ink` on `--btn-bg`
  - The existing hue sweep still passes.
  - **`shell.spec.ts`:**
    - a fresh context gives `html[data-theme='dark']`
    - clicking `[data-theme-toggle]` gives `light`, which survives a reload
    - with `addInitScript` setting `bear-theme=light`, the first `DOMContentLoaded` already has `data-theme='light'`
    - the top bar computed `backdrop-filter` contains `blur`
- [ ] **Step 2: Run them.** Use `pnpm vitest run apps/site`, then `pnpm site:build && pnpm site:test e2e-site/shell.spec.ts`. They should fail.
- [ ] **Step 3: Implement.**
  - **`tokens.css`:** the dark values go on `:root` and the light values on `html[data-theme='light']`. Keep the `--hue-shift-n` OKLCH rotation block, applied to the new bg, ink and muted tokens.
  - **`BaseLayout`:**
    - Import `@fontsource-variable/inter`.
    - Extend the head script (theme first, then motion, then the saved mix). It still copies the rule from the `.ts` file and comments where it came from.
    - Add the `body` background layers: gradient, grid with `background-size: 40px 40px`, and the radial `--glow`.
  - **`TopBar`:** sticky and translucent (`color-mix(in srgb, var(--bg-from) 70%, transparent)` plus `backdrop-filter: blur(12px)`). Add `<ThemeToggle />` before `<MotionToggle />`. "Take the tour" uses the ghost style and "Download" the primary style.
  - **Restyle:** `.card`, `.tile` (glass, cream name, glowing app dot), `.badge` and the footer.
- [ ] **Step 4: Verify.** Run `pnpm test`, `pnpm --filter @bear/site check`, `pnpm site:build` and `pnpm site:test`. All must pass; update only selectors that broke purely because of visuals.
- [ ] **Step 5: Commit** with the message `feat(site): cabin-at-night theme foundation and theme toggle`.

### Task 2: Starfield

**Files:**
- Create: `src/scripts/starfield.ts`
- Modify: `src/layouts/BaseLayout.astro` (renders `<canvas class="starfield" aria-hidden="true">` only when not `calm`), `e2e-site/shell.spec.ts`

**Interfaces:**
- Produces `initStarfield(canvas: HTMLCanvasElement): () => void`.
  - **Stars:** about `min(90, area / 18000)`, joined by lines when they are less than 110px apart (accent colour, alpha 0.08–0.25), drifting at 0.02–0.06 px/ms. It is DPR-aware and rebuilds on resize.
  - **State:** `data-state='running'|'paused'` on the canvas. It pauses when `html[data-motion='off']`, through a MutationObserver, or when `document.hidden`.

- [ ] **Step 1: Write failing e2e tests.**
  - Home has `canvas.starfield[data-state='running']`.
  - After clicking the motion toggle it is `paused`.
  - `docs/get-started/install/` has no `canvas.starfield`.
- [ ] **Step 2: Run them.** They should fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** They should pass. The Home JS budget test must still pass.
- [ ] **Step 5: Commit** with the message `feat(site): drifting firefly starfield`.

### Task 3: Home rebuild

**Files:**
- Create: `src/components/home/{Hero,ProductWindow,Marquee,HowItWorks,FeatureBento,SuiteDiagram,FinalCta}.astro`
- Modify: `src/pages/index.astro` (it composes these seven), `e2e-site/home.spec.ts` (rewritten), `e2e-site/no-js.spec.ts` (selectors only, if needed)

Copy, the order of sections and the visuals are all specified in spec §2.

**The Hero download button** is a plain primary **Download →** button linking to `url('download/')`. Task 4 swaps it for `<WindowsDownload />`.

**`SuiteDiagram`** places the nodes with this function:

```ts
// Nodes on a circle around the hub, starting at the top and going clockwise.
const nodes = APPS.map((app, i) => {
  const a = (i / APPS.length) * 2 * Math.PI - Math.PI / 2
  return { app, x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) } // percentages of the square diagram
})
```

- [ ] **Step 1: Rewrite `home.spec.ts`.**
  - the hero pill `href` ends with `docs/apps/mail/`
  - `h1` contains "Your office suite." and has a `.grad` with "No subscription."
  - `.product-window` is visible, and `.apps-panel a` has 5 links ending in `tour/#write`, `#sheets`, `#slides`, `#notes` and `#mail`
  - the marquee contains `.docx`, `.xlsx`, `.pptx`, `IMAP` and `Linux`, and its computed `animation-play-state` is `paused` after the motion toggle
  - 3 `.how-card` elements
  - the diagram has 12 `a[href*="tour/#"]`, and the 4 not-ready apps have `data-soon`
  - "Download" links point to `/Bear/download/`
  - the JS budget is 60 KB or less
  - no horizontal scroll at 375px
- [ ] **Step 2: Run it.** It should fail.
- [ ] **Step 3: Implement the seven components and the page.**
- [ ] **Step 4: Run the full checks.** `pnpm site:build && pnpm site:test` must all pass, along with `astro check`.
- [ ] **Step 5: Commit** with the message `feat(site): JConnect-style home`.

### Task 4: Download for Windows

**Files:**
- Create: `src/components/WindowsDownload.astro`
- Modify:
  - `src/lib/releases.ts` (add `windowsDownloads`), `src/lib/releases.test.ts`
  - `src/components/home/Hero.astro`, `src/components/home/FinalCta.astro`
  - `src/pages/download.astro` (adds it above the OS groups)
  - `e2e-site/home.spec.ts`, `e2e-site/download.spec.ts`

**Interfaces:**
- Consumes: `ReleaseInfo` and `DownloadFile` from `releases.ts`, and `SITE.releasesUrl`.
- Produces:
  - `windowsDownloads(release: ReleaseInfo | null): { exe: DownloadFile | null; msi: DownloadFile | null; version: string | null }`
  - `<WindowsDownload release={…} />`. Pages fetch the release once in their frontmatter and pass it in.
  - **With an exe:** a primary button whose `href` is `exe.url`, with the text "Download for Windows", a sub-line "Bear {version} · .exe · {formatSize}", and `data-windows-download="exe"`.
  - **With an msi:** a ghost button linking to `msi.url`, with the text ".msi for IT / whole computer" and `data-windows-download="msi"`.
  - **Without an exe:** a primary button linking to `SITE.releasesUrl`, with `data-windows-download="releases"`, and the note "First release coming soon".
  - An "Other systems →" link to `url('download/')`.

- [ ] **Step 1: Write failing unit tests.**

  | Input | Expected |
  |---|---|
  | `null` | `{exe: null, msi: null, version: null}` |
  | a release with `.exe`, `.msi` and `.dmg` | picks the exe and msi |
  | Windows files only | picks them |
  | an msi and no exe | gives `exe: null`, `msi` set |

- [ ] **Step 2: Write failing e2e tests.**
  - The Home hero `[data-windows-download]` is visible and contains "Download for Windows".
  - Its `href` either matches `/\/releases\/download\/.+\.exe$/` or equals the Releases URL.
  - The Download page has the same component.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run apps/site && pnpm site:build && pnpm site:test`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat(site): download for Windows buttons`.

### Task 5: Restyle Tour and 404

**Files:**
- Modify: `src/pages/tour.astro`, `src/islands/AppPicker.tsx` (class names and styles only), `src/islands/demos/Frame.tsx` (window chrome matches the Home product window), `src/pages/404.astro`

Header copy, glass tiles, the product-window panel and the coming-soon panels follow spec §3. All existing `tour.spec.ts` assertions must pass without changes.

- [ ] **Step 1: Add a test.** In `tour.spec.ts`, the tour `h1` has a `.grad` span with "Watch it work.". It should fail first.
- [ ] **Step 2: Implement the restyle.** Then run `pnpm site:build && pnpm site:test`; everything should pass.
- [ ] **Step 3: Commit** with the message `feat(site): restyle tour and 404`.

### Task 6: Restyle Docs, Playground and Download

**Files:**
- Modify: `src/layouts/DocsLayout.astro`, `src/islands/DocsSearch.tsx` (styles only), `src/pages/playground.astro`, `src/islands/TilePhysics.tsx` (canvas background and tile glow), `src/pages/download.astro`

Follow spec §3. Docs use the terminal-style code blocks and a calm background with no starfield. The Playground uses the bento grid, which drops to one column below 768px. Download uses glass installer cards with an accent ring on "Best for you".

- [ ] **Step 1: Add tests.**
  - `playground.spec.ts`: at 1280px the physics card spans 2 grid columns, using its bounding-box width compared with a sibling.
  - `docs.spec.ts`: a code block sits inside `.terminal`.
  - Both should fail first.
- [ ] **Step 2: Implement.** Then run `pnpm site:build && pnpm site:test`; everything should pass.
- [ ] **Step 3: Commit** with the message `feat(site): restyle docs, playground and download`.

### Task 7: Light-theme pass and final checks

**Files:**
- Modify: `e2e-site/site.spec.ts` (repeat "no console errors" and "no horizontal scroll" for each page with `bear-theme=light`), plus any CSS fixes those runs reveal.

- [ ] **Step 1: Add the light-theme loop** to `site.spec.ts`. Run it and fix every failure in CSS.
- [ ] **Step 2: Run the full gate:** `pnpm test`, `pnpm typecheck`, `pnpm --filter @bear/site check`, `pnpm site:build` and `pnpm site:test`. All must pass.
- [ ] **Step 3: Commit** with the message `test(site): light-theme pass`.
- [ ] **Step 4 (controller):**
  - Run the final review.
  - Fast-forward `main` to the branch (the owner approved deploys to `main` for the site).
  - Watch the Pages run on the public run page, not the rate-limited API.
  - Screenshot the live Home.
