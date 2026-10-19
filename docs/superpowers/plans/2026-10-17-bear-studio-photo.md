# Bear Studio and Bear Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bear Studio to Bear, with its first app, Bear Photo (a layered, Photoshop-style everyday photo editor), and ship Bear in three editions: Bear (everything), Bear Office and Bear Studio.

**Architecture:** `@bear/app-photo` is a new workspace package. Its document model, history, selections, blend modes, adjustments, filters, brush engine and file formats are plain TypeScript over RGBA byte buffers, all unit-tested in Node. A WebGL2 compositor draws the view and live adjustment previews; a CPU compositor using the same blend maths is the fallback and the source of exported pixels. Editions come from one `BEAR_EDITION` build setting, read by `@bear/core` (which apps exist), electron-vite (compile-time constant) and a JS electron-builder config (installer identity).

**Tech Stack:** TypeScript, React 18, Electron 38 + electron-vite, WebGL2, Web Workers, ag-psd (MIT), fast-png (MIT), jszip, Vitest, Playwright, Astro (site), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-17-bear-studio-photo-design.md`

## Global Constraints

- Work on branch `feat/studio-photo` in a worktree created from **`origin/main`** (not local `main`, which has diverged and lacks `apps/site` and the current `release.yml`). Cherry-pick the spec commit `bc9bfb4` and this plan's commit first. Never push local `main`.
- Licence stays MIT: no GPL/LGPL/AGPL dependencies. Allowed new deps: `ag-psd`, `fast-png` (both MIT).
- Original names and artwork only. Never "Adobe", "Photoshop" or Adobe icons in UI, code identifiers, file names or site copy. The one exception: "Adobe" may appear in the site's independence disclaimer (Bear is not affiliated with Adobe). Format names (".psd") are fine.
- Names: suite **Bear Studio**; app **Photo** (`id: 'photo'`, window title `<name> - Bear Photo`); future Studio apps Vector, PDF, Video, Motion, Audio, Layout (`ready: false`).
- Editions: `BEAR_EDITION = all | office | studio`, default `all`.
- The existing MSI `upgradeCode: 7DE83F53-2188-4823-80F3-8C5D58ABE5B8` and `appId: org.bearsuite.desktop` belong to the `all` edition forever. New fixed values: Office `org.bearsuite.office` / `3F6B2C1E-8A4D-4E57-9B21-5C0D7E9A4F13`; Studio `org.bearsuite.studio` / `A2C9E4B7-61F3-4D8A-B5E0-7F14C3D96E28`.
- Pixel format everywhere in the model: `Bitmap { width, height, data: Uint8ClampedArray }`, RGBA, **straight (non-premultiplied) alpha**, row-major.
- Limits: largest image 30,000 × 30,000; history 50 steps or 1 GiB (`1 << 30` bytes) of stored pixels, oldest dropped first; zoom 1%–3200%; pixel grid from 800%.
- On Windows every file save goes through `writeFileAtomic` (`apps/desktop/src/main/mail/atomic.ts`).
- Bump `version` in both root and `apps/desktop/package.json` before any installer the user will run.
- Verify with `pnpm test`, `pnpm typecheck` and `pnpm test:e2e` (set `BEAR_ELECTRON` to a separate electron.exe if `pnpm dev` is running).

## Review Focus

1. **Layer offset outside the canvas** (a layer moved partly off-image, or a .psd layer with negative `left/top`): compositing, merge down, export and saving must keep and place those pixels correctly, not crop or shift them. Test added in Tasks 4 and 9.
2. **Selection on an offset layer:** the mask is in document coordinates, the layer bitmap in layer coordinates; painting/filling/adjusting must apply the mask with the layer's `x/y` offset. Test added in Tasks 7 and 13.
3. **Undo after a structural change mixed with pixel edits** (paint, delete layer, undo, undo): the painted pixels must come back on the restored layer. Test added in Task 4.
4. **Locked or hidden active layer:** painting tools, fill, filters and adjustments must refuse (with a status message) instead of silently editing a locked layer or an invisible one. Test added in Task 13.
5. **Huge pasted or dropped image** (bigger than the document or above the size limit): it becomes a layer at its own size, or goes through the same "open scaled down" check, never a crash. Test added in Task 9.

---

### Task 1: Editions and the app registry in `@bear/core`

**Files:**
- Create: `packages/core/src/editions.ts`, `packages/core/src/editions.test.ts`
- Modify: `packages/core/src/apps.ts`, `packages/core/src/files.ts`, `packages/core/src/index.ts`, `packages/core/src/files.test.ts`

**Interfaces:**
- Produces:
  - `type Suite = 'office' | 'studio'`; `AppInfo.suite: Suite`
  - `AppId` gains `'photo' | 'vector' | 'pdf' | 'video' | 'motion' | 'audio' | 'layout'`
  - `type Edition = 'all' | 'office' | 'studio'`
  - `EDITIONS: Record<Edition, { productName: string; suites: Suite[] }>` = all → `Bear`, `['office','studio']`; office → `Bear Office`, `['office']`; studio → `Bear Studio`, `['studio']`
  - `setEdition(e: Edition): void`, `getEdition(): Edition` (module state, default `'all'`)
  - `parseEdition(value: string | undefined): Edition` (unknown/empty → `'all'`)
  - `enabledApps(): AppInfo[]` (APPS filtered by the current edition's suites, registry order)
  - `appForFile(path)` and `launchFiles(...)` only consider `enabledApps()`

- [ ] **Step 0: Create the worktree** `git worktree add .claude/worktrees/studio-photo -b feat/studio-photo origin/main`, then `git cherry-pick bc9bfb4 <plan commit>` inside it, then `pnpm install`.

- [ ] **Step 1: Write failing tests** in `editions.test.ts`:

```ts
afterEach(() => setEdition('all'))
test('parseEdition', () => {
  expect(parseEdition('studio')).toBe('studio')
  expect(parseEdition(undefined)).toBe('all')
  expect(parseEdition('nope')).toBe('all')
})
test('office edition hides Studio apps', () => {
  setEdition('office')
  expect(enabledApps().some((a) => a.suite === 'studio')).toBe(false)
  expect(appForFile('C:/a/photo.psd')).toBeNull()
  expect(appForFile('C:/a/b.docx')).toBe('write')
})
test('studio edition has only Studio apps', () => {
  setEdition('studio')
  expect(enabledApps().every((a) => a.suite === 'studio')).toBe(true)
  expect(appForFile('/x/y.bearphoto')).toBe('photo')
  expect(appForFile('/x/y.docx')).toBeNull()
})
test('all edition opens both', () => {
  expect(appForFile('/x/y.PNG')).toBe('photo')
  expect(appForFile('/x/y.xlsx')).toBe('sheets')
})
test('photo registry entry', () => {
  expect(getApp('photo')).toMatchObject({ name: 'Photo', tagline: 'Photo editing', suite: 'studio', ready: true,
    extensions: ['bearphoto', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] })
})
```

- [ ] **Step 2: Run** `pnpm vitest run packages/core` — expect FAIL (`setEdition` not exported).
- [ ] **Step 3: Implement.** Add `suite` to every existing entry (`'office'`). Add Photo (colour `#9333ea`) and the six Studio `ready: false` entries (Vector "Vector graphics", PDF "PDF documents", Video "Video editing", Motion "Motion graphics", Audio "Audio editing", Layout "Page layout"), each with its own distinct colour not used by an office app. GIF/BMP/AVIF are in Photo's `extensions` so they open; saving them is blocked later by Photo's `savable` set.
- [ ] **Step 4: Run** `pnpm vitest run packages/core` — expect PASS, existing files tests too.
- [ ] **Step 5: Commit** `feat(core): editions and Bear Studio app registry`.

