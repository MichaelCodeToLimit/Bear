# Bear website redesign: "Cabin at night"

Date: 2026-10-15
Status: approved in conversation (sections 1–3), awaiting written-spec review
Builds on: `docs/superpowers/specs/2026-10-14-bear-site-design.md`. Everything there still holds unless this document changes it.

## Goal

Make the live Bear site (`apps/site`) look and feel like https://jconnect-1dsx.onrender.com: a dark, glowing, premium product site. Keep Bear's own colours and every existing feature.

Success means:

- **Look:** a visitor sees a dark JConnect-style site. That means a near-black background, a faint grid, an amber glow, drifting stars, giant gradient headlines, monospace eyebrows, glass cards, and a product-window hero with a floating panel.
- **Behaviour unchanged:**
  - all five pages, the Tour picker, the demos, docs search, the Playground toys and the Download listing work as before
  - every page is still readable with JS off
  - every animation stops when motion is off
  - no sideways scroll at 375px
  - Home ships 60 KB or less of gzipped JS
  - text contrast is AA in both themes
- **Release:** the redesign deploys through the existing Pages workflow.

## What we borrow from JConnect

| JConnect element | Bear version |
|---|---|
| Near-black background, faint grid, blue radial glow | Cocoa near-black `#0d0907`, a 40px grid at about 3% cream, an **amber** radial glow at the top |
| Drifting constellation canvas | Warm "firefly" stars joined by thin amber lines, drifting slowly |
| Giant tight headline, second line in a gradient | 64–88px, −0.045em letter spacing, second line in an amber-to-orange gradient |
| "New" pill above the headline | "New · Bear Mail: your inbox, built in →" |
| White primary button and outlined secondary button | A cream primary button and an outlined cream secondary button |
| Product window plus a floating side panel | A Bear Write window plus a floating "Bear apps" panel |
| Logo marquee | A scrolling row of file formats, mail and operating systems |
| Monospace eyebrow labels (`● How it works`) | The same, in amber |
| Bento cards with small live visuals | The same, with Bear content |
| Text and a glowing node diagram | "Twelve apps. One download." with a hub and 12 app nodes |

## Decisions

| Topic | Decision |
|---|---|
| Default theme | **Dark ("cabin at night") for every visitor.** Ruling: most browsers report "light" by default, so following the system setting would show most visitors the light theme, the opposite of the chosen direction. |
| Light theme | "Warm daylight" (mockup B), switched on by a ☀/☾ **theme toggle** in the top bar and remembered in `localStorage` (`bear-theme`). Without JS it stays dark. |
| Typeface | **Inter Variable** from `@fontsource-variable/inter` (SIL OFL 1.1, a font licence compatible with MIT), self-hosted. Monospace eyebrows and code use `ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace`, with no extra download. |
| App colours on dark | Used only as dots, borders, glows and fills, never as text on dark. App names in tiles and panels render in cream ink. |
| Theme mixer | Keeps working. Its palettes and readability checks switch to the new dark and light values. |

## 1. Site-wide look

**Tokens (`tokens.css`)**

- `:root` holds the dark values.
- `html[data-theme='light']` overrides them with the daylight values.
- The old `prefers-color-scheme` block is removed.

| Token | Dark (default) | Light |
|---|---|---|
| `--bg-from` / `--bg-to` (`--cream-from` / `--cream-to` stay the mixer-rotated source names) | `#0d0907` / `#140d09` | `#fbf4ea` / `#f1e2cc` |
| `--ink` | `#f6ead9` | `#2a1c10` |
| `--ink-muted` | `#b8a48e` | `#6f5a46` |
| `--surface` (card fill, opaque fallback) | `#1a120c` | `#ffffff` |
| `--glass` (card fill) | `rgba(255, 240, 220, 0.04)` | `rgba(255, 255, 255, 0.7)` |
| `--edge` (1px borders) | `rgba(255, 240, 220, 0.10)` | `rgba(59, 42, 26, 0.12)` |
| `--accent` (links, eyebrows) | `#f59e0b` | `#9a4508` |
| `--grad` (headline gradient) | `linear-gradient(90deg, #fbbf24, #f59e0b, #fb923c)` | `linear-gradient(90deg, #9a4508, #b23a0c, #be123c)` |
| `--btn-bg` / `--btn-ink` (primary) | `#fbf4ea` / `#2a1c10` | `#2a1c10` / `#fbf4ea` |
| `--glow` | `rgba(180, 83, 9, 0.55)` | `rgba(251, 191, 36, 0.35)` |
| `--grid-line` | `rgba(255, 240, 220, 0.03)` | `rgba(59, 42, 26, 0.05)` |

- Every gradient stop must be at least 4.5:1 against both page-background stops in its theme. If a stop falls short, darken it (light) or lighten it (dark) and record the new value in the plan. The unit tests enforce this.
- `--font` becomes `'Inter Variable', 'Inter', ui-sans-serif, system-ui, 'Segoe UI', sans-serif`.
- `--font-mono` is the monospace stack.

