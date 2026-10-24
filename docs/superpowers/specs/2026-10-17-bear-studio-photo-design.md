# Bear Studio and Bear Photo: design

Date: 2026-10-17
Status: approved in conversation (written spec awaiting review)

## Goal

Start **Bear Studio**, a free, open-source set of creative apps that do what Adobe's apps do, inside the existing Bear codebase. The first app is **Bear Photo**, a layered photo editor for everyday editing (Photoshop-style, roughly Photopea's core).

Bear can then be downloaded as the whole suite or as either half on its own: **Bear** (everything), **Bear Office** or **Bear Studio**.

Success means:

- Photo can open a photo or .psd, edit it with layers, selections, painting, text, adjustments and filters, and save it as `.bearphoto`, `.psd`, PNG, JPG or WebP
- editing stays smooth on a 24-megapixel photo
- the release pipeline builds all three editions on Windows, macOS and Linux into one draft release
- the website's Download page lets people pick an edition

## Decisions

| Topic | Decision |
|---|---|
| Where it lives | Inside Bear: new `packages/app-*` packages, sharing `@bear/core` and `@bear/ui` |
| Names | Creative suite = **Bear Studio**. Apps get plain names like the office apps: Photo first; Vector, PDF, Video, Motion, Audio and Layout later |
| Branding | Original names, logos and icons only. Never Adobe's names, logos, icons or UI artwork. Compatibility with Adobe file formats is fine |
| First app | Photo (Photoshop-style), everyday editing level |
| Engine | Hybrid: **Canvas 2D for painting**, **WebGL2 for compositing, adjustment previews and view**, Canvas 2D compositor as fallback |
| PSD library | **ag-psd** (MIT) |
| Licence | Stays MIT. No GPL code or dependencies (rules out reusing GIMP, Inkscape and Krita code) |
| Editions | `BEAR_EDITION = all \| office \| studio`; three separately installable apps that share one data folder |

## Out of scope for the first version

Layer masks, adjustment layers, pen/vector paths, healing and clone tools, layer styles/effects, smart objects, 16-bit colour, CMYK, AI features (bring-your-own-key AI comes later, ArtCraft-style). The layer model leaves room for masks. Every other Studio app gets its own spec, plan and build cycle.

## 1. Fit in the suite and the interface

### Package and registry

- New package `packages/app-photo` (`@bear/app-photo`), laid out like `@bear/app-slides`. Depends on `@bear/core`, `@bear/ui`, `ag-psd`, `jszip`, `lucide-react`.
- `packages/core/src/apps.ts`: `AppInfo` gains `suite: 'office' | 'studio'`. All existing apps get `suite: 'office'`. Add:
  `{ id: 'photo', name: 'Photo', tagline: 'Photo editing', suite: 'studio', color: <new Studio colour>, extensions: ['bearphoto', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'], ready: true }`
- Future Studio apps (Vector, PDF, Video, Motion, Audio, Layout) are added with `ready: false` and show as "coming soon".
- `apps/desktop/src/renderer/App.tsx` routes `photo` to `<PhotoApp>`, the same way it routes Slides.
- Launcher: a second row titled **Bear Studio** below the office apps.
- Photo uses `useDocumentFile` from `@bear/ui` for save, open, AutoSave, recent files and the close prompt.

### Window layout

- **Title bar and ribbon** from `@bear/ui`, with these tabs:
  - **Home**: undo/redo, cut/copy/paste, crop, rotate 90°/180°, flip horizontal/vertical
  - **Image**: image size, canvas size, trim, flatten
  - **Adjust**: brightness/contrast, levels, curves, hue/saturation, invert, black & white
  - **Filters**: Gaussian blur, box blur, motion blur, sharpen, unsharp mask, add noise, pixelate
  - **View**: zoom in/out, fit to window, 100%, rulers, grid, canvas background (light/dark)
- **Toolbox** down the left side (section 3).
- **Options bar** below the ribbon showing the active tool's settings.
- **Right-hand panels**:
  - **Layers**: thumbnail, show/hide, lock, opacity, blend mode, drag to reorder, add, duplicate, delete, merge down
  - **History**: list of steps; click one to go back to it
  - **Colour**: foreground/background swatches, swap (X), reset (D), picker
- **Canvas** in the centre, on a checkerboard for transparency. Zoom 1% to 3200%; pixel grid lines from 800%.
- **Status bar**: zoom, document size in pixels, cursor position.

## 2. Engine

### Document model

Plain TypeScript in `src/model/`, with no React or DOM imports beyond `OffscreenCanvas`/`ImageData`, so it can be unit-tested.

```ts
interface PhotoDoc {
  width: number; height: number
  layers: Layer[]            // bottom to top
  activeLayerId: string
  selection: Mask | null     // null = nothing selected (whole image)
  foreground: RGBA; background: RGBA
}

interface Layer {
  id: string; name: string
  kind: 'raster' | 'text'
  visible: boolean; locked: boolean
  opacity: number            // 0..1
  blend: BlendMode           // normal, multiply, screen, overlay, darken, lighten,
                             // color-dodge, color-burn, hard-light, soft-light,
                             // difference, exclusion, hue, saturation, color, luminosity
  x: number; y: number       // offset of the layer's pixels
  pixels: OffscreenCanvas    // raster pixels (text layers: the drawn result)
  text?: TextData            // text, font, size, colour, alignment
}
```

