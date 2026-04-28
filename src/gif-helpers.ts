import { getPolygonIntervalForBand, transformWrapPoints, type Interval } from './wrap-geometry.ts'
import { extractGifFrames, extractGifSilhouette } from './animated-media.ts'
import { prepareUploadedVisualFile, type UploadedVisualKind } from './content.ts'
import type { CanvasElement } from './schema.ts'

type GifHullPoint = { x: number; y: number }

type GifHullHooks = {
  getHullCache: () => Map<string, GifHullPoint[] | null>
  getHullPending: () => Set<string>
  scheduleRender: () => void
  resolveGifSource: (element: CanvasElement) => string | null
}

type GifUploadHooks = GifHullHooks & {
  gifUploadInput: HTMLInputElement
  getUploadTargetId: () => string | null
  setUploadTargetId: (targetId: string | null) => void
  getElementById: (id: string) => CanvasElement | null
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionCache: () => void
  showToast: (message: string) => void
  reportError: (context: string, error: unknown) => void
}

export function primeGifHull(element: CanvasElement, hooks: GifHullHooks): void {
  if (element.type !== 'animated-gif' || (element.styles.gifHullMode ?? 'rect') !== 'silhouette') return
  const src = element.content.trim()
  if (src.length === 0 || !src.startsWith('data:image/gif')) return
  if (hooks.getHullCache().has(src) || hooks.getHullPending().has(src)) return
  hooks.getHullPending().add(src)
  void extractGifFrames(src)
    .then(gif => extractGifSilhouette(gif))
    .then(hull => {
      hooks.getHullCache().set(src, hull.length > 0 ? hull : null)
      hooks.getHullPending().delete(src)
      hooks.scheduleRender()
    })
    .catch(() => {
      hooks.getHullCache().set(src, null)
      hooks.getHullPending().delete(src)
    })
}

export function getGifSilhouetteInterval(
  textElement: CanvasElement,
  gif: CanvasElement,
  bandTop: number,
  bandBottom: number,
  padding: number,
  hooks: GifHullHooks,
): Interval | null {
  if ((gif.styles.gifHullMode ?? 'rect') !== 'silhouette') return null
  const src = hooks.resolveGifSource(gif)
  if (src === null || !src.startsWith('data:image/gif')) return null
  primeGifHull(gif, hooks)
  const hull = hooks.getHullCache().get(src)
  if (hull === undefined || hull === null) return null
  const transformed = transformWrapPoints(hull, {
    x: gif.x,
    y: gif.y,
    width: gif.width,
    height: gif.height,
  }, 0)
  const interval = getPolygonIntervalForBand(
    transformed,
    bandTop,
    bandBottom,
    Math.max(4, gif.width * 0.04),
    Math.max(2, gif.height * 0.02),
  )
  if (interval === null) return null
  const left = Math.max(padding, interval.left - textElement.x)
  const right = Math.min(textElement.width - padding, interval.right - textElement.x)
  if (left >= right) return null
  return { left, right }
}

export async function handleGifUpload(hooks: GifUploadHooks): Promise<void> {
  const file = hooks.gifUploadInput.files?.[0]
  if (file === undefined) return
  hooks.gifUploadInput.value = ''

  const targetId = hooks.getUploadTargetId()
  hooks.setUploadTargetId(null)
  if (targetId === null) {
    hooks.showToast('No target element for visual upload')
    return
  }
  const element = hooks.getElementById(targetId)
  if (element === null || element.type !== 'animated-gif') {
    hooks.showToast('Target element is not an animated visual')
    return
  }

  try {
    const result = await prepareUploadedVisualFile(file)
    const dataUrl = result.dataUrl
    hooks.recordState()
    element.content = dataUrl
    delete element.styles.gifFrameCount
    delete element.styles.gifDuration

    if (dataUrl.startsWith('data:image/gif')) {
      try {
        const gif = await extractGifFrames(dataUrl)
        element.styles.gifFrameCount = gif.frames.length
        element.styles.gifDuration = gif.totalDuration
        if ((element.styles.gifHullMode ?? 'rect') === 'silhouette') {
          primeGifHull(element, hooks)
        }
      } catch {
        // GIF metadata extraction failed, non-critical.
      }
    }

    hooks.markDirty()
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
    hooks.showToast(`${visualKindLabel(result.kind)} uploaded`)
  } catch (error) {
    hooks.reportError('Animated visual upload failed', error)
  }
}

function visualKindLabel(kind: UploadedVisualKind): string {
  switch (kind) {
    case 'gif':
      return 'GIF'
    case 'svg':
      return 'SVG'
    case 'svg-json':
      return 'SVG JSON'
    case 'lottie-json':
      return 'Lottie JSON'
    case 'image':
      return 'Image'
  }
}
