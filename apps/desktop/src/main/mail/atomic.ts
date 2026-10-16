import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

let counter = 0
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Write a file so a crash can't leave it half-written: write a temp file, then swap it in.
 * On Windows the swap fails while anything (often a virus scanner) briefly has the file open,
 * so it's retried for a couple of seconds. Each write uses its own temp name, so one stuck temp
 * file can't block later saves.
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array) {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${++counter}.tmp`
  try {
    await fs.writeFile(tmp, data)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw e
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file)
      return
    } catch (e) {
      if (!BUSY.has((e as NodeJS.ErrnoException).code ?? '') || attempt >= 20) {
        await fs.rm(tmp, { force: true }).catch(() => {})
        throw e
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)))
    }
  }
}
