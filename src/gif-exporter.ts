import type {
  CanvasElement,
  CellBorderStyle,
  GifExportParams,
  SurfaceTheme,
  TableCell,
  TableData,
  TextProjection,
} from './schema.ts'
import { getGifFrameAtTime, type ExtractedGif, extractGifFrames, resetAllGifAnimStates, updateGifPositions } from './animated-media.ts'
import { getSurfacePalette } from './theme.ts'
import { sanitizeHtml } from './content.ts'
import { getMascotPresetSource } from './mascots.ts'
import { GifWriter } from 'omggif'

type GifExportHooks = {
  elements: CanvasElement[]
  surfaceTheme: SurfaceTheme
  canvasWidth: number
  canvasHeight: number
  selectedId: string | null
  selectedIds: Set<string>
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getElementLineHeight: (element: CanvasElement) => number
  getElementTextColor: (element: CanvasElement) => string
  getElementFontShorthand: (element: CanvasElement) => string
  getDefaultBorderRadius: (type: CanvasElement['type']) => number
  projectTextElement: (element: CanvasElement) => TextProjection
  getTableData: (element: CanvasElement) => import('./schema.ts').TableData | null
  getCell: (data: TableData, row: number, col: number) => TableCell | null
  getResolvedTableCellContent: (cell: TableCell, data: TableData) => string
  getTableCellRenderState: (
    element: CanvasElement,
    data: TableData,
    cell: TableCell,
    rowIndex: number,
    content: string,
  ) => {
    rect: { x: number; y: number; width: number; height: number }
    bg: string
    borderTop: CellBorderStyle
    borderRight: CellBorderStyle
    borderBottom: CellBorderStyle
    borderLeft: CellBorderStyle
    projection: TextProjection
  }
  getTableCellFontFamily: (cell: import('./schema.ts').TableCell) => string
  getTableCellFontSize: (cell: import('./schema.ts').TableCell) => number
  getTableCellFontWeight: (cell: import('./schema.ts').TableCell) => number
  getTableCellLineHeight: (cell: import('./schema.ts').TableCell) => number
  updateMascotPositions: (deltaMs: number) => boolean
  resetMascotBasePositions: () => void
  stopMascotAnimation: () => void
  stopGifAnimation: () => void
  syncGifAnimation: () => void
  syncMascotAnimation: () => void
  clearTextProjectionCache: () => void
  showProgress: (message: string, ratio: number) => void
}

type GifExportResult = {
  blob: Blob
  frameCount: number
  width: number
  height: number
}

type CachedImageAsset = {
  kind: 'image'
  image: HTMLImageElement | ImageBitmap
}

type CachedGifAsset = {
  kind: 'gif'
  gif: ExtractedGif
}

type CachedAsset = CachedImageAsset | CachedGifAsset

type UniformPalette = {
  colors: Uint32Array
  rCodeByValue: Uint8Array
  gCodeByValue: Uint8Array
  bIndexByValue: Uint8Array
}

