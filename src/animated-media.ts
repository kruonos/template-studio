/**
 * Animated Media Engine
 *
 * Handles:
 * - GIF frame extraction (binary parsing of GIF89a format)
 * - Traced path interpolation (cubic bezier + freehand)
 * - Animation state management for animated-gif elements
 * - Alpha-based silhouette extraction for dynamic obstacles
 */

import type {
  AnimatedGifBehavior,
  CanvasElement,
  TracedPath,
  TracedPathControlPoint,
  TracedPathPoint,
} from './schema.ts'
import { clamp } from './utils.ts'

// ── Animation state ─────────────────────────────────────────────

export type GifAnimState = {
  elementId: string
  /** Progress along the traced path (0..1) */
  pathProgress: number
  /** Direction for bounce mode: 1 = forward, -1 = backward */
  direction: 1 | -1
  /** Whether the path-once animation has completed */
  finished: boolean
  /** Home position (start of path) */
  homeX: number
  homeY: number
}

const gifAnimStates = new Map<string, GifAnimState>()

export function getGifAnimState(element: CanvasElement): GifAnimState {
  let animState = gifAnimStates.get(element.id)
  if (animState === undefined) {
    animState = {
      elementId: element.id,
      pathProgress: 0,
      direction: 1,
      finished: false,
      homeX: element.x,
      homeY: element.y,
    }
    gifAnimStates.set(element.id, animState)
  }
  return animState
}

export function resetGifAnimState(elementId: string): void {
  gifAnimStates.delete(elementId)
}

export function resetAllGifAnimStates(): void {
  gifAnimStates.clear()
}

export function syncGifAnimStates(liveIds: Set<string>): void {
  for (const id of gifAnimStates.keys()) {
    if (!liveIds.has(id)) gifAnimStates.delete(id)
  }
}

export function resetGifBasePositions(elements: CanvasElement[]): void {
  for (const element of elements) {
    if (element.type !== 'animated-gif') continue
    const animState = gifAnimStates.get(element.id)
    if (animState !== undefined) {
      animState.homeX = element.x
      animState.homeY = element.y
    }
  }
}

// ── Traced path parsing and interpolation ───────────────────────

export function parseTracedPath(raw: string | undefined): TracedPath | null {
  if (raw === undefined || raw.length === 0) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<TracedPath>
    if (!Array.isArray(candidate.points) || candidate.points.length < 2) return null
    const points: TracedPathControlPoint[] = []
    for (const pt of candidate.points) {
      if (typeof pt !== 'object' || pt === null) continue
      const raw = pt as Record<string, unknown>
      if (typeof raw['anchor'] !== 'object' || raw['anchor'] === null) continue
      const anchor = raw['anchor'] as Record<string, unknown>
      if (typeof anchor['x'] !== 'number' || typeof anchor['y'] !== 'number') continue
      const cp: TracedPathControlPoint = { anchor: { x: anchor['x'], y: anchor['y'] } }
      if (typeof raw['handleIn'] === 'object' && raw['handleIn'] !== null) {
        const h = raw['handleIn'] as Record<string, unknown>
        if (typeof h['x'] === 'number' && typeof h['y'] === 'number') {
          cp.handleIn = { x: h['x'], y: h['y'] }
        }
      }
      if (typeof raw['handleOut'] === 'object' && raw['handleOut'] !== null) {
        const h = raw['handleOut'] as Record<string, unknown>
        if (typeof h['x'] === 'number' && typeof h['y'] === 'number') {
          cp.handleOut = { x: h['x'], y: h['y'] }
        }
      }
      points.push(cp)
    }
    if (points.length < 2) return null
    return { points, closed: candidate.closed === true }
  } catch {
    return null
  }
}

/** Compute total arc length of a traced path (approximate using linear segments) */
export function computePathLength(path: TracedPath): number {
  let total = 0
  const count = path.closed ? path.points.length : path.points.length - 1
  for (let i = 0; i < count; i++) {
    const a = path.points[i]!
    const b = path.points[(i + 1) % path.points.length]!
    total += bezierSegmentLength(a, b)
  }
  return total
}