**Shared classes (`base.css`)**

| Class | Style |
|---|---|
| `.display` | Huge headline: `clamp(2.6rem, 7vw, 5.5rem)`, weight 800, −0.045em letter spacing, line-height 0.98 |
| `.grad` | The gradient text span |
| `.eyebrow` | Monospace, 0.8rem, accent colour, with a leading `●` |
| `.lede` | Large muted paragraph |
| `.glass` | Card with `--glass` fill, `--edge` border, `--r-lg` radius and an inset top highlight |
| `.pill` | "New" badge |
| `.btn` / `.btn--primary` / `.btn--ghost` | JConnect button styles |
| `.section` | Generous vertical rhythm |

Existing classes (`.card`, `.tile`, `.badge`, `.float`, `.bob`) are restyled on top of the new tokens, so pages that use them change look without markup changes.

**Background layers (`BaseLayout`)**

- `body` stacks three layers: the page gradient, a CSS grid (`--grid-line`), and a radial `--glow` at the top centre.
- A fixed `<canvas class="starfield">` sits behind the content. It is drawn by `src/scripts/starfield.ts`:
  - about 70 stars, density scaled to the viewport and capped
  - stars within 110px of each other are joined by lines (`--accent` at low alpha)
  - stars drift slowly, and the canvas handles devicePixelRatio
  - drawing stops when `html[data-motion='off']`, when the tab is hidden, or on pages with `calm` (docs), where the canvas is not rendered at all
  - it exposes `data-state='running'|'paused'` for tests
- Without JS, the grid and glow still render (pure CSS).

**Top bar**

- Sticky, translucent (`--bg-from` at 70% opacity plus `backdrop-filter: blur(12px)`), with a bottom `--edge` line.
- Links stay the same. The ☀/☾ `<ThemeToggle />` goes before the motion toggle.
- "Take the tour" uses the ghost button style and "Download" the primary style.

**Head script**

- It also sets `data-theme` from `bear-theme` (`light` or `dark`; anything else means dark), before first paint and in try/catch.
- The pure rule lives in `src/lib/themePref.ts`, `resolveTheme(saved): 'dark' | 'light'`, with a unit test. As with motion, the head script copies the rule and comments where it came from.

## 2. Home (`index.astro`, rebuilt)

Sections, in order. Each is its own component under `src/components/home/`.

1. **`Hero.astro`**
   - The pill "**New** Bear Mail: your inbox, built in →", linking to `docs/apps/mail/`.
   - The `.display` headline "Your office suite." with `<span class="grad">No subscription.</span>`.
   - The `.lede` "Write, Sheets, Slides, Notes, Mail and more. Free, open source, and your files stay yours."
   - A primary **Download →** button to `download/` and a ghost **See every app →** button to `tour/`.
   - A small muted line: "Windows, Mac and Linux · Opens .docx, .xlsx and .pptx".
2. **`ProductWindow.astro`**
   - A large `.glass` window that rises in. It has a title bar ("← Report.docx", Home, Insert, Layout), a page whose text lines type themselves out (CSS), and a dock of the 12 app dots along the bottom.
   - A floating **"Bear apps"** panel overlaps its right edge and bobs gently. It lists Write, Sheets, Slides, Notes and Mail, each with a glowing status dot in its app colour, a cream name, a muted tagline (from `APPS`) and an "Open" chip linking to `tour/#<id>`.
   - On phones the panel stacks under the window.
3. **`Marquee.astro`**
   - The caption "Works with the files and accounts you already have".
   - An infinite CSS marquee, edge-faded with a mask: `.docx`, `.xlsx`, `.pptx`, `.csv`, `.md`, `.html`, `IMAP`, `Windows`, `macOS`, `Linux`.
   - It pauses on hover and when motion is off.
   - The duplicated copy for the seamless loop is `aria-hidden`.
4. **`HowItWorks.astro`**
   - The eyebrow "How it works", then "Open. Edit. <span class=grad>Own.</span>"
   - Three `.glass` cards, each with a CSS visual:

     | Card | Visual |
     |---|---|
     | **Open** | File chips (.docx, .xlsx) drop into a window outline |
     | **Edit** | A blinking caret and a SUM counter ticking to 1,240 |
     | **Own** | A "Saved to this computer · .docx" chip with a lock, and a struck-through cloud |

5. **`FeatureBento.astro`**
   - A wide card, "Feels like the apps you know." Ribbon, AutoSave and templates, plus three bars: "File formats: .docx .xlsx .pptx", "Works offline", and "Subscription: none".
   - A tall card, "Crash? Keep working." A list ticks through three rows: "App closed unexpectedly", "Restoring AutoSave…", "Back where you left off ✓".