export async function exportCanvasAsGif(params: GifExportParams, hooks: GifExportHooks): Promise<GifExportResult> {
  const width = Math.max(1, Math.round(hooks.canvasWidth * params.scale))
  const height = Math.max(1, Math.round(hooks.canvasHeight * params.scale))
  const totalFrames = Math.max(1, Math.round(params.durationSec * params.fps))
  const frameDelayMs = 1000 / params.fps
  const frameDelayCs = Math.max(2, Math.round(frameDelayMs / 10))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (ctx === null) throw new Error('Canvas 2D context unavailable for GIF export')
  ctx.imageSmoothingEnabled = true
  ctx.scale(params.scale, params.scale)

  const originalElements = hooks.elements.map(element => ({ id: element.id, x: element.x, y: element.y }))
  const assets = await preloadAssets(hooks.elements)
  const palette = buildUniformPalette(params.colors)
  const estimatedSize = Math.max(width * height * totalFrames * 2 + 1024 * 1024, 4 * 1024 * 1024)
  const output = new Uint8Array(estimatedSize)
  const writer = new GifWriter(output, width, height, { loop: params.loopCount, palette: palette.colors })
  const indexedPixels = new Uint8Array(width * height)

  hooks.stopMascotAnimation()
  hooks.stopGifAnimation()
  hooks.resetMascotBasePositions()
  resetAllGifAnimStates()
  hooks.syncGifAnimation()
  hooks.syncMascotAnimation()

  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      const timeMs = frameIndex * frameDelayMs
      if (frameIndex > 0) {
        hooks.updateMascotPositions(frameDelayMs)
        updateGifPositions(hooks.elements, frameDelayMs, hooks.selectedId, hooks.selectedIds, hooks.canvasWidth, hooks.canvasHeight)
      }
      hooks.clearTextProjectionCache()
      renderFrame(ctx, frameIndex, timeMs, hooks, assets)
      let imageData: ImageData
      try {
        imageData = ctx.getImageData(0, 0, width, height)
      } catch (error) {
        if (error instanceof DOMException && /insecure|taint/i.test(error.message)) {
          throw new Error('GIF export hit cross-origin media that cannot be read back from canvas. Re-upload remote images/GIFs as local files or data URLs for GIF export.')
        }
        throw error
      }
      quantizeToUniformPalette(imageData.data, palette, indexedPixels)
      writer.addFrame(0, 0, width, height, indexedPixels, {
        delay: frameDelayCs,
        disposal: 0,
      })
      hooks.showProgress(`Encoding GIF frame ${frameIndex + 1}/${totalFrames}...`, (frameIndex + 1) / totalFrames)
      if (frameIndex % 2 === 1) await new Promise<void>(resolve => setTimeout(resolve, 0))
    }

    hooks.showProgress('Finalizing GIF...', 0.98)
    const end = writer.end()
    return {
      blob: new Blob([output.slice(0, end)], { type: 'image/gif' }),
      frameCount: totalFrames,
      width,
      height,
    }
  } finally {
    for (const element of hooks.elements) {
      const original = originalElements.find(item => item.id === element.id)
      if (original !== undefined) {
        element.x = original.x
        element.y = original.y
      }
    }
    hooks.clearTextProjectionCache()
    hooks.resetMascotBasePositions()
    hooks.syncGifAnimation()
    hooks.syncMascotAnimation()
  }
}

async function preloadAssets(elements: CanvasElement[]): Promise<Map<string, CachedAsset>> {
  const cache = new Map<string, CachedAsset>()
  for (const element of elements) {
    if (element.type === 'image' || element.type === 'animated-gif' || element.type === 'mascot') {
      const src = element.type === 'mascot' ? (element.styles.mascotPreset === 'custom' && element.content.trim().length > 0 ? element.content : getMascotPresetSource(element.styles.mascotPreset ?? 'dragon')) : element.content.trim()
      if (src.length === 0 || cache.has(src) || !isCanvasSafeMediaSource(src)) continue
      try {
        if (element.type === 'animated-gif' && src.startsWith('data:image/gif')) {
          cache.set(src, { kind: 'gif', gif: await extractGifFrames(src) })
        } else {
          cache.set(src, { kind: 'image', image: await loadRenderableImage(src) })
        }
      } catch {
        // Keep export resilient; missing media falls back to placeholders.
      }
    }
  }
  return cache
}

async function loadRenderableImage(src: string): Promise<HTMLImageElement | ImageBitmap> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  await image.decode()
  return image
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  _frameIndex: number,
  timeMs: number,
  hooks: GifExportHooks,
  assets: Map<string, CachedAsset>,
): void {
  const palette = getSurfacePalette(hooks.surfaceTheme)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()

  ctx.fillStyle = palette.pageBackground
  ctx.fillRect(0, 0, hooks.canvasWidth, hooks.canvasHeight)

  for (const element of hooks.elements) {
    if (element.type === 'text' || element.type === 'heading') {
      drawTextElement(ctx, element, hooks)
    } else {
      drawBlockElement(ctx, element, timeMs, hooks, assets)
    }
  }
}