/** Sample a position along the traced path at parameter t (0..1) */
export function samplePathPosition(path: TracedPath, t: number): TracedPathPoint {
  const segmentCount = path.closed ? path.points.length : path.points.length - 1
  if (segmentCount <= 0) return path.points[0]?.anchor ?? { x: 0, y: 0 }

  const clampedT = clamp(t, 0, 1)
  // Compute cumulative segment lengths for arc-length parameterization
  const lengths: number[] = []
  let totalLength = 0
  for (let i = 0; i < segmentCount; i++) {
    const a = path.points[i]!
    const b = path.points[(i + 1) % path.points.length]!
    const len = bezierSegmentLength(a, b)
    lengths.push(len)
    totalLength += len
  }

  if (totalLength < 0.001) return path.points[0]!.anchor

  // Find which segment contains the target distance
  const targetDist = clampedT * totalLength
  let accumulated = 0
  for (let i = 0; i < segmentCount; i++) {
    const segLen = lengths[i]!
    if (accumulated + segLen >= targetDist || i === segmentCount - 1) {
      const localT = segLen > 0 ? (targetDist - accumulated) / segLen : 0
      const a = path.points[i]!
      const b = path.points[(i + 1) % path.points.length]!
      return evaluateBezierSegment(a, b, clamp(localT, 0, 1))
    }
    accumulated += segLen
  }

  return path.points[path.points.length - 1]!.anchor
}

/** Evaluate a cubic bezier between two control points at parameter t */
function evaluateBezierSegment(
  a: TracedPathControlPoint,
  b: TracedPathControlPoint,
  t: number,
): TracedPathPoint {
  const p0 = a.anchor
  const p1 = a.handleOut ?? a.anchor
  const p2 = b.handleIn ?? b.anchor
  const p3 = b.anchor

  const u = 1 - t
  const u2 = u * u
  const u3 = u2 * u
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  }
}

/** Approximate arc length of one cubic bezier segment using 16-point sampling */
function bezierSegmentLength(a: TracedPathControlPoint, b: TracedPathControlPoint): number {
  const steps = 16
  let length = 0
  let prev = a.anchor
  for (let i = 1; i <= steps; i++) {
    const pt = evaluateBezierSegment(a, b, i / steps)
    const dx = pt.x - prev.x
    const dy = pt.y - prev.y
    length += Math.sqrt(dx * dx + dy * dy)
    prev = pt
  }
  return length
}

// ── Path following animation ────────────────────────────────────

/**
 * Update positions of all animated-gif elements along their traced paths.
 * Returns true if any element moved.
 */
export function updateGifPositions(
  elements: CanvasElement[],
  deltaMs: number,
  selectedId: string | null,
  selectedIds: Set<string>,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  let anyMoved = false

  for (const element of elements) {
    if (element.type !== 'animated-gif') continue
    const behavior: AnimatedGifBehavior = element.styles.gifBehavior ?? 'static'
    if (behavior === 'static') continue
    // Don't animate while user is interacting with this element
    if (selectedId === element.id || selectedIds.has(element.id)) continue

    const path = parseTracedPath(element.styles.gifPath)
    if (path === null) continue

    const animState = getGifAnimState(element)
    if (animState.finished) continue

    const speed = (element.styles.gifSpeed ?? 1) * 80
    const totalLength = computePathLength(path)
    if (totalLength < 1) continue

    const deltaSec = deltaMs / 1000
    const travelDist = speed * deltaSec
    const progressDelta = travelDist / totalLength

    switch (behavior) {
      case 'path-loop':
        animState.pathProgress += progressDelta
        while (animState.pathProgress >= 1) animState.pathProgress -= 1
        while (animState.pathProgress < 0) animState.pathProgress += 1
        break

      case 'path-bounce':
        animState.pathProgress += progressDelta * animState.direction
        if (animState.pathProgress >= 1) {
          animState.pathProgress = 1
          animState.direction = -1
        }
        if (animState.pathProgress <= 0) {
          animState.pathProgress = 0
          animState.direction = 1
        }
        break

      case 'path-once':
        animState.pathProgress += progressDelta
        if (animState.pathProgress >= 1) {
          animState.pathProgress = 1
          animState.finished = true
        }
        break
    }

    const pos = samplePathPosition(path, animState.pathProgress)

    // Center the element on the path point
    const newX = clamp(Math.round(pos.x - element.width / 2), 0, Math.max(0, canvasWidth - element.width))
    const newY = clamp(Math.round(pos.y - element.height / 2), 0, Math.max(0, canvasHeight - element.height))

    if (newX !== element.x || newY !== element.y) {
      element.x = newX
      element.y = newY
      anyMoved = true
    }
  }

  return anyMoved
}

