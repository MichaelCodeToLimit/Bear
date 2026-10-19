import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { assertTestFolder, close, launch, stubOpenDialog, stubSaveDialog } from './helpers'
import { readBearPhoto, writeBearPhoto } from '../packages/app-photo/src/io/bearphoto'
import { decodePng, encodePng } from '../packages/app-photo/src/io/png'
import { readPsd } from '../packages/app-photo/src/io/psd'
import { makeMaskedLayerPsd } from '../packages/app-photo/src/io/fixtures/makeFixturePsd'
import { compositeLayers } from '../packages/app-photo/src/ops/composite'
import { BLEND_MODES } from '../packages/app-photo/src/ops/blend'
import { createBitmap, type Bitmap, type Rect } from '../packages/app-photo/src/model/bitmap'
import { createLayer, type BlendMode, type PhotoDoc } from '../packages/app-photo/src/model/doc'

/*
 * How canvas pixels are compared with document pixels: the view (`window.__bearPhotoTest.view()`)
 * is in canvas backing-store pixels, which are device pixels (CSS size × devicePixelRatio), and a
 * document pixel (x, y) lands at canvas pixel (x·zoom + panX, y·zoom + panY). At 100% zoom with a
 * whole-pixel pan that is a plain offset, so the canvas is read back directly (preserveDrawingBuffer
 * is on) without any CSS or devicePixelRatio scaling; the readback covers the part of the document
 * that is on screen.
 */

test.describe.configure({ mode: 'serial' })

const TOLERANCE = 2
const BREAK_TEXT = 'The filter stopped unexpectedly'
const SLOW_DRAWING = 'slower drawing mode'

let fixtures: string
const blendFile = (mode: BlendMode) => join(fixtures, `blend-${mode}.bearphoto`)
const blendDocs = new Map<BlendMode, PhotoDoc>()

/** A 64×64 opaque gradient background with a 50% source layer in `mode` over it. */
function blendDoc(mode: BlendMode): PhotoDoc {
  const bg = createBitmap(64, 64)
  const src = createBitmap(64, 64)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4
      bg.data.set([x * 4, y * 4, 128 + ((x + y) & 63), 255], i)
      src.data.set([255 - y * 4, 40 + x * 3, (x * y) & 255, 255], i)
    }
  const background = createLayer('Background', bg)
  const source = createLayer(`Source ${mode}`, src, { blend: mode, opacity: 0.5 })
  return { width: 64, height: 64, layers: [background, source], activeLayerId: source.id, selection: null, foreground: [0, 0, 0, 255], background: [255, 255, 255, 255] }
}

test.beforeAll(async () => {
  fixtures = mkdtempSync(join(tmpdir(), 'bear-photo-fixtures-'))
  for (const mode of BLEND_MODES) {
    const doc = blendDoc(mode)
    blendDocs.set(mode, doc)
    writeFileSync(blendFile(mode), await writeBearPhoto(doc))
  }
  writeFileSync(join(fixtures, 'masked.psd'), makeMaskedLayerPsd())
  // Tiny on disk, but wider than the 30,000 px limit.
  writeFileSync(join(fixtures, 'wide.png'), encodePng(createBitmap(40000, 100, [10, 200, 30, 255])))
})

// ---------------------------------------------------------------------------------------------
// Page helpers

interface Hook {
  editor(): { doc: PhotoDoc }
  view(): { zoom: number; panX: number; panY: number; viewW: number; viewH: number }
}
declare global {
  interface Window {
    __bearPhotoTest?: Partial<Hook>
    __bearPhotoRecoveryMs?: number
    __bearPhotoBreakFilter?: boolean
  }
}

/** Open Photo from the Studio row, with the test hook in place. */
async function openPhoto(page: Page) {
  await page.evaluate(() => (window.__bearPhotoTest = {}))
  await page.getByTestId('suite-studio').getByRole('button', { name: /Photo/ }).click()
}

