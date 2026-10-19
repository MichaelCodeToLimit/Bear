import { describe, expect, it } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { createDoc } from '../model/doc'
import { loadPhotoFile } from '../file-io'
import { encodePng } from './png'
import { writePsd } from './psd'
import { avifSize, bmpSize, gifSize, imageSize, jpegSize, pngSize, psdSize, webpSize } from './imageSize'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >> 8) & 255]
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]

describe('image header sizes', () => {
  it('PNG (from the IHDR chunk)', () => {
    expect(pngSize(encodePng(createBitmap(37, 21)))).toEqual({ width: 37, height: 21 })
    expect(pngSize(bytes('not a png at all, really not'))).toBeNull()
  })

  it('PSD', () => {
    expect(psdSize(writePsd(createDoc(45, 12, 'transparent')))).toEqual({ width: 45, height: 12 })
  })

  it('GIF', () => {
    expect(gifSize(bytes('GIF89a', le16(640), le16(480), [0, 0, 0]))).toEqual({ width: 640, height: 480 })
  })

  it('BMP, bottom-up and top-down', () => {
    const bmp = (w: number, h: number) => bytes('BM', le32(0), le32(0), le32(54), le32(40), le32(w), le32(h), le16(1), le16(32))
    expect(bmpSize(bmp(300, 200))).toEqual({ width: 300, height: 200 })
    expect(bmpSize(bmp(300, -200))).toEqual({ width: 300, height: 200 })
  })

  it('JPEG, skipping segments before the frame header', () => {
    const app0 = [0xff, 0xe0, 0, 16, ...bytes('JFIF', [0]), 1, 1, 0, 0, 1, 0, 1, 0, 0]
    const sof2 = [0xff, 0xc2, 0, 17, 8, ...[0x0f, 0xa0], ...[0x17, 0x70], 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    expect(jpegSize(new Uint8Array([0xff, 0xd8, ...app0, ...sof2, 0xff, 0xd9]))).toEqual({ width: 6000, height: 4000 })
    // A DHT segment (0xC4) is not a frame header.
    const dht = [0xff, 0xc4, 0, 4, 0, 0]
    expect(jpegSize(new Uint8Array([0xff, 0xd8, ...dht, ...sof2]))).toEqual({ width: 6000, height: 4000 })
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })

  it('WebP: lossy, lossless and extended', () => {
    const riff = (chunk: string, body: number[]) => bytes('RIFF', le32(100), 'WEBP', chunk, le32(body.length), body)
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1920), ...le16(1080), 0, 0])
    expect(webpSize(lossy)).toEqual({ width: 1920, height: 1080 })
    const w = 1000
    const h = 700
    const bits = (w - 1) | ((h - 1) << 14)
    expect(webpSize(riff('VP8L', [0x2f, ...le32(bits), 0, 0, 0, 0, 0]))).toEqual({ width: 1000, height: 700 })
    const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]
    expect(webpSize(riff('VP8X', [0, 0, 0, 0, ...le24(29999), ...le24(19999), 0, 0]))).toEqual({ width: 30000, height: 20000 })
  })

  it('AVIF (the ispe property)', () => {
    const avif = bytes(be32(24), 'ftyp', 'avif', be32(0), 'mif1', 'avif', be32(20), 'ispe', be32(0), be32(8000), be32(6000))
    expect(avifSize(avif)).toEqual({ width: 8000, height: 6000 })
    expect(imageSize(avif, 'avif')).toEqual({ width: 8000, height: 6000 })
  })

  it('goes by the contents, not the extension', () => {
    expect(imageSize(encodePng(createBitmap(3, 4)), 'jpg')).toEqual({ width: 3, height: 4 })
    expect(imageSize(bytes('plain text, not an image'), 'png')).toBeNull()
  })
})

describe('size check before decoding', () => {
  it('asks to scale down a huge image from its header, without decoding it', async () => {
    // A PNG header claiming 40,000 x 30,000 followed by junk: decoding it would throw.
    const fake = bytes([0x89], 'PNG', [13, 10, 26, 10], be32(13), 'IHDR', be32(40000), be32(30000), [8, 6, 0, 0, 0], 'junk')
    const res = await loadPhotoFile({ path: '/x/huge.png', name: 'huge.png', data: fake }, 1 << 30)
    expect(res).toMatchObject({ reason: 'dimensions' })
    expect('needsScale' in res && res.needsScale).toBeLessThan(0.75)
  })

  it('a .psd too large for memory is refused before it is read', async () => {
    const psd = writePsd(createDoc(20, 20, 'transparent'))
    // Rewrite the header to 20,000 x 20,000; the layer data after it no longer matches.
    psd.set(be32(20000), 14)
    psd.set(be32(20000), 18)
    const res = await loadPhotoFile({ path: '/x/big.psd', name: 'big.psd', data: psd }, 1 << 30)
    expect(res).toMatchObject({ reason: 'memory' })
  })
})