### Task 2: Edition wiring in the desktop app, shared data folder, atomic saves, Studio launcher row

**Files:**
- Modify: `apps/desktop/electron.vite.config.ts`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/renderer/main.tsx`, `apps/desktop/src/renderer/Launcher.tsx`, `apps/mobile/src/main.tsx`
- Create: `apps/desktop/src/env.d.ts` (declares `const __BEAR_EDITION__: string`)
- Test: `e2e/editions.spec.ts`

**Interfaces:**
- Consumes: `parseEdition`, `setEdition`, `enabledApps`, `EDITIONS` (Task 1)
- Produces: `__BEAR_EDITION__` compile-time constant in main, preload and renderer; launcher sections with `data-testid="suite-office"` / `"suite-studio"`; app tiles keep their existing selectors.

- [ ] **Step 1: Write failing e2e test** `e2e/editions.spec.ts`: launch the default build; expect `[data-testid=suite-office]` and `[data-testid=suite-studio]` visible, the Studio section headed "Bear Studio" containing "Photo" and "Vector" (coming soon). Second test is `test.skip(!process.env.BEAR_EDITION_BUILD, …)`: when the app was built with `BEAR_EDITION=studio`, only `suite-studio` exists.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/editions.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
  - Vite `define: { __BEAR_EDITION__: JSON.stringify(process.env.BEAR_EDITION ?? 'all') }` in all three electron-vite sections.
  - Main: `setEdition(parseEdition(__BEAR_EDITION__))` first thing. Before `app.whenReady`, unless `app.commandLine.hasSwitch('user-data-dir')`, call `app.setPath('userData', join(app.getPath('appData'), 'Bear'))`, so all editions share Bear's folder (a no-op for the `all` edition).
  - `file:save` handler: replace `fs.writeFile` with `writeFileAtomic(path, data)`.
  - Renderer `main.tsx`: `setEdition(parseEdition(__BEAR_EDITION__))` before render. Mobile `main.tsx`: `setEdition('office')`.
  - Launcher: group `enabledApps()` by suite into sections; the office section keeps today's look, and the Studio section's heading is "Bear Studio". `OPEN_ALL` uses `enabledApps()`. The "can't be opened" message becomes `${file.name} can't be opened in ${EDITIONS[getEdition()].productName} yet.`
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm test:e2e e2e/editions.spec.ts e2e/launch.spec.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): edition build setting, shared data folder, Bear Studio row`.

### Task 3: Per-edition installer configuration

**Files:**
- Create: `apps/desktop/build-config/editions.cjs`, `apps/desktop/electron-builder.config.cjs`, `apps/desktop/src/main/build-editions.test.ts`
- Delete: `apps/desktop/electron-builder.yml` (its contents move into `editions.cjs` as the base object, comments kept)
- Modify: `apps/desktop/package.json` (every `build:*` script uses `--config electron-builder.config.cjs`)

**Interfaces:**
- Produces: `builderConfig(edition: 'all'|'office'|'studio'): object` exported from `editions.cjs`; `electron-builder.config.cjs` = `module.exports = builderConfig(process.env.BEAR_EDITION || 'all')`.

- [ ] **Step 1: Write failing test** `build-editions.test.ts` (imports the cjs with `createRequire`):

```ts
const all = builderConfig('all'), office = builderConfig('office'), studio = builderConfig('studio')
expect(all.appId).toBe('org.bearsuite.desktop')
expect(all.msi.upgradeCode).toBe('7DE83F53-2188-4823-80F3-8C5D58ABE5B8')
expect(office).toMatchObject({ appId: 'org.bearsuite.office', productName: 'Bear Office', msi: { upgradeCode: '3F6B2C1E-8A4D-4E57-9B21-5C0D7E9A4F13' } })
expect(studio).toMatchObject({ appId: 'org.bearsuite.studio', productName: 'Bear Studio', msi: { upgradeCode: 'A2C9E4B7-61F3-4D8A-B5E0-7F14C3D96E28' } })
expect(all.nsis.artifactName).toBe('Bear-Setup-${version}.${ext}')
expect(studio.nsis.artifactName).toBe('Bear-Studio-Setup-${version}.${ext}')
expect(office.deb.artifactName).toBe('bear-office_${version}_${arch}.${ext}')
expect(studio.linux.executableName).toBe('bear-studio')
expect(exts(office)).toEqual(['docx', 'xlsx', 'pptx'])
expect(exts(studio)).toEqual(['bearphoto', 'psd'])
expect(exts(all)).toEqual(['docx', 'xlsx', 'pptx', 'bearphoto', 'psd'])
expect(builderConfig('all').extraMetadata).toBeUndefined()
expect(studio.extraMetadata).toEqual({ productName: 'Bear Studio' })
```

(`exts(c) = c.fileAssociations.map((f) => f.ext)`. PNG/JPG are deliberately not associated, so Bear never takes over the system image viewer.)

- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/src/main/build-editions.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `builderConfig`. Per edition: `appId`, `productName`, `msi.upgradeCode`, `nsis.shortcutName`/`uninstallDisplayName`/`msi.shortcutName` = productName, every `artifactName` prefixed `Bear-Office-`/`Bear-Studio-` (deb: `bear-office_`/`bear-studio_`), `linux.executableName` `bear-office`/`bear-studio`, flatpak appId if configured, `fileAssociations` filtered per suite (Studio entries: `bearphoto` "Bear Photo image", `psd` "Layered image", both role Editor). Office/Studio set `extraMetadata.productName`. `all` keeps every current value byte-for-byte. Linux `category`: Office edition `Office`, Studio `Graphics`, all `Office`.
- [ ] **Step 4: Run** the test, then `cd apps/desktop && BEAR_EDITION=studio pnpm build:dir` — expect `release/win-unpacked/Bear Studio.exe`; launch it and check the launcher shows only the Studio row.
- [ ] **Step 5: Commit** `build: per-edition electron-builder config`.

### Task 4: Photo package, bitmap, document model, editor and history

**Files:**
- Create: `packages/app-photo/package.json` (mirror `app-slides`; deps `@bear/core`, `@bear/ui`, `ag-psd`, `fast-png`, `jszip`, `lucide-react`), `packages/app-photo/src/index.ts`
- Create: `src/model/bitmap.ts`, `src/model/doc.ts`, `src/model/history.ts`, `src/model/editor.ts`, `src/model/model.test.ts`
- Modify: `apps/desktop/package.json` (add `@bear/app-photo` devDependency)

**Interfaces:**
- Produces:
  - `bitmap.ts`: `interface Rect { x; y; width; height }`, `type RGBA = [number, number, number, number]`, `createBitmap(w, h, fill?: RGBA): Bitmap`, `cloneBitmap(b)`, `readRect(b, r): Bitmap`, `writeRect(b, r, src: Bitmap)`, `unionRect(a, b)`, `intersectRect(a, b): Rect | null`
  - `doc.ts`: the spec's `PhotoDoc`/`Layer`, with `Layer.pixels: Bitmap` and `type BlendMode` (the spec's 16 modes, hyphenated, e.g. `'color-dodge'`). Functions: `createDoc(w, h, background: RGBA | 'transparent'): PhotoDoc` (one layer "Background"), `getLayer(doc, id)`, `activeLayer(doc)`, `layerBounds(layer): Rect`
  - `history.ts`: `interface Step { label: string; bytes: number; undo(): void; redo(): void }`, `class History { constructor(maxSteps = 50, maxBytes = 1 << 30); push(s: Step); undo(): boolean; redo(): boolean; canUndo; canRedo; steps: readonly Step[]; index: number; goTo(i: number) }`
  - `editor.ts`: `class PhotoEditor { doc: PhotoDoc; history: History; version: number; onChange?: (dirty: Rect | null) => void; editStructure(label: string, fn: (doc: PhotoDoc) => void): void; editPixels(label: string, layerId: string, rect: Rect, fn: (pixels: Bitmap) => void): void; addLayer(opts?: { name?: string; above?: string; pixels?: Bitmap; x?: number; y?: number; kind?: 'raster' | 'text'; text?: TextData }): Layer; duplicateLayer(id): Layer; deleteLayer(id): void; moveLayer(id, toIndex): void; setLayerProps(id, patch): void; resizeCanvas(w, h, anchor: 'tl'|'c'): void; setSelection(m: Mask | null): void }`. `editStructure` snapshots the layer array, layer props and doc size before and after (bitmaps by reference). `editPixels` stores `readRect` of `rect` before and after. Each bumps `version` and calls `onChange`.

- [ ] **Step 1: Write failing tests** in `model.test.ts`:
  - `createDoc(4, 3, [255,255,255,255])` has one layer "Background", 4×3, every pixel white.
  - `editPixels` then `undo` restores exact bytes, and `redo` reapplies them.
  - **Review focus 3:** paint layer A (editPixels), delete A, undo → A is back *with* the painted pixels; undo again → pixels gone.
  - Step cap: 51 pushes keep 50 and drop the oldest; byte cap: with `maxBytes = 100`, pushing steps of 60 bytes keeps only the newest.
  - `goTo(0)` after 3 steps undoes all 3; a new push after an undo drops the redo branch.
  - `deleteLayer` on the only layer throws `'A document needs at least one layer'`.
  - `moveLayer`, `setLayerProps` and `resizeCanvas` are each one undoable step.
- [ ] **Step 2: Run** `pnpm vitest run packages/app-photo` — expect FAIL.
- [ ] **Step 3: Implement** the four files. (`mergeDown` and `flatten` come in Task 5, once the compositor exists.)
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(photo): document model, editor and history`.