/** Check if any animated-gif element has an active (non-static, non-finished) animation */
export function hasGifAnimation(elements: CanvasElement[]): boolean {
  for (const element of elements) {
    if (element.type !== 'animated-gif') continue
    const behavior = element.styles.gifBehavior ?? 'static'
    if (behavior === 'static') continue
    const path = parseTracedPath(element.styles.gifPath)
    if (path === null) continue
    const animState = gifAnimStates.get(element.id)
    if (animState?.finished) continue
    return true
  }
  return false
}

// ── GIF frame extraction ────────────────────────────────────────

export type ExtractedGifFrame = {
  /** ImageBitmap for this frame */
  bitmap: ImageBitmap
  /** Delay in ms */
  delay: number
  /** Frame index */
  index: number
}

export type ExtractedGif = {
  frames: ExtractedGifFrame[]
  width: number
  height: number
  totalDuration: number
}

export function getGifFrameAtTime(gif: ExtractedGif, timeMs: number): ExtractedGifFrame {
  if (gif.frames.length === 0) throw new Error('GIF has no frames')
  if (gif.totalDuration <= 0) return gif.frames[0]!
  let remaining = ((timeMs % gif.totalDuration) + gif.totalDuration) % gif.totalDuration
  for (const frame of gif.frames) {
    if (remaining < frame.delay) return frame
    remaining -= frame.delay
  }
  return gif.frames[gif.frames.length - 1]!
}

/**
 * Extract frames from an animated GIF data URL.
 * Uses a minimal GIF89a binary parser (no external dependencies).
 * Returns individual ImageBitmaps for each frame.
 */
export async function extractGifFrames(dataUrl: string): Promise<ExtractedGif> {
  const binaryStr = atob(dataUrl.split(',')[1] ?? '')
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  const gif = parseGif(bytes)
  if (gif.frames.length === 0) {
    throw new Error('No frames found in GIF')
  }

  // Render frames onto OffscreenCanvas to get ImageBitmaps
  const canvas = new OffscreenCanvas(gif.width, gif.height)
  const ctx = canvas.getContext('2d')!
  const frames: ExtractedGifFrame[] = []
  let totalDuration = 0

  // Previous frame canvas for disposal methods
  const prevCanvas = new OffscreenCanvas(gif.width, gif.height)
  const prevCtx = prevCanvas.getContext('2d')!

  for (let i = 0; i < gif.frames.length; i++) {
    const frame = gif.frames[i]!
    const disposal = frame.disposalMethod

    // Save state before rendering this frame (for restoreToPrevious)
    if (disposal === 3) {
      prevCtx.clearRect(0, 0, gif.width, gif.height)
      prevCtx.drawImage(canvas, 0, 0)
    }

    // Create ImageData for this frame
    const imageData = new ImageData(
      new Uint8ClampedArray(frame.pixels),
      frame.width,
      frame.height,
    )

    // Draw frame at its position
    const tempCanvas = new OffscreenCanvas(frame.width, frame.height)
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.putImageData(imageData, 0, 0)
    ctx.drawImage(tempCanvas, frame.left, frame.top)

    // Create bitmap from the composite
    const bitmap = await createImageBitmap(canvas)
    const delay = Math.max(frame.delay, 20) // Minimum 20ms per GIF spec
    frames.push({ bitmap, delay, index: i })
    totalDuration += delay

    // Handle disposal
    if (disposal === 2) {
      // Restore to background (clear the frame area)
      ctx.clearRect(frame.left, frame.top, frame.width, frame.height)
    } else if (disposal === 3) {
      // Restore to previous
      ctx.clearRect(0, 0, gif.width, gif.height)
      ctx.drawImage(prevCanvas, 0, 0)
    }
    // disposal 0 or 1: do not dispose (keep current state)
  }

  return { frames, width: gif.width, height: gif.height, totalDuration }
}