async function newImage(page: Page, size: 'Screen' | { width: number; height: number }) {
  const dlg = page.getByRole('dialog', { name: 'New image' })
  await expect(dlg).toBeVisible()
  if (size === 'Screen') await dlg.getByRole('radio', { name: /Screen/ }).click()
  else {
    await dlg.getByRole('radio', { name: /Custom/ }).click()
    await dlg.getByLabel('Width').fill(String(size.width))
    await dlg.getByLabel('Height').fill(String(size.height))
  }
  await dlg.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByTestId('layer-row')).toHaveCount(1)
}

const titleBar = (page: Page) => page.locator('header').first()
const historyRows = async (page: Page) => (await page.getByTestId('history-row').allInnerTexts()).map((s) => s.trim())
const currentRow = (page: Page) => page.locator('[data-testid=history-row][aria-current=step]')
const layerNames = (page: Page) => page.getByTestId('layer-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-name')))

/** Wait until the compositor has drawn the latest state (it draws once per animation frame). */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/** A checksum of every layer's bytes plus its geometry (for a document decoded in Node). */
function checksumOf(doc: Pick<PhotoDoc, 'width' | 'height' | 'layers'>): string {
  let sum = 0
  for (const l of doc.layers) {
    const d = l.pixels.data
    for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0
    sum = (sum * 31 + l.x * 7 + l.y * 13 + l.pixels.width) >>> 0
  }
  return `${doc.width}x${doc.height}:${doc.layers.length}:${sum}`
}

/** The same checksum of the open document, computed in the page through the test hook. */
const docChecksum = (page: Page) =>
  page.evaluate(() => {
    const doc = window.__bearPhotoTest!.editor!().doc
    let sum = 0
    for (const l of doc.layers) {
      const d = l.pixels.data
      for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0
      sum = (sum * 31 + l.x * 7 + l.y * 13 + l.pixels.width) >>> 0
    }
    return `${doc.width}x${doc.height}:${doc.layers.length}:${sum}`
  })

interface Readback {
  rect: Rect
  data: Uint8Array
}

/** Read back the on-screen part of the document from `photo-canvas`, at 100% zoom (see the note at the top). */
async function readCanvas(page: Page): Promise<Readback> {
  await settle(page)
  const r = await page.evaluate(() => {
    const hook = window.__bearPhotoTest!
    const v = hook.view!()
    const doc = hook.editor!().doc
    const c = document.querySelector<HTMLCanvasElement>('[data-testid=photo-canvas]')!
    if (v.zoom !== 1 || !Number.isInteger(v.panX) || !Number.isInteger(v.panY)) throw new Error(`not at 100%: ${JSON.stringify(v)}`)
    if (c.width !== v.viewW || c.height !== v.viewH) throw new Error(`canvas ${c.width}×${c.height} ≠ view ${v.viewW}×${v.viewH}`)
    const x0 = Math.max(0, -v.panX)
    const y0 = Math.max(0, -v.panY)
    const x1 = Math.min(doc.width, c.width - v.panX)
    const y1 = Math.min(doc.height, c.height - v.panY)
    const t = document.createElement('canvas')
    t.width = c.width
    t.height = c.height
    const g = t.getContext('2d')!
    g.drawImage(c, 0, 0)
    const px = g.getImageData(x0 + v.panX, y0 + v.panY, x1 - x0, y1 - y0).data
    let bin = ''
    for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000))
    return { rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, b64: btoa(bin) }
  })
  return { rect: r.rect, data: new Uint8Array(Buffer.from(r.b64, 'base64')) }
}

/** Largest per-channel difference between a readback and the same rect of `b` (a whole-document bitmap). */
function maxDiff(rb: Readback, b: Bitmap): number {
  let worst = 0
  const { x, y, width, height } = rb.rect
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const s = (j * width + i) * 4
      const d = ((y + j) * b.width + (x + i)) * 4
      for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(rb.data[s + k] - b.data[d + k]))
    }
  return worst
}

/** Wait until the view is the one a newly opened document gets: fitted, never above 100%, centred. */
async function waitForFit(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = window.__bearPhotoTest!.view!()
        const d = window.__bearPhotoTest!.editor!().doc
        const zoom = Math.min(1, v.viewW / d.width, v.viewH / d.height)
        return v.zoom === zoom && v.panX === Math.round((v.viewW - d.width * zoom) / 2) && v.panY === Math.round((v.viewH - d.height * zoom) / 2)
      })
    )
    .toBe(true)
}