### Task 5: Blend modes and CPU compositor

**Files:**
- Create: `src/ops/blend.ts`, `src/ops/composite.ts`, `src/ops/blend.test.ts`
- Modify: `src/model/editor.ts` (add `mergeDown(id): void` and `flatten(): void`, each one history step), `src/model/model.test.ts`

**Interfaces:**
- Consumes: `PhotoEditor`, `Layer`, `Bitmap` (Task 4)
- Produces: `PhotoEditor.mergeDown(id)`, `PhotoEditor.flatten()`; `blendChannel(mode: BlendMode, cb: number, cs: number): number` (0..1 floats, separable modes); `blendPixel(mode, backdrop: [r,g,b], source: [r,g,b]): [r,g,b]` (all 16, non-separable modes by W3C Compositing Level 1 `SetLum/SetSat`); `compositeLayers(layers: Layer[], width, height, region?: Rect, opts?: { background?: RGBA }): Bitmap`, which applies visibility, opacity, offset and source-over with the W3C general formula `Cs' = (1 - αb)·Cs + αb·B(Cb, Cs)`.

- [ ] **Step 1: Write failing tests** with exact values (opaque layers, 8-bit, ±1):
  - multiply (200,100,50) over (100,200,250) → (78,78,49)
  - screen same inputs → (222,222,251)
  - normal at opacity 0.5: (200,100,50) over (100,200,250) → (150,150,150)
  - difference (10,200,30) over (250,50,30) → (240,150,0)
  - hue: source pure red over mid gray (128,128,128) → (128,128,128) (gray has no saturation); color: red over (128,128,128) → luminance kept at 128 ±1
  - a source with α=0 leaves the backdrop unchanged for every mode; a hidden layer is skipped
  - `region` composite equals the same rect of a full composite
  - a layer at x=-2 contributes exactly its on-canvas part (Review focus 1)
  - in `model.test.ts`: `mergeDown` of a 50%-opacity normal layer (128,0,0,255) over (0,0,255,255) gives `(64,0,128,255)` ±1 and leaves one layer; **Review focus 1:** a layer at `x: -2, y: -1` merged onto the background keeps only on-canvas pixels at the right place, and merging onto a smaller offset layer grows the result to the union of both bounds; `flatten` then undo restores every layer