// ── Minimal GIF89a parser ───────────────────────────────────────

type ParsedGifFrame = {
  left: number
  top: number
  width: number
  height: number
  delay: number
  disposalMethod: number
  pixels: Uint8Array // RGBA
}

type ParsedGif = {
  width: number
  height: number
  frames: ParsedGifFrame[]
}

function parseGif(bytes: Uint8Array): ParsedGif {
  let offset = 0
  const read = (n: number): Uint8Array => {
    const slice = bytes.subarray(offset, offset + n)
    offset += n
    return slice
  }
  const readU8 = (): number => bytes[offset++]!
  const readU16 = (): number => {
    const val = bytes[offset]! | (bytes[offset + 1]! << 8)
    offset += 2
    return val
  }

  // Header: "GIF89a" or "GIF87a"
  const sig = String.fromCharCode(...read(6))
  if (!sig.startsWith('GIF')) throw new Error('Not a GIF file')

  // Logical screen descriptor
  const width = readU16()
  const height = readU16()
  const packed = readU8()
  readU8() // background color index
  readU8() // pixel aspect ratio

  const hasGCT = (packed & 0x80) !== 0
  const gctSize = 1 << ((packed & 0x07) + 1)

  // Global color table
  let gct: Uint8Array | null = null
  if (hasGCT) {
    gct = read(gctSize * 3)
  }

  const frames: ParsedGifFrame[] = []
  let delay = 100
  let disposalMethod = 0
  let transparentIndex = -1
  let hasTransparency = false

  while (offset < bytes.length) {
    const sentinel = readU8()

    if (sentinel === 0x3b) {
      // Trailer
      break
    }

    if (sentinel === 0x21) {
      // Extension
      const label = readU8()

      if (label === 0xf9) {
        // Graphic Control Extension
        readU8() // block size (always 4)
        const gcPacked = readU8()
        delay = readU16() * 10 // Convert centiseconds to ms
        transparentIndex = readU8()
        hasTransparency = (gcPacked & 0x01) !== 0
        disposalMethod = (gcPacked >> 2) & 0x07
        readU8() // block terminator
      } else {
        // Skip other extensions
        skipSubBlocks()
      }
      continue
    }

    if (sentinel === 0x2c) {
      // Image descriptor
      const left = readU16()
      const top = readU16()
      const frameWidth = readU16()
      const frameHeight = readU16()
      const imgPacked = readU8()

      const hasLCT = (imgPacked & 0x80) !== 0
      const interlaced = (imgPacked & 0x40) !== 0
      const lctSize = 1 << ((imgPacked & 0x07) + 1)

      let colorTable = gct
      if (hasLCT) {
        colorTable = read(lctSize * 3)
      }

      // LZW minimum code size
      const minCodeSize = readU8()

      // Read all sub-blocks of compressed data
      const compressedData = readSubBlocks()

      // Decompress LZW
      const indexStream = decompressLzw(compressedData, minCodeSize, frameWidth * frameHeight)

      // Convert to RGBA pixels
      const pixels = new Uint8Array(frameWidth * frameHeight * 4)
      const deinterlaced = interlaced ? deinterlace(indexStream, frameWidth, frameHeight) : indexStream

      for (let i = 0; i < frameWidth * frameHeight; i++) {
        const colorIndex = deinterlaced[i] ?? 0
        if (hasTransparency && colorIndex === transparentIndex) {
          // Transparent pixel: leave as 0,0,0,0
          continue
        }
        if (colorTable !== null) {
          pixels[i * 4] = colorTable[colorIndex * 3]!
          pixels[i * 4 + 1] = colorTable[colorIndex * 3 + 1]!
          pixels[i * 4 + 2] = colorTable[colorIndex * 3 + 2]!
          pixels[i * 4 + 3] = 255
        }
      }

      frames.push({
        left,
        top,
        width: frameWidth,
        height: frameHeight,
        delay: delay || 100,
        disposalMethod,
        pixels,
      })

      // Reset GCE values for next frame
      delay = 100
      disposalMethod = 0
      transparentIndex = -1
      hasTransparency = false
      continue
    }

    // Unknown block, try to skip
    if (sentinel === 0x00) continue // padding
    break
  }

  return { width, height, frames }

  function skipSubBlocks(): void {
    while (offset < bytes.length) {
      const size = readU8()
      if (size === 0) break
      offset += size
    }
  }

  function readSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = []
    let totalSize = 0
    while (offset < bytes.length) {
      const size = readU8()
      if (size === 0) break
      chunks.push(bytes.subarray(offset, offset + size))
      offset += size
      totalSize += size
    }
    const result = new Uint8Array(totalSize)
    let pos = 0
    for (const chunk of chunks) {
      result.set(chunk, pos)
      pos += chunk.length
    }
    return result
  }
}