function drawTextElement(ctx: CanvasRenderingContext2D, element: CanvasElement, hooks: GifExportHooks): void {
  const projection = hooks.projectTextElement(element)
  for (const line of projection.lines) {
    ctx.save()
    ctx.globalAlpha = element.styles.opacity ?? 1
    ctx.font = projection.font
    ctx.fillStyle = projection.color
    ctx.textBaseline = 'top'
    if (element.styles.letterSpacing !== undefined && element.styles.letterSpacing !== 0) {
      drawTextWithLetterSpacing(ctx, line.text, element.x + line.x, element.y + line.y, element.styles.letterSpacing)
    } else {
      ctx.fillText(line.text, element.x + line.x, element.y + line.y)
    }
    if ((element.styles.textDecoration ?? 'none') === 'underline' && line.text.length > 0) {
      const y = element.y + line.y + projection.lineHeight
      const width = ctx.measureText(line.text).width + Math.max(0, line.text.length - 1) * (element.styles.letterSpacing ?? 0)
      ctx.fillRect(element.x + line.x, y, width, Math.max(1, getElementUnderlineThickness(element)))
    }
    ctx.restore()
  }
}

function drawBlockElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  timeMs: number,
  hooks: GifExportHooks,
  assets: Map<string, CachedAsset>,
): void {
  switch (element.type) {
    case 'image':
      drawImageLike(ctx, element, element.content.trim(), assets, timeMs)
      return
    case 'animated-gif':
      drawImageLike(ctx, element, element.content.trim(), assets, timeMs)
      return
    case 'mascot': {
      const src = element.styles.mascotPreset === 'custom' && element.content.trim().length > 0
        ? element.content
        : getMascotPresetSource(element.styles.mascotPreset ?? 'dragon')
      drawImageLike(ctx, element, src, assets, timeMs)
      if ((element.styles.mascotSpeech ?? '').trim().length > 0) {
        drawSpeechBubble(ctx, element, hooks.resolveVariables(element.styles.mascotSpeech ?? ''))
      }
      return
    }
    case 'button':
      drawButton(ctx, element, hooks)
      return
    case 'divider':
      ctx.save()
      ctx.strokeStyle = element.styles.color ?? getSurfacePalette(hooks.surfaceTheme).divider
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(element.x, element.y + element.height / 2)
      ctx.lineTo(element.x + element.width, element.y + element.height / 2)
      ctx.stroke()
      ctx.restore()
      return
    case 'spacer':
      return
    case 'html':
      drawHtmlPlaceholder(ctx, element, hooks)
      return
    case 'video':
      drawVideoBlock(ctx, element, hooks)
      return
    case 'table':
      drawTableBlock(ctx, element, hooks)
      return
    default:
      return
  }
}

function drawImageLike(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  src: string,
  assets: Map<string, CachedAsset>,
  timeMs: number,
): void {
  if (src.length === 0) {
    drawPlaceholder(ctx, element, element.type === 'animated-gif' ? 'Animated visual' : 'Image')
    return
  }
  if (!isCanvasSafeMediaSource(src)) {
    drawPlaceholder(ctx, element, element.type === 'mascot' ? 'Mascot' : element.type === 'animated-gif' ? 'Animated visual' : 'Image')
    return
  }
  const asset = assets.get(src)
  if (asset === undefined) {
    drawPlaceholder(ctx, element, element.type === 'mascot' ? 'Mascot' : element.type === 'animated-gif' ? 'Animated visual' : 'Image')
    return
  }
  ctx.save()
  ctx.globalAlpha = element.styles.opacity ?? 1
  applyRoundedClip(ctx, element.x, element.y, element.width, element.height, element.styles.borderRadius ?? 0)
  if (asset.kind === 'gif') {
    const frame = getGifFrameAtTime(asset.gif, timeMs)
    ctx.drawImage(frame.bitmap, element.x, element.y, element.width, element.height)
  } else {
    ctx.drawImage(asset.image, element.x, element.y, element.width, element.height)
  }
  ctx.restore()
}

function drawButton(ctx: CanvasRenderingContext2D, element: CanvasElement, hooks: GifExportHooks): void {
  const radius = element.styles.borderRadius ?? hooks.getDefaultBorderRadius(element.type)
  ctx.save()
  ctx.globalAlpha = element.styles.opacity ?? 1
  roundedRectPath(ctx, element.x, element.y, element.width, element.height, radius)
  ctx.fillStyle = element.styles.background ?? '#17384f'
  ctx.fill()
  ctx.font = `${element.styles.fontStyle ?? 'normal'} ${hooks.getElementFontWeight(element)} ${Math.round(hooks.getElementFontSize(element) * 0.9)}px ${hooks.getElementFontFamily(element)}`
  ctx.fillStyle = element.styles.color ?? '#f8fffd'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(hooks.resolveVariables(element.content), element.x + element.width / 2, element.y + element.height / 2)
  ctx.restore()
}