- [ ] **Step 2: Run** `pnpm vitest run packages/app-photo/src/ops/blend.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(photo): blend modes and CPU compositor`.

### Task 6: Selection masks

**Files:**
- Create: `src/model/mask.ts`, `src/model/mask.test.ts`

**Interfaces:**
- Produces: `interface Mask { width; height; data: Uint8Array }`; `type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect'`; `rectMask(w, h, r: Rect)`, `ellipseMask(w, h, r: Rect)` (anti-aliased edge), `polygonMask(w, h, pts: [number, number][])` (even-odd, anti-aliased by 4× supersampling), `wandMask(src: Bitmap, x, y, tolerance: number /*0..255*/, contiguous: boolean, offset?: {x, y}, docSize?: {w, h})`, `combineMask(current: Mask | null, next: Mask, mode: SelectMode): Mask | null`, `featherMask(m, radius)`, `invertMask(m)`, `maskBounds(m): Rect | null`, `traceEdges(m): [number, number][][]` (closed outlines along the 50% threshold), `maskValueAt(m | null, x, y): number` (null mask → 255)

- [ ] **Step 1: Write failing tests:**
  - `rectMask(10,10,{x:2,y:2,width:3,height:3})` has exactly 9 cells at 255 and the rest 0
  - add of two disjoint rects = 18 selected; subtract of an inner rect leaves a ring; intersect of disjoint rects → `null`
  - `ellipseMask` of a 10×10 circle is symmetric and has partial values only on the edge
  - wand: left half (200,0,0), right half (210,0,0); tolerance 5 from (0,0) selects 50%; tolerance 20 selects 100%; two separate red squares on white with `contiguous:false` selects both, with `true` one
  - `featherMask` of a hard rect by 2 px makes edge cells between 1 and 254 and keeps the centre at 255
  - `traceEdges` of a 3×3 rect returns one closed loop around it
- [ ] **Step 2: Run** — FAIL. **Step 3:** Implement (wand uses a scanline flood fill; tolerance is the max per-channel difference including alpha). **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat(photo): selection masks`.

### Task 7: Adjustments

**Files:**
- Create: `src/ops/adjust.ts`, `src/ops/adjust.test.ts`

**Interfaces:**
- Consumes: `Mask`, `maskValueAt` (Task 6)
- Produces: `curvesLut(points: [number, number][]): Uint8Array` (monotone cubic, Fritsch–Carlson); `levelsLut(p: { inBlack; inWhite; gamma; outBlack; outWhite }): Uint8Array`; `applyLut(b, lut, mask?, offset?)`; `brightnessContrast(b, p: { brightness: number /*-100..100*/; contrast: number /*-100..100*/ }, mask?, offset?)`; `hueSaturation(b, p: { hue: number /*-180..180*/; saturation: number /*-100..100*/; lightness: number /*-100..100*/ }, mask?, offset?)`; `invert(b, mask?, offset?)`; `blackAndWhite(b, mask?, offset?)` (Rec. 709 luma). All mutate `b` in place and leave alpha alone. `offset` is the layer's `{x, y}` so the document-space mask lines up.

Brightness/contrast formula (fixed): `B = brightness·2.55`, `C = contrast·2.55`, `f = 259·(C+255) / (255·(259−C))`, `out = clamp(f·(v−128) + 128 + B)`.

Masked result: `out = in + (adjusted − in)·m/255`.

- [ ] **Step 1: Write failing tests:**
  - `curvesLut([[0,0],[255,255]])` is the identity; `levelsLut({inBlack:0,inWhite:255,gamma:1,outBlack:0,outWhite:255})` is the identity; `inWhite:128` maps 128→255 and 64→128 ±1
  - `invert` 10→245; brightness 100 on 100 → 255; brightness 0 / contrast 0 identity
  - hue +180 on (255,0,0) → (0,255,255); saturation −100 on (255,0,0) → gray at its lightness, all channels equal
  - mask: a pixel under mask 0 is unchanged, 255 is fully changed, 128 is halfway ±1
  - **Review focus 2:** a layer at `{x: 5, y: 0}` with a mask selecting doc column 5 changes only layer column 0
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(photo): adjustments`.

### Task 8: Filters and the filter worker

**Files:**
- Create: `src/ops/filters.ts`, `src/ops/filters.test.ts`, `src/ops/filters.worker.ts`, `src/ops/runFilter.ts`

**Interfaces:**
- Produces: `type FilterId = 'gaussian' | 'box' | 'motion' | 'sharpen' | 'unsharp' | 'noise' | 'pixelate'`; `applyFilter(id: FilterId, b: Bitmap, params: Record<string, number>, mask?, offset?): Bitmap` (returns a new bitmap; params: gaussian `{radius}`, box `{radius}`, motion `{angle, distance}`, sharpen `{amount}`, unsharp `{amount, radius, threshold}`, noise `{amount, seed, mono}`, pixelate `{size}`); `runFilter(id, b, params, mask?, offset?): Promise<Bitmap>`, which posts to `filters.worker.ts` and rejects with `Error('The filter stopped unexpectedly')` on worker `error`/`messageerror`, and terminates the worker after.
- Blurs premultiply alpha before filtering and un-premultiply after; gaussian is separable (three box passes are acceptable); noise uses a seeded mulberry32.

- [ ] **Step 1: Write failing tests:**
  - every filter leaves a uniform opaque image unchanged (noise with amount 0 included)
  - gaussian radius 3 of one white pixel on black: total sum within 1% of 255·3, and symmetric about the centre
  - opaque red beside transparent, gaussian 2: every pixel with α>0 has rgb (255,0,0) ±1 (no dark halo)
  - pixelate 2 on a 2×2 of (0,100,200,255) values averages to one colour
  - noise same seed → identical bytes; different seed → different
  - masked filter: unmasked pixels unchanged
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). The worker is covered by e2e in Task 16.
- [ ] **Step 5: Commit** `feat(photo): filters and worker`.

### Task 9: Files: .bearphoto, .psd, export and size limits

**Files:**
- Create: `src/io/bearphoto.ts`, `src/io/psd.ts`, `src/io/png.ts`, `src/io/limits.ts`, `src/io/io.test.ts`, `src/io/fixtures/masked-layer.psd` (make it in the test setup with ag-psd, writing a layer with a `mask`, a `placedLayer` and `effects`, and commit the bytes)