function decompressLzw(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const output = new Uint8Array(pixelCount)
  let outputPos = 0

  let codeSize = minCodeSize + 1
  let codeMask = (1 << codeSize) - 1
  let nextCode = eoiCode + 1
  const maxTableSize = 4096

  // LZW dictionary: each entry is [prefix, suffix] where prefix points to previous entry
  const prefixes = new Int32Array(maxTableSize)
  const suffixes = new Uint8Array(maxTableSize)
  const lengths = new Uint16Array(maxTableSize)

  function initTable(): void {
    for (let i = 0; i < clearCode; i++) {
      prefixes[i] = -1
      suffixes[i] = i
      lengths[i] = 1
    }
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
    codeMask = (1 << codeSize) - 1
  }

  function outputCode(code: number): void {
    const len = lengths[code]!
    if (outputPos + len > output.length) return
    // Walk the chain backwards and fill in the output
    let pos = outputPos + len - 1
    let c = code
    while (c >= 0 && pos >= outputPos) {
      output[pos--] = suffixes[c]!
      c = prefixes[c]!
    }
    outputPos += len
  }

  initTable()

  let bitPos = 0
  let prevCode = -1

  function readCode(): number {
    let code = 0
    for (let i = 0; i < codeSize; i++) {
      const byteIndex = (bitPos + i) >> 3
      const bitIndex = (bitPos + i) & 7
      if (byteIndex < data.length) {
        code |= ((data[byteIndex]! >> bitIndex) & 1) << i
      }
    }
    bitPos += codeSize
    return code
  }

  while (outputPos < pixelCount) {
    const code = readCode()

    if (code === clearCode) {
      initTable()
      prevCode = -1
      continue
    }

    if (code === eoiCode) break

    if (prevCode === -1) {
      // First code after clear
      if (code < nextCode) {
        outputCode(code)
        prevCode = code
      }
      continue
    }

    if (code < nextCode) {
      // Code exists in table
      outputCode(code)
      // Add new entry: prevCode string + first byte of current code string
      if (nextCode < maxTableSize) {
        prefixes[nextCode] = prevCode
        let c = code
        while (prefixes[c]! >= 0) c = prefixes[c]!
        suffixes[nextCode] = suffixes[c]!
        lengths[nextCode] = (lengths[prevCode] ?? 0) + 1
        nextCode++
      }
    } else {
      // Code not yet in table — special case
      // New string = prevCode string + first byte of prevCode string
      if (nextCode < maxTableSize) {
        prefixes[nextCode] = prevCode
        let c = prevCode
        while (prefixes[c]! >= 0) c = prefixes[c]!
        suffixes[nextCode] = suffixes[c]!
        lengths[nextCode] = (lengths[prevCode] ?? 0) + 1
        outputCode(nextCode)
        nextCode++
      }
    }

    if (nextCode > codeMask && codeSize < 12) {
      codeSize++
      codeMask = (1 << codeSize) - 1
    }

    prevCode = code
  }

  return output
}