`Mask` is a single-channel 8-bit image (`Uint8Array` + size) the size of the document.

### Painting

*Changed during planning:* layer pixels are plain RGBA byte buffers (`Bitmap`), not `OffscreenCanvas`, so painting, undo, filters and file round trips can all be unit-tested in Node. Brush, eraser, fill, gradient and shapes are written in TypeScript over those buffers. Canvas 2D is still used for text, for decoding and encoding JPG/WebP/GIF/BMP/AVIF, and for the fallback view.

- Each raster layer's pixels live in its own RGBA buffer.
- Brush and eraser strokes are stamps of a round brush placed along the smoothed pointer path, spaced by the spacing setting. Pen pressure changes size/opacity when the device reports it.
- A stroke paints onto a temporary stroke canvas, then is merged into the layer on pointer-up at the stroke's opacity, so overlapping stamps don't build up beyond that opacity.
- Fill, gradient, magic wand and eyedropper read and write the layer's `ImageData` directly.

### Compositing and view (WebGL2)

- Each layer is a GPU texture. Only layers whose pixels changed are re-uploaded, and only the changed rectangle (`texSubImage2D`).
- A shader per blend mode composites visible layers bottom to top into the view at the current zoom and pan, over the checkerboard.
- Adjustment previews run as shaders: curves and levels through a 256-entry lookup texture; hue/saturation and brightness/contrast as their own shaders.
- **Apply** runs the identical maths on the CPU (`src/ops/`) and writes the result into the layer, so saved files match the preview.
- Layers larger than the GPU's `MAX_TEXTURE_SIZE` are split into tiles.
- If WebGL2 is unavailable, or the context is lost and cannot come back, a Canvas 2D compositor (`globalCompositeOperation`) takes over.

### Selections

- Marquee (rectangle/ellipse), lasso (freehand/polygonal) and magic wand write into the selection mask.
- Modes: replace, add (Shift), subtract (Alt), intersect (Shift+Alt).
- Select All (Ctrl+A), Deselect (Ctrl+D), Invert (Ctrl+Shift+I), Feather.
- The marching-ants outline is traced from the mask's edge.
- Painting, fill, filters and adjustments only change pixels inside the mask, weighted by its value.

### Undo and history

- Each history step records the changed rectangle's pixels before and after, plus any layer setting or structure change (add, delete, reorder, rename, opacity, blend).
- Limit: 50 steps or about 1 GB of stored pixels, whichever comes first. The oldest steps are dropped first.

### Limits

- Largest image: 30,000 × 30,000 pixels, subject to available memory (section 5).

## 3. Tools and filters

### Tool shape

Each tool is one module in `src/tools/`:

```ts
interface Tool {
  id: ToolId; key: string; cursor: string
  options: ToolOptionsSchema          // drives the options bar
  onPointerDown(ctx, e): void
  onPointerMove(ctx, e): void
  onPointerUp(ctx, e): void
  onKey?(ctx, e): boolean
}
```

Tools change the document only through the model's edit functions, which record history. Adding a tool doesn't change any other file.

### Tool list

| Tool | Key | Settings / behaviour |
|---|---|---|
| Move | V | Move the selected area or the whole layer; arrow keys nudge 1 px, Shift+arrow 10 px |
| Marquee | M | Rectangle or ellipse; Shift keeps it square or circular; feather |
| Lasso | L | Freehand or polygonal |
| Magic wand | W | Tolerance, contiguous on/off, sample this layer or all layers |
| Crop | C | Drag handles, preset ratios (free, 1:1, 4:3, 16:9, original), Enter to apply, delete or hide cropped pixels |
| Brush | B | Size, hardness, opacity, flow, spacing; `[` and `]` change size |
| Eraser | E | Same settings as the brush; erases to transparent |
| Fill / Gradient | G | Fill: tolerance, contiguous. Gradient: linear or radial, foreground to background. Shift+G switches between them |
| Eyedropper | I | Sample 1×1, 3×3 or 5×5; this layer or the whole image |
| Text | T | Font, size, colour, alignment; click to place and type; double-click a text layer to edit it |
| Shape | U | Rectangle, ellipse or line; fill and stroke; drawn onto the active layer as pixels |
| Hand | H | Pan; holding Space switches to Hand temporarily |
| Zoom | Z | Click to zoom in, Alt-click to zoom out; Ctrl+wheel zooms anywhere |

### Filters and adjustments

- Every filter and adjustment is a pure function `(pixels: ImageData, params) => ImageData` in `src/ops/`.
- Each opens a small dialog with sliders, a live preview on the canvas, and Apply or Cancel.
- Filters run in a Web Worker so the window doesn't freeze. Blurs are split into horizontal and vertical passes.
- Only the selected area changes.

## 4. Files and editions

### File formats