**Interfaces:**
- Produces:
  - `png.ts`: `encodePng(b: Bitmap): Uint8Array`, `decodePng(bytes): Bitmap` (fast-png; 8-bit RGBA output, expands RGB/gray/palette)
  - `bearphoto.ts`: `writeBearPhoto(doc: PhotoDoc): Promise<Uint8Array>`, `readBearPhoto(bytes: Uint8Array): Promise<PhotoDoc>`. Zip layout: `document.json` `{ format: 'bearphoto', version: 1, width, height, activeLayerId, foreground, background, layers: [{ id, name, kind, visible, locked, opacity, blend, x, y, width, height, text? }] }`, `layers/<id>.png`, `preview.png` (flattened, longest side ≤ 512)
  - errors (exact text): not a zip / no document.json → `'This is not a Bear Photo file'`; `version > 1` → `'This file was made by a newer version of Bear. Update Bear to open it.'`; missing layer png → `` `The file is damaged: layer "${name}" is missing` ``
  - `psd.ts`: `readPsd(bytes): { doc: PhotoDoc; warnings: string[] }`, `writePsd(doc): Uint8Array` (ag-psd with `useImageData: true`; groups are flattened into the layer list in order; blend names map to ag-psd's `'color dodge'` style). Warnings, one each when present: `'Smart objects were opened as plain pixels'`, `'Layer effects were left out'`, `'Adjustment layers were left out'`, `'Layer masks were left out'`, `'Layer groups were ungrouped'`
  - `limits.ts`: `MAX_SIDE = 30000`; `checkOpenSize(w, h, budgetBytes: number): { ok: true } | { ok: false; reason: 'dimensions' | 'memory'; scale: number }` (memory estimate `w·h·4·3` bytes: layer + composite + one history copy; `scale` = the largest factor ≤ 1, to 3 decimals, that fits both limits); `memoryBudget(): number` = `(navigator.deviceMemory ?? 8) · 2^30 / 2`
- Export of flattened JPG/WebP and decoding of JPG/WebP/GIF/BMP/AVIF use the browser (`OffscreenCanvas.convertToBlob`, `createImageBitmap`) in `src/io/browser-image.ts`: `decodeImage(bytes, ext): Promise<Bitmap>`, `encodeImage(b, type: 'png' | 'jpeg' | 'webp', quality: number): Promise<Uint8Array>`. Covered by e2e only.

- [ ] **Step 1: Write failing tests:**
  - round trip: a doc with 3 layers (one text layer, one at x=-3 y=-2 [Review focus 1], one hidden multiply 0.4) → `writeBearPhoto` → `readBearPhoto` deep-equals the original, bytes included
  - each of the three errors above, with exact messages (truncate a valid file for "damaged")
  - psd round trip keeps names, visibility, opacity (±1/255), blend, offsets and pixels
  - the fixture psd opens with warnings containing the mask, smart-object and effects lines
  - `encodePng`/`decodePng` round trip is exact
  - `checkOpenSize(30001, 10, 1e12)` → `{ ok:false, reason:'dimensions', scale: 0.999 }` (rounded down); `checkOpenSize(10000, 10000, 600e6)` → `reason:'memory'` with `scale` such that `(10000·scale)²·12 ≤ 600e6`; `checkOpenSize(100, 100, 1e9)` → ok
  - **Review focus 5:** `prepareIncomingImage(w, h, budget)` in `limits.ts` (same return type as `checkOpenSize`, used for pasted and dropped images) gives `{ ok:false, reason:'dimensions', scale: 0.75 }` for 40000×100
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(photo): bearphoto, psd, png and size limits`.

### Task 10: WebGL2 compositor and Canvas 2D fallback

**Files:**
- Create: `src/render/compositor.ts` (interface), `src/render/gl/GlCompositor.ts`, `src/render/gl/shaders.ts`, `src/render/CpuCompositor.ts`, `src/render/tiles.ts`, `src/render/tiles.test.ts`, `src/render/view.ts`, `src/render/view.test.ts`

**Interfaces:**
- Consumes: `compositeLayers`, `blendPixel` maths (Task 5), adjustment params (Task 7)
- Produces:
  - `type Preview = { layerId: string } & ({ kind: 'lut'; lut: Uint8Array } | { kind: 'bc'; brightness: number; contrast: number } | { kind: 'hsl'; hue: number; saturation: number; lightness: number } | { kind: 'invert' } | { kind: 'bw' })`, plus an optional `mask`
  - `interface Compositor { syncLayer(layer: Layer, dirty?: Rect): void; dropLayer(id: string): void; render(doc: PhotoDoc, view: ViewState, preview?: Preview): void; dispose(): void; readonly kind: 'gl' | 'cpu' }`
  - `createCompositor(canvas: HTMLCanvasElement, onFallback: (reason: string) => void): Compositor` returns GL when `canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false })` works, otherwise CPU. On `webglcontextlost` it swaps in a CPU compositor and calls `onFallback('The graphics card stopped responding, so Photo switched to a slower drawing mode. Your work is safe.')`; on `webglcontextrestored` it rebuilds GL and re-syncs every layer.
  - `tiles.ts`: `tileRects(w, h, maxSize): Rect[]` covering the area exactly with no overlap
  - `view.ts`: `interface ViewState { zoom: number; panX: number; panY: number; viewW: number; viewH: number }`, `docToScreen`, `screenToDoc`, `zoomAt(view, factor, screenX, screenY): ViewState` (clamped to 0.01–32, the point under the cursor stays put), `fitView(docW, docH, viewW, viewH): ViewState`
  - GLSL: one fragment shader with a `uniform int u_mode` switch implementing the same 16 formulas as `blend.ts` (keep the two files' mode order identical; comment both). Layers ping-pong between two framebuffers. Checkerboard, 8 px light/dark squares in screen space. Pixel grid lines when zoom ≥ 8.
- [ ] **Step 1: Write failing tests:** `tileRects(10000, 300, 4096)` → 3 rects whose areas sum to 3,000,000 with no overlap; `zoomAt` keeps the doc point under (200,150) fixed and clamps at 32 and 0.01; `screenToDoc(docToScreen(p)) ≈ p`; `fitView` of 4000×2000 into 800×600 → zoom 0.2 and centred.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). GL output is proved against the CPU in Task 16.
- [ ] **Step 5: Commit** `feat(photo): WebGL2 compositor with CPU fallback`.

### Task 11: Photo app shell, file handling, recovery

**Files:**
- Create: `src/PhotoApp.tsx`, `src/usePhotoEditor.ts`, `src/PhotoRibbon.tsx`, `src/Toolbox.tsx`, `src/OptionsBar.tsx`, `src/CanvasView.tsx`, `src/panels/LayersPanel.tsx`, `src/panels/HistoryPanel.tsx`, `src/panels/ColorPanel.tsx`, `src/NewImageDialog.tsx`, `src/file-io.ts`, `src/recovery.ts`, `src/recovery.test.ts`
- Modify: `src/index.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/Launcher.tsx` (Photo tile opens `{ app: 'photo', input: { kind: 'new' } }`), `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `packages/core/src/bridge.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–10; `useDocumentFile` (`@bear/ui`)
- Produces:
  - `export function PhotoApp(props: { input: PhotoInput; onHome: () => void })`; `type PhotoInput = { kind: 'new' } | { kind: 'file'; file: OpenedFile }`
  - `usePhotoEditor(): { editor: PhotoEditor; version: number; tool: ToolId; setTool; colors; setColors; view; setView }`
  - `file-io.ts`: `loadPhotoFile(file: OpenedFile, budget: number): Promise<{ doc: PhotoDoc; warnings: string[] } | { needsScale: number; reason }>` and `serializePhoto(doc, path): Promise<Uint8Array>` by extension (`bearphoto`, `psd`, `png`, `jpg`/`jpeg`, `webp`). `savable = new Set(['bearphoto', 'psd'])`; saving a multi-layer doc to png/jpg/webp first shows "Saving as <EXT> flattens your layers into one. Keep a .bearphoto copy to edit layers later." with Flatten and save / Cancel.
  - Bridge: `window.bear.recovery: { write(name: string, data: Uint8Array): Promise<void>; list(): Promise<{ name: string; savedAt: number }[]>; read(name: string): Promise<Uint8Array>; remove(name: string): Promise<void> }`, backed in main by `userData/recovery/<name>`, names matching `/^[a-z0-9-]{1,64}\.bearphoto$/`, writes through `writeFileAtomic`
  - `recovery.ts`: `recoveryName(sessionId: string): string`, `shouldWriteRecovery(dirty: boolean, lastWrite: number, now: number): boolean` (dirty and ≥ 60 s since the last write)
  - test ids: `photo-canvas`, `layer-row` (with `data-name`), `history-row`, `tool-<id>`, `photo-notice`
- [ ] **Step 1: Write failing tests** `recovery.test.ts`: `shouldWriteRecovery(false, 0, 1e9)` false; `(true, 0, 59_999)` false; `(true, 0, 60_000)` true; `recoveryName('ab12')` → `'photo-ab12.bearphoto'`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the shell to the spec's §1 layout: ribbon tabs Home/Image/Adjust/Filters/View with `Ribbon`/`RibbonGroup` as `SlidesRibbon.tsx` does; accent `getApp('photo').color`. Canvas view: wheel pans, Ctrl+wheel zooms through `zoomAt`, status bar shows zoom %, `W × H px`, cursor doc position. Layers panel: thumbnail (64 px from the CPU composite of that one layer), eye, lock, opacity slider, blend select, drag reorder, add/duplicate/delete/merge down buttons, all via `PhotoEditor`. History panel lists `history.steps` (first row "Open" or "New") and calls `goTo`. Colour panel: two swatches, X swaps, D resets to black/white, native `<input type=color>`. New Image dialog presets: Screen 1920×1080, A4 2480×3508, Square 1080×1080, Custom, From clipboard (`navigator.clipboard.read()` image → doc of its size), background white/transparent. Opening runs `checkOpenSize`; if too big, offer "Open at N%" (bilinear downscale) or Cancel. PSD warnings and GL fallback text show in a dismissible `photo-notice` bar. Drop/paste an image: no doc yet → open it; else `prepareIncomingImage` then `addLayer` centred. Recovery: on mount, list recoveries; if any, offer "Photo closed unexpectedly. Restore <time>?" Restore/Discard. Write every 60 s while dirty; remove after a successful save, on discard and on a clean close. Route `photo` in `App.tsx` (lazy import like the others; `openFile` routes `appForFile === 'photo'`).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; then `pnpm dev`, open Photo, create a new image and check the layout matches §1.
- [ ] **Step 5: Commit** `feat(photo): app shell, files and crash recovery`.

### Task 12: Tool framework and navigation/selection tools

**Files:**
- Create: `src/tools/types.ts`, `src/tools/index.ts`, `src/tools/move.ts`, `marquee.ts`, `lasso.ts`, `wand.ts`, `crop.ts`, `eyedropper.ts`, `hand.ts`, `zoom.ts`, `src/tools/testing.ts` (fake context), `src/tools/tools-select.test.ts`
- Modify: `src/CanvasView.tsx`, `src/Toolbox.tsx`, `src/OptionsBar.tsx`

**Interfaces:**
- Produces:
  - `type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'eraser' | 'fill' | 'gradient' | 'eyedropper' | 'text' | 'shape' | 'hand' | 'zoom'`
  - `interface ToolPointer { x: number; y: number /* doc coords, float */; sx: number; sy: number /* screen */; shift: boolean; alt: boolean; ctrl: boolean; pressure: number | null }`
  - `interface ToolContext { editor: PhotoEditor; options: Record<string, unknown>; colors: { fg: RGBA; bg: RGBA }; setColors(c): void; view: ViewState; setView(v): void; setOverlay(o: Overlay | null): void; status(msg: string): void; rasterizeText(t: TextData): Bitmap }`
  - `interface Tool { id: ToolId; key: string; cursor: string; options: OptionSpec[]; down(ctx, p): void; move(ctx, p): void; up(ctx, p): void; key?(ctx, e: KeyboardEvent): boolean }`; `type OptionSpec = { id: string; label: string } & ({ type: 'range'; min: number; max: number; step: number; default: number } | { type: 'select'; choices: string[]; default: string } | { type: 'toggle'; default: boolean })`
  - `TOOLS: Tool[]`, `toolForKey(key: string): ToolId | null` (the spec's key table; Shift+G toggles fill/gradient; holding Space selects Hand until released)
  - `type Overlay = { kind: 'marquee'; rect: Rect; ellipse: boolean } | { kind: 'path'; points: [number, number][] } | { kind: 'crop'; rect: Rect }`
- [ ] **Step 1: Write failing tests** (fake context, doc 20×20):
  - marquee drag (2,2)→(6,6): selection has 16 cells; then Shift + drag (10,10)→(12,12) adds 4 (20 total); Alt + drag over the first subtracts it
  - lasso polygon (0,0),(10,0),(10,10),(0,10) selects ≈100 cells ±10
  - wand click with tolerance 32 selects the clicked colour region only
  - move with a selection: the red 2×2 at (2,2) moves to (5,2) after drag (2,2)→(5,2), and the original spot becomes transparent; one history step "Move"
  - move without a selection changes `layer.x` by 3 and touches no pixels
  - arrow key nudges 1 px; Shift+arrow 10 px
  - crop to (5,5,10,10) + Enter: doc is 10×10, layers' `x/y` shift by −5; with "delete cropped" the bitmaps are trimmed too; undo restores 20×20
  - eyedropper at a (10,20,30,255) pixel sets `fg` to it; 3×3 sample averages
  - `toolForKey('b') === 'brush'`, `toolForKey('Z') === 'zoom'`
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(photo): tool framework and selection tools`.