function deinterlace(input: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(input.length)
  const passes = [
    { start: 0, step: 8 },
    { start: 4, step: 8 },
    { start: 2, step: 4 },
    { start: 1, step: 2 },
  ]
  let srcPos = 0
  for (const pass of passes) {
    for (let y = pass.start; y < height; y += pass.step) {
      const destPos = y * width
      for (let x = 0; x < width; x++) {
        output[destPos + x] = input[srcPos++] ?? 0
      }
    }
  }
  return output
}

// ── Silhouette extraction from GIF frame ────────────────────────

/**
 * Extract the max bounding silhouette across all extracted frames.
 * Returns an array of normalized Point[] (0..1 range) suitable for
 * the existing wrap-geometry polygon interval system.
 */
export async function extractGifSilhouette(
  gif: ExtractedGif,
  maxDimension = 320,
): Promise<{ x: number; y: number }[]> {
  const aspect = gif.width / gif.height
  const sampleW = aspect >= 1
    ? maxDimension
    : Math.max(64, Math.round(maxDimension * aspect))
  const sampleH = aspect >= 1
    ? Math.max(64, Math.round(maxDimension / aspect))
    : maxDimension

  // Accumulate max alpha across all frames
  const alphaAccum = new Uint8Array(sampleW * sampleH)

  const canvas = new OffscreenCanvas(sampleW, sampleH)
  const ctx = canvas.getContext('2d')!

  for (const frame of gif.frames) {
    ctx.clearRect(0, 0, sampleW, sampleH)
    ctx.drawImage(frame.bitmap, 0, 0, sampleW, sampleH)
    const imageData = ctx.getImageData(0, 0, sampleW, sampleH)
    for (let i = 0; i < sampleW * sampleH; i++) {
      const alpha = imageData.data[i * 4 + 3]!
      if (alpha > alphaAccum[i]!) alphaAccum[i] = alpha
    }
  }

  // Build left/right boundaries per row (same approach as wrap-geometry)
  const alphaThreshold = 12
  const lefts: (number | null)[] = new Array(sampleH).fill(null)
  const rights: (number | null)[] = new Array(sampleH).fill(null)

  for (let y = 0; y < sampleH; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < sampleW; x++) {
      if (alphaAccum[y * sampleW + x]! >= alphaThreshold) {
        if (left === -1) left = x
        right = x
      }
    }
    if (left !== -1) {
      lefts[y] = left
      rights[y] = right + 1
    }
  }

  // Collect valid rows
  const validRows: number[] = []
  for (let y = 0; y < sampleH; y++) {
    if (lefts[y] !== null) validRows.push(y)
  }
  if (validRows.length === 0) return []

  // Find bounds
  let boundLeft = Infinity
  let boundRight = -Infinity
  const boundTop = validRows[0]!
  const boundBottom = validRows[validRows.length - 1]!
  for (const y of validRows) {
    if (lefts[y]! < boundLeft) boundLeft = lefts[y]!
    if (rights[y]! > boundRight) boundRight = rights[y]!
  }
  const boundW = Math.max(1, boundRight - boundLeft)
  const boundH = Math.max(1, boundBottom - boundTop)

  // Sample ~52 rows and build polygon (left contour down, right contour up)
  const step = Math.max(1, Math.floor(validRows.length / 52))
  const sampled: number[] = []
  for (let i = 0; i < validRows.length; i += step) sampled.push(validRows[i]!)
  if (sampled[sampled.length - 1] !== validRows[validRows.length - 1]) {
    sampled.push(validRows[validRows.length - 1]!)
  }

  const points: { x: number; y: number }[] = []
  // Left contour (top to bottom)
  for (const y of sampled) {
    points.push({
      x: (lefts[y]! - boundLeft) / boundW,
      y: ((y + 0.5) - boundTop) / boundH,
    })
  }
  // Right contour (bottom to top)
  for (let i = sampled.length - 1; i >= 0; i--) {
    const y = sampled[i]!
    points.push({
      x: (rights[y]! - boundLeft) / boundW,
      y: ((y + 0.5) - boundTop) / boundH,
    })
  }

  return points
}