/** The bottom layer's bytes in `rect` (document coordinates), as a readback, for one-layer documents. */
async function layerRegion(page: Page, rect: Rect): Promise<Readback> {
  const b64 = await page.evaluate((r) => {
    const l = window.__bearPhotoTest!.editor!().doc.layers[0]
    const out = new Uint8Array(r.width * r.height * 4)
    for (let y = 0; y < r.height; y++) out.set(l.pixels.data.subarray(((r.y + y) * l.pixels.width + r.x) * 4, ((r.y + y) * l.pixels.width + r.x + r.width) * 4), y * r.width * 4)
    let bin = ''
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000))
    return btoa(bin)
  }, rect)
  return { rect, data: new Uint8Array(Buffer.from(b64, 'base64')) }
}

function readbackDiff(a: Readback, b: Readback): number {
  let worst = 0
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]))
  return a.data.length === b.data.length ? worst : Infinity
}

const darkPixels = (rb: Readback) => {
  let n = 0
  for (let i = 0; i < rb.data.length; i += 4) if (rb.data[i] < 64) n++
  return n
}

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 8 })
  await page.mouse.move(x1, y1, { steps: 8 })
  await page.mouse.up()
}

const viewport = async (page: Page) => (await page.locator('[data-photo-viewport]').boundingBox())!