### Task 13: Painting tools: brush, eraser, fill, gradient, shape, text

**Files:**
- Create: `src/model/brush.ts`, `src/model/brush.test.ts`, `src/tools/brush.ts`, `eraser.ts`, `fill.ts`, `gradient.ts`, `shape.ts`, `text.ts`, `src/tools/tools-paint.test.ts`, `src/render/rasterizeText.ts`

**Interfaces:**
- Consumes: `Mask`/`maskValueAt`, `ellipseMask`, `polygonMask`, `PhotoEditor.editPixels`
- Produces:
  - `brushDab(size: number, hardness: number /*0..1*/): { size: number; alpha: Float32Array }`
  - `stampPoints(from: [x, y], to: [x, y], spacing: number /*px*/, carry: number): { points: [number, number][]; carry: number }`
  - `class Stroke { constructor(target: Bitmap, opts: { size; hardness; opacity; flow; color: RGBA; erase: boolean; mask: Mask | null; offset: { x; y } }); add(x: number, y: number, pressure: number | null): Rect | null; end(): Rect | null }`. Keeps a copy of the touched area as it was and a per-pixel coverage buffer (`cov = cov + (1 − cov)·dab·flow`). Each pixel is recomputed as `original ⊕ color at alpha cov·opacity·mask`, so overlapping dabs never pass the stroke's opacity. Pressure scales size. Brush/eraser tools wrap one `Stroke` per drag in a single `editPixels` step covering the union of dirty rects.
  - `rasterizeText(t: TextData): Bitmap` (OffscreenCanvas 2D `fillText`, then `getImageData`); `interface TextData { text: string; font: string; size: number; color: RGBA; align: 'left' | 'center' | 'right' }`