// ── Path drawing helpers ────────────────────────────────────────

/** Convert freehand drawn points into a smoothed TracedPath with bezier handles */
export function freehandToTracedPath(rawPoints: TracedPathPoint[], closed: boolean): TracedPath {
  if (rawPoints.length < 2) {
    return { points: rawPoints.map(p => ({ anchor: p })), closed }
  }

  // Simplify the path using Ramer-Douglas-Peucker
  const simplified = simplifyPath(rawPoints, 3.0)
  if (simplified.length < 2) {
    return { points: simplified.map(p => ({ anchor: p })), closed }
  }

  // Convert to bezier control points with smooth handles
  const controlPoints: TracedPathControlPoint[] = []

  for (let i = 0; i < simplified.length; i++) {
    const prev = simplified[(i - 1 + simplified.length) % simplified.length]!
    const curr = simplified[i]!
    const next = simplified[(i + 1) % simplified.length]!

    const isFirst = i === 0 && !closed
    const isLast = i === simplified.length - 1 && !closed

    if (isFirst || isLast) {
      controlPoints.push({ anchor: curr })
      continue
    }

    // Compute smooth handles based on neighboring points
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const smoothing = 0.25

    if (dist < 0.001) {
      controlPoints.push({ anchor: curr })
      continue
    }

    const unitX = dx / dist
    const unitY = dy / dist
    const prevDist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
    const nextDist = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2)

    controlPoints.push({
      anchor: curr,
      handleIn: {
        x: curr.x - unitX * prevDist * smoothing,
        y: curr.y - unitY * prevDist * smoothing,
      },
      handleOut: {
        x: curr.x + unitX * nextDist * smoothing,
        y: curr.y + unitY * nextDist * smoothing,
      },
    })
  }

  return { points: controlPoints, closed }
}

/** Ramer-Douglas-Peucker path simplification */
function simplifyPath(points: TracedPathPoint[], epsilon: number): TracedPathPoint[] {
  if (points.length <= 2) return points

  // Find the point with the max distance from the line between first and last
  let maxDist = 0
  let maxIndex = 0
  const first = points[0]!
  const last = points[points.length - 1]!

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last)
    if (d > maxDist) {
      maxDist = d
      maxIndex = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPath(points.slice(maxIndex), epsilon)
    return left.slice(0, -1).concat(right)
  }

  return [first, last]
}

function perpendicularDistance(point: TracedPathPoint, lineStart: TracedPathPoint, lineEnd: TracedPathPoint): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2)
  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / Math.sqrt(lengthSq)
}

/** Generate SVG path data string from a TracedPath for visual preview */
export function tracedPathToSvgPath(path: TracedPath): string {
  if (path.points.length === 0) return ''

  const parts: string[] = []
  const first = path.points[0]!
  parts.push(`M ${first.anchor.x} ${first.anchor.y}`)

  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i]!
    const b = path.points[i + 1]!
    const cp1 = a.handleOut ?? a.anchor
    const cp2 = b.handleIn ?? b.anchor
    // Check if this is actually a straight line (handles match anchors)
    if (cp1.x === a.anchor.x && cp1.y === a.anchor.y && cp2.x === b.anchor.x && cp2.y === b.anchor.y) {
      parts.push(`L ${b.anchor.x} ${b.anchor.y}`)
    } else {
      parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${b.anchor.x} ${b.anchor.y}`)
    }
  }

  if (path.closed && path.points.length > 1) {
    const last = path.points[path.points.length - 1]!
    const cp1 = last.handleOut ?? last.anchor
    const cp2 = first.handleIn ?? first.anchor
    if (cp1.x === last.anchor.x && cp1.y === last.anchor.y && cp2.x === first.anchor.x && cp2.y === first.anchor.y) {
      parts.push(`L ${first.anchor.x} ${first.anchor.y}`)
    } else {
      parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${first.anchor.x} ${first.anchor.y}`)
    }
    parts.push('Z')
  }

  return parts.join(' ')
}