function drawHtmlPlaceholder(ctx: CanvasRenderingContext2D, element: CanvasElement, hooks: GifExportHooks): void {
  ctx.save()
  ctx.globalAlpha = element.styles.opacity ?? 1
  const bg = element.styles.background ?? '#fff4ef'
  const radius = element.styles.borderRadius ?? hooks.getDefaultBorderRadius(element.type)
  roundedRectPath(ctx, element.x, element.y, element.width, element.height, radius)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = '#f0d2bf'
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])
  const lines = sanitizeHtml(hooks.resolveVariables(element.content)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  ctx.font = `normal 600 14px ${hooks.getElementFontFamily({ ...element, type: 'button' })}`
  ctx.fillStyle = '#394a5a'
  ctx.textBaseline = 'top'
  wrapPlainText(ctx, lines, element.x + 14, element.y + 14, element.width - 28, 20, Math.max(0, element.height - 28))
  ctx.restore()
}

function drawVideoBlock(ctx: CanvasRenderingContext2D, element: CanvasElement, hooks: GifExportHooks): void {
  ctx.save()
  ctx.globalAlpha = element.styles.opacity ?? 1
  ctx.fillStyle = hooks.surfaceTheme === 'dark' ? '#111a23' : '#091019'
  ctx.fillRect(element.x, element.y, element.width, element.height)
  ctx.font = `normal 600 14px ${hooks.getElementFontFamily({ ...element, type: 'button' })}`
  ctx.fillStyle = hooks.surfaceTheme === 'dark' ? '#eef5fb' : '#f2f6f9'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('Open video', element.x + element.width / 2, element.y + element.height / 2)
  ctx.restore()
}

function drawTableBlock(ctx: CanvasRenderingContext2D, element: CanvasElement, hooks: GifExportHooks): void {
  const data = hooks.getTableData(element)
  if (data === null) {
    drawPlaceholder(ctx, element, 'Table')
    return
  }
  const visited = new Set<string>()
  for (let r = 0; r < data.rows; r += 1) {
    for (let c = 0; c < data.cols; c += 1) {
      const key = `${r}:${c}`
      if (visited.has(key)) continue
      const cell = hooks.getCell(data, r, c)
      if (cell === null || cell.row !== r || cell.col !== c) {
        visited.add(key)
        continue
      }
      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) visited.add(`${r + dr}:${c + dc}`)
      }
      const content = hooks.getResolvedTableCellContent(cell, data)
      const renderState = hooks.getTableCellRenderState(element, data, cell, r, content)
      const { rect, bg, borderTop, borderRight, borderBottom, borderLeft, projection } = renderState
      const x = element.x + rect.x
      const y = element.y + rect.y
      if (bg.length > 0) {
        ctx.fillStyle = bg
        ctx.fillRect(x, y, rect.width, rect.height)
      }
      drawBorder(ctx, x, y, rect.width, rect.height, 'top', borderTop)
      drawBorder(ctx, x, y, rect.width, rect.height, 'right', borderRight)
      drawBorder(ctx, x, y, rect.width, rect.height, 'bottom', borderBottom)
      drawBorder(ctx, x, y, rect.width, rect.height, 'left', borderLeft)
      ctx.save()
      ctx.fillStyle = projection.color
      ctx.font = `${cell.styles.fontStyle ?? 'normal'} ${hooks.getTableCellFontWeight(cell)} ${hooks.getTableCellFontSize(cell)}px ${hooks.getTableCellFontFamily(cell)}`
      ctx.textBaseline = 'top'
      for (const line of projection.lines) {
        ctx.fillText(line.text, x + line.x, y + line.y)
      }
      ctx.restore()
    }
  }
}

function drawBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  edge: 'top' | 'right' | 'bottom' | 'left',
  border: import('./schema.ts').CellBorderStyle,
): void {
  if (border.style === 'none' || border.width <= 0) return
  ctx.save()
  ctx.strokeStyle = border.color
  ctx.lineWidth = border.width
  if (border.style === 'dashed') ctx.setLineDash([6, 4])
  if (border.style === 'dotted') ctx.setLineDash([2, 3])
  ctx.beginPath()
  if (edge === 'top') { ctx.moveTo(x, y); ctx.lineTo(x + width, y) }
  if (edge === 'right') { ctx.moveTo(x + width, y); ctx.lineTo(x + width, y + height) }
  if (edge === 'bottom') { ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height) }
  if (edge === 'left') { ctx.moveTo(x, y); ctx.lineTo(x, y + height) }
  ctx.stroke()
  ctx.restore()
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, element: CanvasElement, text: string): void {
  ctx.save()
  ctx.font = `normal 12px "Avenir Next", "Segoe UI", sans-serif`
  const metrics = ctx.measureText(text)
  const bubbleWidth = Math.min(200, Math.ceil(metrics.width + 24))
  const bubbleHeight = 30
  const x = element.x + element.width / 2 - bubbleWidth / 2
  const y = element.y - bubbleHeight - 6
  roundedRectPath(ctx, x, y, bubbleWidth, bubbleHeight, 12)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 8
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#1a2b3a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + bubbleWidth / 2, y + bubbleHeight / 2)
  ctx.restore()
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, element: CanvasElement, label: string): void {
  ctx.save()
  ctx.fillStyle = '#e8eef3'
  ctx.fillRect(element.x, element.y, element.width, element.height)
  ctx.fillStyle = '#607585'
  ctx.font = '600 13px "Avenir Next", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, element.x + element.width / 2, element.y + element.height / 2)
  ctx.restore()
}

function applyRoundedClip(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  roundedRectPath(ctx, x, y, width, height, radius)
  ctx.clip()
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number): void {
  let cursor = x
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + letterSpacing
  }
}

function wrapPlainText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxHeight: number): void {
  const words = text.split(/\s+/)
  let line = ''
  let top = y
  for (const word of words) {
    const next = line.length > 0 ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line.length > 0) {
      if (top + lineHeight > y + maxHeight) break
      ctx.fillText(line, x, top)
      line = word
      top += lineHeight
    } else {
      line = next
    }
  }
  if (line.length > 0 && top + lineHeight <= y + maxHeight) ctx.fillText(line, x, top)
}

function getElementUnderlineThickness(element: CanvasElement): number {
  return Math.max(1, Math.round((element.styles.fontSize ?? 18) * 0.05))
}

function isCanvasSafeMediaSource(src: string): boolean {
  if (src.startsWith('data:image/')) return true
  try {
    const parsed = new URL(src, window.location.origin)
    return parsed.origin === window.location.origin
  } catch {
    return false
  }
}

function buildUniformPalette(colorCount: 64 | 128 | 256): UniformPalette {
  if (colorCount === 64) return buildCubePalette(4, 4, 4)
  if (colorCount === 128) return buildCubePalette(8, 4, 4)
  return buildCubePalette(8, 8, 4)
}

function buildCubePalette(rSteps: number, gSteps: number, bSteps: number): UniformPalette {
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
  return {
    colors: Uint32Array.from(colors),
    rCodeByValue: buildChannelLookup(rSteps, gSteps * bSteps),
    gCodeByValue: buildChannelLookup(gSteps, bSteps),
    bIndexByValue: buildChannelLookup(bSteps, 1),
  }
}

function buildChannelLookup(stepCount: number, multiplier: number): Uint8Array {
  const lookup = new Uint8Array(256)
  if (stepCount <= 1) return lookup
  const maxIndex = stepCount - 1
  for (let value = 0; value < 256; value += 1) {
    lookup[value] = Math.round((value * maxIndex) / 255) * multiplier
  }
  return lookup
}

function quantizeToUniformPalette(rgba: Uint8ClampedArray, palette: UniformPalette, output: Uint8Array): void {
  const { rCodeByValue, gCodeByValue, bIndexByValue } = palette
  for (let pixelIndex = 0, rgbaIndex = 0; pixelIndex < output.length; pixelIndex += 1, rgbaIndex += 4) {
    const r = rgba[rgbaIndex]!
    const g = rgba[rgbaIndex + 1]!
    const b = rgba[rgbaIndex + 2]!
    output[pixelIndex] = (rCodeByValue[r] ?? 0) + (gCodeByValue[g] ?? 0) + (bIndexByValue[b] ?? 0)
  }
}
