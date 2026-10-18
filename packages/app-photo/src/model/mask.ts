/** Single-channel 8-bit image the size of the document. 0 = unselected, 255 = fully selected. */
export interface Mask {
  width: number
  height: number
  data: Uint8Array
}