- [ ] **Step 1: Write failing tests:**
  - `brushDab(9, 1)`: centre 1, corners 0; `brushDab(9, 0)`: alpha decreasing outwards
  - `stampPoints([0,0],[10,0], 2, 0)` gives x = 0,2,4,6,8,10; carry continues spacing across calls
  - stroke opacity 0.5 over 20 overlapping dabs: max painted alpha ≤ 128 (no build-up)
  - eraser at opacity 1 makes painted pixels α=0
  - a stroke ends as exactly one history step, and undo restores the bytes
  - fill contiguous on a white image with a black line fills one side only; with a selection it stays inside it
  - linear gradient (0,0)→(19,0) black→white: x=0 is 0, x=19 is 255, x=10 ≈ 134 ±3
  - shape rectangle 4×4 with fill and 1 px stroke: correct counts of fill and stroke pixels
  - **Review focus 2:** brush on a layer at x=5 with a selection at doc x 5–9 paints layer x 0–4 only
  - **Review focus 4:** brush, fill and gradient on a locked layer leave pixels unchanged and call `status('This layer is locked')`; on a hidden layer `status('This layer is hidden')`
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). The text tool: click places an editable box (contentEditable overlay); commit creates/updates a `kind: 'text'` layer with `text` data and `rasterizeText` pixels; double-clicking a text layer reopens the box.
- [ ] **Step 5: Commit** `feat(photo): painting, fill, gradient, shape and text tools`.

### Task 14: Adjustment and filter dialogs, Image menu commands

**Files:**
- Create: `src/dialogs/AdjustDialog.tsx`, `src/dialogs/FilterDialog.tsx`, `src/dialogs/CurvesEditor.tsx`, `src/dialogs/ImageSizeDialog.tsx`, `src/ops/resample.ts`, `src/ops/resample.test.ts`, `src/ops/transform.ts`, `src/ops/transform.test.ts`
- Modify: `src/PhotoRibbon.tsx`

**Interfaces:**
- Consumes: `Compositor.render(..., preview)`, `applyLut` and the other adjustments, `runFilter`
- Produces: `resample(b: Bitmap, w: number, h: number, method: 'bilinear' | 'nearest'): Bitmap`; `rotate90(b, turns: 1 | 2 | 3): Bitmap`, `flip(b, axis: 'h' | 'v'): Bitmap`, `trimBounds(b): Rect | null` (non-transparent bounds); editor commands `resizeImage(w, h)`, `rotateDoc(turns)`, `flipDoc(axis)`, `trim()` added to `PhotoEditor` as single history steps.
- [ ] **Step 1: Write failing tests:** `resample` 2×2→4×4 bilinear keeps corner values; nearest 1×1→3×3 copies; `rotate90` of a 2×1 [A,B] with 1 turn gives a 1×2 [A;B]; `flip('h')` twice is the identity; `trimBounds` of a transparent image with one opaque pixel at (3,4) → `{x:3,y:4,width:1,height:1}`.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Dialogs: adjustment sliders drive a GL `Preview` (no pixel changes until Apply; Cancel clears the preview). Apply runs the CPU op through `editPixels` on the active layer, honouring the selection. Filter dialog: 150 ms debounced `runFilter` on the active layer's bitmap, shown by swapping the layer's pixels temporarily (no history); Apply commits one step; Cancel restores. A `runFilter` rejection shows `'The filter stopped unexpectedly. Your image wasn't changed.'` and restores the pixels. Locked or hidden layers: Apply is disabled and the dialog shows the Task 13 status text.
- [ ] **Step 5: Commit** `feat(photo): adjustment and filter dialogs, image commands`.

### Task 15: Keyboard, clipboard and polish

**Files:**
- Modify: `src/PhotoApp.tsx`, `src/CanvasView.tsx`
- Create: `src/shortcuts.ts`, `src/shortcuts.test.ts`