| Format | Open | Save | Notes |
|---|---|---|---|
| `.bearphoto` | yes | yes | Zip: `document.json` (doc and layer properties, text-layer data), `layers/<id>.png`, `preview.png` thumbnail. Reopens exactly as saved. Saved through the atomic save helper |
| `.psd` | yes | yes (basic) | ag-psd. Keeps raster layers, names, visibility, opacity, blend modes and positions. Text layers open as pixels, keeping their text where the file includes it. Unsupported parts (smart objects, effects, adjustment layers, masks) are listed in a notice |
| PNG / JPG / WebP | yes | export, flattened | Export dialog: quality for JPG/WebP, optional scale. Saving a layered image as one of these warns that layers will be flattened |
| GIF / BMP / AVIF | yes | no | Open only, through the browser's built-in decoder |

- New-document presets: Screen 1920×1080, A4 at 300 dpi (2480×3508), Square 1080×1080, Custom, From clipboard.
- Paste or drop an image file: with no document open it opens as a new image; onto an open document it becomes a new layer.

### Editions

- Build setting `BEAR_EDITION`: `all` (default), `office`, `studio`.
- It is passed to the renderer build as a compile-time constant. `@bear/core` exposes `appsForEdition(edition)` and the launcher, router and "Open with" handling use it.
- `apps/desktop/electron-builder.yml` becomes the shared base. Per-edition files (`electron-builder.office.yml`, `electron-builder.studio.yml`) set `productName`, `appId`, MSI `upgradeCode` and `fileAssociations`:

| Edition | Product name | Apps | Identity |
|---|---|---|---|
| all | Bear | Office + Studio | Keeps the existing appId and MSI `upgradeCode` (must never change), so existing installs upgrade into the full suite |
| office | Bear Office | Office apps | New appId and new fixed upgradeCode |
| studio | Bear Studio | Studio apps | New appId and new fixed upgradeCode |

- All three editions use the same user data folder (`app.setPath('userData', …)` to Bear's existing folder), so settings, recent files and Mail data are shared.
- Version numbers are bumped in both package.json files for every release, as now.
- `.github/workflows/release.yml`: the build matrix gains an `edition` dimension (3 OS × 3 editions, parallel); Flatpak builds each edition too. Everything is uploaded to the single draft release. Artifact names include the edition (e.g. `Bear-Studio-Setup-<version>.exe`); the `all` edition keeps today's names.

### Website

- Download page: each platform card gets an edition switcher, **Everything** (default), **Office only**, **Studio only**, which changes its links to that edition's files from the latest release.
- Home and Tour gain a Bear Studio section introducing Photo.
- README's status table gains a Bear Studio section with Photo marked MVP.

## 5. Testing and error handling

### Unit tests (Vitest, `pnpm test`)

- Blend modes: the CPU implementation of each mode against known pixel results. The GPU shaders are checked against the CPU results by an end-to-end test that composites one test image with every blend mode in the real app and compares the pixels.
- Adjustments and filters: each pure function on small sample images, including curves/levels lookup tables, hue/saturation, blurs, sharpen, and noise with a fixed seed.
- Selections: replace/add/subtract/intersect, magic wand tolerance and contiguous mode, edits confined to the mask.
- History: undo/redo gives back the exact same pixels; the step and memory caps drop the oldest steps first.
- Files: `.bearphoto` save and reopen gives an identical document; a `.psd` written by Photo reopens with the same layer properties; flattened export equals the composited canvas; damaged or truncated files fail with a clear error.
- Editions: `appsForEdition` returns exactly the right apps and file types for each edition.

### End-to-end tests (Playwright on the real Electron app, `pnpm test:e2e`)

- Launch Photo from the Studio row; new image; paint a stroke; add a layer; run Gaussian blur; undo it; save `.bearphoto`; reopen; compare pixels with a reference image.
- Open a sample `.psd` fixture and check the layer list.
- Export PNG and check its size and pixels.
- Launch each edition build and check its launcher lists the right apps.
- Site: the Download page edition switcher links to the right files.

### Error handling

| Problem | What happens |
|---|---|
| WebGL2 unavailable or GPU context lost | Switch to the Canvas 2D compositor; re-upload textures if the context comes back; show a notice once. No work lost |
| Image too large or not enough memory | Checked before opening. Above 30,000 px or the memory estimate, offer to open it scaled down |
| Unsupported .psd parts | Open what is possible; list what didn't carry over |
| Save fails (disk full, file locked) | Atomic save leaves the original untouched; the error names the cause. *Found in planning:* Bear's `file:save` used a plain `fs.writeFile`, so it is switched to `writeFileAtomic` for every app |
| Filter worker crashes | Cancel the preview, keep the image unchanged, say so |
| Unexpected crash | *Found in planning:* Bear has no crash recovery yet, so Photo adds its own. While there are unsaved changes, a recovery copy is written to `userData/recovery/` every 60 seconds and offered on the next launch |

## Done means

- All unit and end-to-end tests above pass on Windows locally.
- The CI matrix builds all three editions on Windows, macOS and Linux (proved on the `ci/release-dry-run` branch before any tag).
- README and website list Bear Studio with Photo as MVP and offer the three editions.
