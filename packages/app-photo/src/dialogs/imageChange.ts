/**
 * Run a whole-document change, telling the user if it failed. The editor builds every new bitmap
 * before changing anything, so a failure leaves the image as it was.
 */
export function runImageChange(verb: string, fn: () => void, notify: (text: string) => void): void {
  try {
    fn()
  } catch (e) {
    console.warn(`Photo: could not ${verb} the image`, e)
    notify(e instanceof RangeError ? `Not enough memory to ${verb} this image.` : `Photo couldn't ${verb} this image. It wasn't changed.`)
  }
}
