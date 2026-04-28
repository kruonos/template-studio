import type {
  ViewMode,
  ZoomMode,
} from './schema.ts'

export function getViewportPreviewWidth(viewMode: ViewMode, paperWidth: number): number {
  switch (viewMode) {
    case 'mobile':
      return Math.min(390, paperWidth)
    case 'tablet':
      return Math.min(600, paperWidth)
    case 'desktop':
      return paperWidth
  }
}

export function getBaseCanvasScale(viewMode: ViewMode, paperWidth: number): number {
  return getViewportPreviewWidth(viewMode, paperWidth) / Math.max(1, paperWidth)
}

export function getCanvasScale(options: {
  viewMode: ViewMode
  paperWidth: number
  zoomMode: ZoomMode
  zoom: number
  availableWidth: number
}): number {
  const baseScale = getBaseCanvasScale(options.viewMode, options.paperWidth)
  if (options.zoomMode === 'fit') {
    return Math.min(baseScale, options.availableWidth / Math.max(1, options.paperWidth))
  }
  return baseScale * options.zoom
}