6. **`SuiteDiagram.astro`**
   - The eyebrow "The suite", then "Twelve apps. <span class=grad>One download.</span>"
   - On the left, a checklist: free forever, MIT licensed, your files stay on your computer, opens Office formats.
   - On the right, an SVG diagram. A Bear hub sits in the centre, with the 12 app nodes on an orbit in their colours, joined to the hub by lines with travelling light pulses (stroke-dashoffset).
   - The 4 coming-soon apps are dimmed.
   - Each node is an `<a>` to `tour/#<id>` with an accessible name, for example "Sheets: Spreadsheets".
7. **`FinalCta.astro`**
   - "Bring your files. <span class=grad>Leave the subscription.</span>", with Download and Take the tour.

Removed from Home: the 12 floating hero tiles, the app strip, the "Why Bear" cards and the comparison table. Their content moves into sections 2, 5 and 6.

Home still has **no React islands**. Its only scripts are reveal, starfield, motion and the theme toggle.

## 3. Other pages (restyle only, same features and markup contracts)

**Tour**
- Header: the eyebrow "The tour", then "Pick an app. <span class=grad>Watch it work.</span>"
- Tiles become `.glass` cards with a glowing app dot and a cream name.
- The open panel is a large `.glass` product window, using the Home window's title-bar style.
- Coming-soon panels keep the sleeping bear.
- All selectors and data attributes the tests use stay the same.

**Docs**
- The sidebar is a `.glass` panel, and the current link gets a 2px `--accent` left edge.
- The article area is calm: no starfield, with grid and glow at reduced opacity.
- Code blocks look like terminal windows: a `.glass` frame with three dots and the monospace font.
- The search UI is restyled to the dark tokens.

**Playground**
- Header: "Toys, tests <span class=grad>and tinkering.</span>"
- The four cards sit in a bento grid. Tile physics spans two columns, bear buddy is tall, mini demos and the mixer sit side by side. Below 768px everything is one column.
- The physics canvas uses a transparent or dark background, and its tiles get a soft glow in their app colour.

**Download**
- Header: "Get Bear. <span class=grad>Keep it.</span>", with the bear carrying its box.
- Installer cards become `.glass` cards with an OS glyph, label, file name, size and a primary download button.
- "Best for you" gets an `--accent` ring.
- The fallback state uses the same styling.

**Windows download buttons (added 2026-10-15 at the owner's request)**
- A `<WindowsDownload />` component (`src/components/WindowsDownload.astro`) is fed by the build-time `fetchLatestRelease()` result.
- **When a release has Windows files:**
  - A big primary button, **"Download for Windows"**, links straight to the `.exe` asset (the per-user installer, no admin needed). It shows the version and size, e.g. "Bear 0.1.1 · .exe · 113 MB".
  - Next to it, a ghost button, **".msi for IT / whole computer"**, links to the `.msi` asset.
  - A small "Other systems →" link points to the Download page's full list.
- **When there's no release, or no Windows files:** the primary button reads "Download for Windows" and links to the GitHub Releases page, with a muted note: "First release coming soon".
- It appears in three places:
  - in the Home hero, replacing the plain Download button; "See every app" stays as the ghost button
  - at the top of the Download page, above the per-system groups
  - in the Home final call to action
- Tests:
  - unit: a helper `windowsDownloads(release)` returns `{ exe, msi }` from `ReleaseInfo` (either may be null), including the no-release case
  - e2e: the Home hero shows "Download for Windows" with an `href` of either a GitHub release asset ending in `.exe` or the Releases page

**404**
- The lost bear on the starfield, with a primary button home.

## 4. Testing

- **Unit (Vitest):**
  - `themePref.test.ts` covers `resolveTheme`.
  - `themeMixer` and `contrast` tests switch to the new palettes. They check:
    - ink, muted ink and accent against both background stops and against `--surface`, in both themes
    - every `--grad` stop against both background stops (the headline is text)
    - primary button text against `--btn-bg`
    - that app colours render as dots and fills only in dark mode
  - The hue sweep must still pass.
- **Browser (Playwright):**
  - `home.spec.ts` is rewritten for the new sections:
    - the hero pill links to the Mail guide
    - the headline text and its `.grad` span
    - the product window, plus a panel listing 5 apps whose links end in `tour/#<id>`
    - the marquee holds every listed item, and its animation pauses with motion off
    - 3 How-it-works cards
    - the diagram has 12 app links, with the 4 coming-soon ones dimmed
    - the Download buttons point to `/Bear/download/`
    - the JS budget stays at 60 KB or less
  - `shell.spec.ts` adds:
    - the site starts with `data-theme='dark'`
    - the theme toggle switches to light and survives a reload
    - the starfield has `data-state='running'`, and becomes `'paused'` when motion is turned off
    - no starfield canvas on docs pages
  - `no-js.spec.ts` keeps passing: everything stays visible without JS.
  - The other specs pass unchanged, except for selector updates where markup classes changed. Those updates must keep each test's meaning.
- `pnpm test`, `pnpm typecheck`, `astro check`, `pnpm site:build` and `pnpm site:test` all pass before the push.

## Out of scope

- New pages, new interactive features, or copy changes beyond the headlines and labels above.
- Any change to the desktop app.
- Replacing the motion toggle or the theme mixer.
