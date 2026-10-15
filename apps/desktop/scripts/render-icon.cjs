// Renders build/icon.svg to PNGs using Electron's own Chromium.
// Usage (from apps/desktop): npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const buildDir = path.join(__dirname, '..', 'build')
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')
const SIZE = 512
const outputs = [
  { size: 512, file: path.join(buildDir, 'icon.png') },
  { size: 256, file: path.join(buildDir, 'icon-256.png') },
  { size: 128, file: path.join(buildDir, 'icon-128.png') },
  { size: 64, file: path.join(buildDir, 'icon-64.png') }
]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, useContentSize: true })
    const html = `<html><body style="margin:0;background:transparent"><img width="${SIZE}" height="${SIZE}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
    await new Promise((r) => setTimeout(r, 200))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
    for (const { size, file } of outputs) {
      fs.writeFileSync(file, img.resize({ width: size, height: size, quality: 'best' }).toPNG())
      console.log('wrote', file)
    }
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  }
  app.quit()
})