async function openGaussian(page: Page) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('button', { name: 'Gaussian blur', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Gaussian Blur' })
  await expect(dlg).toBeVisible()
  return dlg
}

// ---------------------------------------------------------------------------------------------
// One app for the workflow, file and filter tests

test.describe('Photo', () => {
  let app: ElectronApplication
  let page: Page
  let dir: string

  test.beforeAll(async () => {
    ;({ app, page, dir } = await launch())
  })
  test.afterAll(() => close(app))

  test('workflow: paint, layer, blur, undo, save and reopen', async () => {
    await openPhoto(page)
    await newImage(page, 'Screen')
    await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true')

    const box = await viewport(page)
    const cy = box.y + box.height / 2
    await drag(page, box.x + box.width * 0.15, cy, box.x + box.width * 0.85, cy)
    await expect(currentRow(page)).toHaveText('Brush')

    await page.getByRole('button', { name: 'New layer' }).click()
    await expect(page.getByTestId('layer-row')).toHaveCount(2)

    await page.keyboard.press('Control+1')
    await expect(page.getByTestId('photo-zoom')).toHaveText('100%')
    const before = await readCanvas(page)
    // The comparisons are only worth something if the stroke is in the part read back.
    expect(darkPixels(before)).toBeGreaterThan(100)

    // Blur the layer with the stroke (the new layer above it is empty).
    const background = page.locator('[data-testid=layer-row][data-name="Background"]')
    await background.getByText('Background', { exact: true }).click()
    await expect(background).toHaveAttribute('aria-selected', 'true')
    const dlg = await openGaussian(page)
    await page.getByTestId('dialog-slider-radius').fill('4')
    await dlg.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(currentRow(page)).toHaveText('Gaussian Blur')
    expect(await historyRows(page)).toEqual(['New', 'Brush', 'New Layer', 'Gaussian Blur'])
    const blurred = await readCanvas(page)
    expect(blurred.rect).toEqual(before.rect)
    expect(readbackDiff(blurred, before)).toBeGreaterThan(20)

    await page.keyboard.press('Control+z')
    await expect(currentRow(page)).toHaveText('New Layer')
    const undone = await readCanvas(page)
    expect(undone.rect).toEqual(before.rect)
    expect(readbackDiff(undone, before)).toBeLessThanOrEqual(TOLERANCE)

    const out = join(dir, 'workflow.bearphoto')
    await stubSaveDialog(app, out)
    await page.keyboard.press('Control+Shift+s')
    await expect.poll(() => existsSync(out)).toBe(true)
    await expect(titleBar(page)).toContainText(/workflow.*· Saved/)

    // Close (back to the launcher), then reopen the file.
    await page.getByTitle('Home').click()
    await expect(page.getByTestId('suite-studio')).toBeVisible()
    await stubOpenDialog(app, out)
    await page.keyboard.press('Control+o')
    await expect(page.getByTestId('layer-row')).toHaveCount(2)
    expect(await historyRows(page)).toEqual(['Open'])
    await expect(currentRow(page)).toHaveText('Open')

    const saved = await readBearPhoto(new Uint8Array(readFileSync(out)))
    expect(saved.layers.length).toBe(2)
    const flat = compositeLayers(saved.layers, saved.width, saved.height)
    expect(maxDiff(before, flat)).toBeLessThanOrEqual(TOLERANCE)
  })

  test('blend modes: GL canvas matches the CPU compositor', async () => {
    expect(BLEND_MODES.length).toBe(16)
    const results: Record<string, number> = {}
    const unlikeNormal: Record<string, number> = {}
    const normal = compositeLayers(blendDocs.get('normal')!.layers, 64, 64)
    for (const mode of BLEND_MODES) {
      await stubOpenDialog(app, blendFile(mode))
      await page.keyboard.press('Control+o')
      await expect(page.getByTestId('layer-row').first()).toHaveAttribute('data-name', `Source ${mode}`)
      await expect(page.getByTestId('photo-zoom')).toHaveText('100%')
      const doc = blendDocs.get(mode)!
      const expected = compositeLayers(doc.layers, 64, 64)
      await waitForFit(page)
      const rb = await readCanvas(page)
      results[mode] = maxDiff(rb, expected)
      // The mode must really be applied: every other mode looks clearly different from Normal here.
      if (mode !== 'normal') unlikeNormal[mode] = maxDiff(rb, normal)
    }
    const bad = Object.entries(results).filter(([, d]) => d > TOLERANCE)
    expect(bad, `max channel difference per mode: ${JSON.stringify(results)}`).toEqual([])
    const same = Object.entries(unlikeNormal).filter(([, d]) => d <= 10)
    expect(same, `difference from Normal per mode: ${JSON.stringify(unlikeNormal)}`).toEqual([])
  })

  test('PSD: layer names are listed and the notice mentions layer masks', async () => {
    const psd = join(fixtures, 'masked.psd')
    const expected = readPsd(new Uint8Array(readFileSync(psd))).doc.layers.map((l) => l.name).reverse()
    await stubOpenDialog(app, psd)
    await page.keyboard.press('Control+o')
    await expect(page.getByTestId('layer-row')).toHaveCount(expected.length)
    expect(await layerNames(page)).toEqual(expected)
    expect(expected).toEqual(expect.arrayContaining(['Base', 'Masked']))
    await expect(page.getByTestId('photo-notice')).toContainText(/layer masks/i)
    // Saving this .psd in place would lose the masks: AutoSave is off and says why.
    const toggle = titleBar(page).getByRole('switch')
    await expect(toggle).toBeDisabled()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(titleBar(page).locator('label', { hasText: 'AutoSave' })).toHaveAttribute('title', /AutoSave is off because saving this .psd would drop parts/)
  })

  test('export PNG: 300×200 with the expected corner pixel', async () => {
    await page.keyboard.press('Control+n')
    await newImage(page, { width: 300, height: 200 })
    await expect(page.getByText('300 × 200 px')).toBeVisible()
    await page.getByLabel('Foreground colour').fill('#3366cc')
    await page.getByTestId('tool-fill').click()
    const box = await viewport(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(currentRow(page)).toHaveText('Fill')

    const png = join(dir, 'export.png')
    await stubSaveDialog(app, png)
    await page.keyboard.press('Control+Shift+s')
    await expect.poll(() => existsSync(png)).toBe(true)
    await expect(titleBar(page)).toContainText(/export.*· Saved/)
    const b = decodePng(new Uint8Array(readFileSync(png)))
    expect([b.width, b.height]).toEqual([300, 200])
    expect(Array.from(b.data.subarray(0, 4))).toEqual([0x33, 0x66, 0xcc, 255])
    const last = (b.width * b.height - 1) * 4
    expect(Array.from(b.data.subarray(last, last + 4))).toEqual([0x33, 0x66, 0xcc, 255])
  })

  test('large image: dropping a 40000×100 PNG offers "Open at" a percentage', async () => {
    const b64 = readFileSync(join(fixtures, 'wide.png')).toString('base64')
    const layersBefore = await page.getByTestId('layer-row').count()
    await page.locator('[data-photo-viewport]').evaluate((el, data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'wide.png', { type: 'image/png' }))
      el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    }, b64)
    const prompt = page.getByRole('dialog', { name: 'This image is very large' })
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText('wider or taller than 30,000 pixels')
    const openAt = prompt.getByRole('button', { name: /^Open at \d+(\.\d+)?%$/ })
    await expect(openAt).toHaveText('Open at 75%')
    await openAt.click()
    await expect(prompt).toBeHidden()
    await expect(page.getByTestId('layer-row')).toHaveCount(layersBefore + 1)
    const added = await page.evaluate(() => {
      const l = window.__bearPhotoTest!.editor!().doc.layers.at(-1)!
      return [l.name, l.pixels.width, l.pixels.height]
    })
    expect(added).toEqual(['wide', 30000, 75])
  })

  test('worker crash: the error shows and the pixels are unchanged', async () => {
    const workerErrors: string[] = []
    const onConsole = (m: { type(): string; text(): string }) => {
      if (m.type() === 'error' && m.text().includes('filter worker failed')) workerErrors.push(m.text())
    }
    page.on('console', onConsole)
    try {
      await page.locator('[data-testid=layer-row][data-name="Background"]').getByText('Background', { exact: true }).click()
      await expect(page.locator('[data-testid=layer-row][data-name="Background"]')).toHaveAttribute('aria-selected', 'true')
      const sum = await docChecksum(page)
      const rows = await historyRows(page)
      const notice = page.getByTestId('photo-notice')
      // Remember the layer's own bitmap, to tell a preview (a swapped bitmap) from the real pixels.
      const showsOriginal = () =>
        page.evaluate(() => {
          const w = window as unknown as { __bgPixels: unknown }
          const doc = window.__bearPhotoTest!.editor!().doc
          return doc.layers.find((l) => l.name === 'Background')!.pixels === w.__bgPixels
        })
      await page.evaluate(() => {
        const doc = window.__bearPhotoTest!.editor!().doc
        ;(window as unknown as { __bgPixels: unknown }).__bgPixels = doc.layers.find((l) => l.name === 'Background')!.pixels
      })

      // The dialog previews its default settings on open; wait for that preview, so the only
      // filter runs after this are the ones below, which crash.
      const dlg = await openGaussian(page)
      await expect.poll(showsOriginal).toBe(false)
      await page.evaluate(() => (window.__bearPhotoBreakFilter = true))
      await page.getByTestId('dialog-slider-radius').fill('4')
      await expect(notice).toContainText(BREAK_TEXT)
      expect(await showsOriginal()).toBe(true)
      expect(await docChecksum(page)).toBe(sum)

      // Apply runs the filter again, fails the same way (the dismissed notice comes back), and
      // records nothing. The dialog's click blocker covers the notice bar, so dismiss it by event.
      await notice.getByRole('button', { name: 'Dismiss' }).dispatchEvent('click')
      await expect(notice).toBeHidden()
      await dlg.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(notice).toContainText(BREAK_TEXT)
      await expect(dlg).toBeVisible()
      expect(await showsOriginal()).toBe(true)
      await dlg.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dlg).toBeHidden()
      expect(await docChecksum(page)).toBe(sum)
      expect(await historyRows(page)).toEqual(rows)
      // The worker's own error text goes to the console.
      await expect.poll(() => workerErrors.length).toBeGreaterThan(0)
    } finally {
      page.off('console', onConsole)
      await page.evaluate(() => (window.__bearPhotoBreakFilter = false))
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Tests that need their own app

test('fallback: without WebGL Photo still draws and says so once', async () => {
  // --disable-webgl alone doesn't stop WebGL here: Chromium still offers it through its software
  // rasterizer (SwiftShader), so that is switched off too.
  const { app, page } = await launch(undefined, [], ['--disable-gpu', '--disable-webgl', '--disable-software-rasterizer'])
  try {
    await openPhoto(page)
    await newImage(page, 'Screen')
    const notice = page.getByTestId('photo-notice')
    await expect(notice).toContainText(SLOW_DRAWING)
    await expect(notice.getByText(SLOW_DRAWING, { exact: false })).toHaveCount(1)

    const box = await viewport(page)
    const cy = box.y + box.height / 2
    await drag(page, box.x + box.width * 0.2, cy, box.x + box.width * 0.8, cy)
    await expect(currentRow(page)).toHaveText('Brush')
    await page.keyboard.press('Control+1')
    await expect(page.getByTestId('photo-zoom')).toHaveText('100%')
    // One opaque layer, so what's on screen must be that layer's pixels.
    const rb = await readCanvas(page)
    expect(await page.evaluate(() => window.__bearPhotoTest!.editor!().doc.layers.length)).toBe(1)
    expect(readbackDiff(rb, await layerRegion(page, rb.rect))).toBeLessThanOrEqual(TOLERANCE)
    expect(darkPixels(rb)).toBeGreaterThan(100)
    await expect(notice.getByText(SLOW_DRAWING, { exact: false })).toHaveCount(1)
  } finally {
    await close(app)
  }
})

/**
 * Kill the app the hard way, as a crash would. On Windows `process().kill()` ends only the main
 * process; its GPU, utility and renderer children live on and keep the profile locked, so the
 * relaunch would quit at once. Kill the whole tree there.
 */
async function killHard(app: ElectronApplication) {
  const proc = app.process()
  const exited = new Promise((r) => proc.once('exit', r))
  if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
  else proc.kill('SIGKILL')
  await exited
}

const RECOVERY_COPY = /^photo-[a-z0-9-]+\.bearphoto$/

/** Recovery copies under `recoveryDir`: in a process's own folder (<pid>-<start>/), or flat from older builds. */
function recoveryCopies(recoveryDir: string): string[] {
  if (!existsSync(recoveryDir)) return []
  const out: string[] = []
  for (const e of readdirSync(recoveryDir, { withFileTypes: true })) {
    if (e.isFile() && RECOVERY_COPY.test(e.name)) out.push(join(recoveryDir, e.name))
    else if (e.isDirectory())
      for (const f of readdirSync(join(recoveryDir, e.name))) if (RECOVERY_COPY.test(f)) out.push(join(recoveryDir, e.name, f))
  }
  return out
}

async function copyChecksums(recoveryDir: string): Promise<string[]> {
  const out: string[] = []
  for (const f of recoveryCopies(recoveryDir)) {
    try {
      out.push(checksumOf(await readBearPhoto(new Uint8Array(readFileSync(f)))))
    } catch {
      out.push('unreadable')
    }
  }
  return out
}

/** Open Photo with a new image holding a brush stroke, with recovery copies every second; returns its checksum. */
async function strokeWithRecovery(page: Page): Promise<string> {
  await page.evaluate(() => (window.__bearPhotoRecoveryMs = 1000))
  await openPhoto(page)
  await newImage(page, 'Screen')
  const box = await viewport(page)
  await drag(page, box.x + box.width * 0.3, box.y + box.height * 0.3, box.x + box.width * 0.7, box.y + box.height * 0.6)
  await expect(currentRow(page)).toHaveText('Brush')
  return docChecksum(page)
}

test('recovery: a killed app offers its work back', async () => {
  const first = await launch()
  let second: ElectronApplication | undefined
  let killed = false
  try {
    const { page, dir } = first
    const sum = await strokeWithRecovery(page)

    const recoveryDir = join(dir, 'userdata', 'recovery')
    // Wait for a copy that holds the stroke, not just any copy: decode it and compare with the open document.
    await expect.poll(() => copyChecksums(recoveryDir), { timeout: 10_000 }).toEqual([sum])

    await killHard(first.app)
    killed = true

    const relaunched = await launch(dir)
    second = relaunched.app
    await openPhoto(relaunched.page)
    const prompt = relaunched.page.getByRole('dialog', { name: 'Restore your work?' })
    await expect(relaunched.page.getByTestId('photo-recovery')).toContainText('Photo closed unexpectedly. Restore')
    await prompt.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(prompt).toBeHidden()
    await expect(currentRow(relaunched.page)).toHaveText('Open')
    expect(await docChecksum(relaunched.page)).toBe(sum)
    await expect(titleBar(relaunched.page)).toContainText(/Recovered image.*· Edited/)
  } finally {
    if (!killed) await close(first.app)
    await close(second)
  }
})

test("recovery: another running process's copy is not offered until that process is gone", async () => {
  // Two profiles, one Bear data folder: like Bear Studio and Bear running side by side.
  const shared = assertTestFolder(mkdtempSync(join(tmpdir(), 'bear-e2e-appdata-')))
  const recoveryDir = join(shared, '@bear', 'desktop', 'recovery')
  const a = await launch(undefined, [], [], shared)
  let b: ElectronApplication | undefined
  let killed = false
  try {
    // Never against real data: the profile is the test's own and the data folder the temp one.
    const paths = await a.app.evaluate(({ app }) => ({ appData: app.getPath('appData'), userData: app.getPath('userData') }))
    expect(paths.appData).toBe(shared)
    expect(paths.userData).toBe(join(a.dir, 'userdata'))
    assertTestFolder(paths.userData)

    const sum = await strokeWithRecovery(a.page)
    await expect.poll(() => copyChecksums(recoveryDir), { timeout: 10_000 }).toEqual([sum])
    const [copy] = recoveryCopies(recoveryDir)
    const aPid = await a.app.evaluate(() => process.pid)
    expect(basename(dirname(copy))).toMatch(new RegExp(`^${aPid}-\\d+$`))

    // B opens Photo while A is still running: no prompt, and A's copy is left alone.
    const launchedB = await launch(undefined, [], [], shared)
    b = launchedB.app
    const pageB = launchedB.page
    expect(await pageB.evaluate(() => window.bear.recovery.list())).toEqual([])
    await openPhoto(pageB)
    const newDialog = pageB.getByRole('dialog', { name: 'New image' })
    await expect(newDialog).toBeVisible()
    await pageB.waitForTimeout(3000) // the list (and its process check) is async: give a prompt time to show
    await expect(pageB.getByTestId('photo-recovery')).toHaveCount(0)
    expect(recoveryCopies(recoveryDir)).toEqual([copy])

    // A crashes. Photo, opened again in B, offers A's work back.
    await killHard(a.app)
    killed = true
    await newDialog.getByRole('button', { name: 'Cancel' }).click()
    await pageB.getByTitle('Home').click()
    await expect(pageB.getByTestId('suite-studio')).toBeVisible()
    await openPhoto(pageB)
    const prompt = pageB.getByRole('dialog', { name: 'Restore your work?' })
    await expect(pageB.getByTestId('photo-recovery')).toContainText('Photo closed unexpectedly. Restore')
    await prompt.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(prompt).toBeHidden()
    expect(await docChecksum(pageB)).toBe(sum)
    // A's copy, and its folder, go once B has written its own copy of the work.
    await expect.poll(() => existsSync(dirname(copy)), { timeout: 10_000 }).toBe(false)
  } finally {
    if (!killed) await close(a.app)
    await close(b)
  }
})

test('closing the window with an open text box commits it and asks to save', async () => {
  const { app, page } = await launch()
  try {
    await openPhoto(page)
    await newImage(page, { width: 200, height: 120 })
    await page.getByTestId('tool-text').click()
    const box = await viewport(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('photo-text-box')).toBeVisible()
    await page.keyboard.type('Unsaved words')
    await expect(titleBar(page)).toContainText('· Saved') // nothing committed yet
    // The window's close button: main asks the renderer, which must not let the text vanish.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    const prompt = page.getByRole('dialog', { name: 'Save changes?' })
    await expect(prompt).toBeVisible()
    await expect(page.getByTestId('layer-row')).toHaveCount(2)
    expect(await layerNames(page)).toContain('Unsaved words')
    await prompt.getByRole('button', { name: 'Cancel' }).click()
    await expect(prompt).toBeHidden()
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await close(app)
  }
})