**Interfaces:**
- Produces: `shortcutFor(e: { key: string; ctrl: boolean; shift: boolean; alt: boolean }): Command | null` where `type Command = 'undo' | 'redo' | 'selectAll' | 'deselect' | 'invertSelection' | 'copy' | 'cut' | 'paste' | 'delete' | 'zoomIn' | 'zoomOut' | 'fit' | 'actual' | 'swapColors' | 'resetColors' | 'brushSmaller' | 'brushBigger' | 'save' | 'saveAs' | 'open' | 'new'`
- [ ] **Step 1: Write failing tests:** Ctrl+Z undo; Ctrl+Shift+Z and Ctrl+Y redo; Ctrl+A, Ctrl+D, Ctrl+Shift+I; Ctrl+0 fit; Ctrl+1 actual; Ctrl+= / Ctrl+- zoom; X swap; D reset; `[` / `]` size; Delete clears the selection on the active layer.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Copy writes the selected area of the active layer to the clipboard as PNG (`navigator.clipboard.write`); cut also clears it; paste goes through the Task 11 incoming-image path.
- [ ] **Step 5: Commit** `feat(photo): shortcuts and clipboard`.

### Task 16: End-to-end tests

**Files:**
- Create: `e2e/photo.spec.ts`, `e2e/fixtures/photo/` (generated in `beforeAll` with `writeBearPhoto`/`writePsd` imported from `packages/app-photo/src/io`)

- [ ] **Step 1: Write the tests:**
  - **Workflow:** open Photo from the Studio row → New, Screen preset → brush stroke across the canvas → add a layer → Filters › Gaussian blur radius 4 → Apply → Ctrl+Z → save as `.bearphoto` (`stubSaveDialog`) → close and reopen the file → the History panel starts at "Open", two `layer-row`s, and the decoded file's flattened pixels equal the pre-save canvas readback within ±2 per channel.
  - **Blend modes, GL vs CPU:** for each of the 16 modes a 64×64 fixture (opaque gradient background + a 50% source layer in that mode), opened at 100% zoom; read `photo-canvas` pixels for the image area via `page.evaluate` (`preserveDrawingBuffer` is on) and compare with `compositeLayers` in Node, ±2 per channel.
  - **PSD:** open the Task 9 fixture → layer names listed; `photo-notice` mentions layer masks.
  - **Export PNG:** export a 300×200 doc → file decodes to 300×200 with the expected corner pixel.
  - **Fallback:** launch with `--disable-gpu --disable-webgl`, open Photo → still draws, and the notice about slower drawing mode is visible once.
  - **Large image:** dropping a 40000×100 PNG offers "Open at" with a percentage.
  - **Worker crash:** `page.evaluate` sets a test hook `window.__bearPhotoBreakFilter = true` (read in `runFilter` only when that global is set), run a filter → the error text shows and pixels are unchanged.
  - **Recovery:** edit, wait for the recovery write (test hook shortens 60 s to 1 s when `window.__bearPhotoRecoveryMs` is set), kill the app, relaunch with the same profile → the restore prompt appears; Restore brings the edit back.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/photo.spec.ts` — fix until PASS. Then the full `pnpm test:e2e` to check nothing else broke.
- [ ] **Step 3: Commit** `test(photo): end-to-end coverage`.

### Task 17: Release pipeline for three editions

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Edit the workflow.** Add `edition: [all, office, studio]` to the build matrix (crossed with the existing three `include` rows, so 9 jobs; express this with `matrix: { os-target: [...], edition: [...] }` or a 9-row `include`). `env: BEAR_EDITION: ${{ matrix.edition }}` on the build step. Artifact name `bear-${{ matrix.target }}-${{ matrix.edition }}`. Run Typecheck and Unit tests only in the `all` jobs. Flatpak job: matrix over the three editions, same `continue-on-error`. Update the header comment's file list with the `Bear-Office-…`/`Bear-Studio-…` names. The release job is unchanged (it already merges `bear-*`).
- [ ] **Step 2: Prove it.** With the user's go-ahead, push the branch to `ci/release-dry-run` (`git push origin HEAD:ci/release-dry-run --force-with-lease`). Expect 9 build jobs + 3 flatpak jobs green and 3× the files. Read the status from the public run page, not by polling the API.
- [ ] **Step 3: Commit** `ci: build Bear, Bear Office and Bear Studio`.

### Task 18: Website and README

**Files:**
- Modify: `apps/site/src/lib/releases.ts`, `apps/site/src/lib/releases.test.ts`, `apps/site/src/components/PlatformCards.astro`, `apps/site/src/components/PlatformCards.render.test.ts`, `apps/site/src/pages/download.astro`, `apps/site/src/pages/index.astro` (or `components/home/FeatureBento.astro`), `apps/site/src/lib/tour.ts`, `apps/site/src/lib/appColors.ts`, `README.md`

**Interfaces:**
- Produces: `DownloadFile.edition: Edition` (`'all' | 'office' | 'studio'`); `classifyAsset` detects the edition from the name (`bear-office`/`bear-studio`, case-insensitive, else `all`) and still classifies kind/arch from the rest; `platformCards(release, edition: Edition = 'all')` only uses that edition's files.
- [ ] **Step 1: Write failing tests:** `classifyAsset('Bear-Studio-Setup-0.2.0.exe')` → kind exe, edition studio; `'bear-office_0.2.0_amd64.deb'` → deb, office; `'Bear-0.2.0-arm64.dmg'` → all; `platformCards(release, 'studio')` slots only hold studio files; render test: the Download page has an edition switcher with Everything (pressed by default), Office only, Studio only, and switching changes the Windows button's href to the Studio .exe.
- [ ] **Step 2–4:** Run `pnpm --filter site test` (FAIL), implement, run (PASS). The switcher is a segmented control (`role="radiogroup"`) that renders all three link sets and toggles `hidden`, remembered in `localStorage` under `bear-edition` (wrapped in try/catch). Without JS, "Everything" shows. Add Photo to the Tour grid and app colours, and a "Bear Studio" band on Home ("Creative apps, free forever. First up: Photo."). README: a Bear Studio table (Photo ✅ MVP; Vector, PDF, Video, Motion, Audio, Layout planned), a Photo features list, and a Downloads note about the three editions.
- [ ] **Step 5: Commit** `feat(site): edition switcher and Bear Studio`.

---

## Finish

- [ ] `pnpm typecheck && pnpm test && pnpm test:e2e && pnpm --filter site test` all pass.
- [ ] Bump versions to `0.2.0` in both package.json files.
- [ ] Use superpowers:finishing-a-development-branch. Ask before any push or tag.
