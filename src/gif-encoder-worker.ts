import { GifWriter } from 'omggif'

type EncodeRequest = {
  type: 'encode'
  width: number
  height: number
  delayCs: number
  loopCount: number
  colors: 64 | 128 | 256
  frames: ArrayBuffer[]
}

type EncodeProgressMessage = {
  type: 'progress'
  frame: number
  totalFrames: number
}

type EncodeDoneMessage = {
  type: 'done'
  buffer: ArrayBuffer
}

type EncodeErrorMessage = {
  type: 'error'
  message: string
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const data = event.data
  if (data.type !== 'encode') return

  try {
    const palette = buildUniformPalette(data.colors)

    const estimatedSize = Math.max(data.width * data.height * data.frames.length * 2 + 1024 * 1024, 4 * 1024 * 1024)
    const output = new Uint8Array(estimatedSize)
    const writer = new GifWriter(output, data.width, data.height, { loop: data.loopCount })

    for (let index = 0; index < data.frames.length; index += 1) {
      const rgba = new Uint8Array(data.frames[index]!)
      const indexed = quantizeToPalette(rgba, palette)
      writer.addFrame(0, 0, data.width, data.height, indexed, {
        palette,
        delay: data.delayCs,
        disposal: 0,
      })
      ;(self as unknown as Worker).postMessage({
        type: 'progress',
        frame: index + 1,
        totalFrames: data.frames.length,
      } satisfies EncodeProgressMessage)
    }

    const end = writer.end()
    const finalBuffer = output.slice(0, end).buffer
    ;(self as unknown as Worker).postMessage({ type: 'done', buffer: finalBuffer } satisfies EncodeDoneMessage, [finalBuffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ;(self as unknown as Worker).postMessage({ type: 'error', message } satisfies EncodeErrorMessage)
  }
}

function buildUniformPalette(colorCount: 64 | 128 | 256): Uint32Array {
  if (colorCount === 64) return buildCubePalette(4, 4, 4)
  if (colorCount === 128) return buildCubePalette(8, 4, 4)
  return buildCubePalette(8, 8, 4)
}

function buildCubePalette(rSteps: number, gSteps: number, bSteps: number): Uint32Array {
  const colors: number[] = []
  for (let r = 0; r < rSteps; r += 1) {
    for (let g = 0; g < gSteps; g += 1) {
      for (let b = 0; b < bSteps; b += 1) {
        const rr = rSteps === 1 ? 0 : Math.round((r / (rSteps - 1)) * 255)
        const gg = gSteps === 1 ? 0 : Math.round((g / (gSteps - 1)) * 255)
        const bb = bSteps === 1 ? 0 : Math.round((b / (bSteps - 1)) * 255)
        colors.push((rr << 16) | (gg << 8) | bb)
      }
    }
  }
  return Uint32Array.from(colors)
}

function quantizeToPalette(rgba: Uint8Array, palette: Uint32Array): Uint8Array {
  const result = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < result.length; i += 1) {
    const r = rgba[i * 4]!
    const g = rgba[i * 4 + 1]!
    const b = rgba[i * 4 + 2]!
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let p = 0; p < palette.length; p += 1) {
      const color = palette[p]!
      const pr = (color >> 16) & 0xff
      const pg = (color >> 8) & 0xff
      const pb = color & 0xff
      const dr = r - pr
      const dg = g - pg
      const db = b - pb
      const distance = dr * dr + dg * dg + db * db
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = p
      }
    }
    result[i] = bestIndex
  }
  return result
}
