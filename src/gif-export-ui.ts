import type { CanvasElement, GifExportParams, StudioState } from './schema.ts'

type GifExportHooks = {
  state: StudioState
  gifExportOverlay: HTMLDivElement
  gifExportDurationInput: HTMLInputElement
  gifExportFpsInput: HTMLInputElement
  gifExportColorsSelect: HTMLSelectElement
  gifExportScaleSelect: HTMLSelectElement
  gifExportLoopInput: HTMLInputElement
  gifExportStatus: HTMLDivElement
  gifExportProgressBar: HTMLDivElement
  gifExportPreview: HTMLImageElement
  gifExportRenderButton: HTMLButtonElement
  gifExportDownloadButton: HTMLButtonElement
  getPreviewUrl: () => string | null
  setPreviewUrl: (url: string | null) => void
  clamp: (value: number, min: number, max: number) => number
  parseNumber: (value: string, fallback: number) => number
  slugifyFilename: (name: string) => string
  canvasWidth: () => number
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getElementLineHeight: (element: CanvasElement) => number
  getElementTextColor: (element: CanvasElement) => string
  getElementFontShorthand: (element: CanvasElement) => string
  getDefaultBorderRadius: (type: CanvasElement['type']) => number
  projectTextElement: (element: CanvasElement) => import('./schema.ts').TextProjection
  getTableData: (element: CanvasElement) => import('./schema.ts').TableData | null
  getCell: (data: import('./schema.ts').TableData, row: number, col: number) => import('./schema.ts').TableCell | null
  getResolvedTableCellContent: (cell: import('./schema.ts').TableCell, data: import('./schema.ts').TableData) => string
  getTableCellRenderState: (element: CanvasElement, data: import('./schema.ts').TableData, cell: import('./schema.ts').TableCell, rowIndex: number, content: string) => {
    rect: { x: number; y: number; width: number; height: number }
    padding: number
    bg: string
    borderTop: import('./schema.ts').CellBorderStyle
    borderRight: import('./schema.ts').CellBorderStyle
    borderBottom: import('./schema.ts').CellBorderStyle
    borderLeft: import('./schema.ts').CellBorderStyle
    projection: import('./schema.ts').TextProjection
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
  showToast: (message: string) => void
}

export function openGifExportDialog(hooks: Pick<GifExportHooks, 'gifExportStatus' | 'gifExportProgressBar' | 'gifExportRenderButton' | 'gifExportDownloadButton' | 'gifExportOverlay' | 'getPreviewUrl'>): void {
  hooks.gifExportStatus.textContent = 'Ready to render.'
  hooks.gifExportStatus.className = 'email-test-status'
  hooks.gifExportProgressBar.style.width = '0%'
  hooks.gifExportRenderButton.disabled = false
  hooks.gifExportDownloadButton.disabled = hooks.getPreviewUrl() === null
  hooks.gifExportOverlay.classList.add('open')
}

export function closeGifExportDialog(hooks: Pick<GifExportHooks, 'gifExportOverlay'>): void {
  hooks.gifExportOverlay.classList.remove('open')
}

export function getGifExportParams(hooks: Pick<GifExportHooks, 'gifExportDurationInput' | 'gifExportFpsInput' | 'gifExportColorsSelect' | 'gifExportScaleSelect' | 'gifExportLoopInput' | 'clamp' | 'parseNumber'>): GifExportParams {
  const durationSec = hooks.clamp(hooks.parseNumber(hooks.gifExportDurationInput.value, 4), 1, 20)
  const fps = hooks.clamp(hooks.parseNumber(hooks.gifExportFpsInput.value, 15), 5, 30)
  const colorsRaw = hooks.parseNumber(hooks.gifExportColorsSelect.value, 256)
  const colors = colorsRaw === 64 || colorsRaw === 128 || colorsRaw === 256 ? colorsRaw : 256
  const scaleRaw = Number.parseFloat(hooks.gifExportScaleSelect.value)
  const scale: 0.5 | 1 | 2 = scaleRaw === 0.5 || scaleRaw === 2 ? scaleRaw : 1
  const loopCount = Math.max(0, Math.round(hooks.parseNumber(hooks.gifExportLoopInput.value, 0)))
  return { durationSec, fps, colors, scale, loopCount }
}

export async function renderGifExport(hooks: GifExportHooks): Promise<void> {
  const params = getGifExportParams(hooks)
  hooks.gifExportRenderButton.disabled = true
  hooks.gifExportDownloadButton.disabled = true
  hooks.gifExportStatus.textContent = 'Preparing frames...'
  hooks.gifExportStatus.className = 'email-test-status'
  hooks.gifExportProgressBar.style.width = '0%'

  const { exportCanvasAsGif } = await import('./gif-exporter.ts')
  const result = await exportCanvasAsGif(params, {
    elements: hooks.state.elements,
    surfaceTheme: hooks.state.surfaceTheme,
    canvasWidth: hooks.canvasWidth(),
    canvasHeight: hooks.state.canvasHeight,
    selectedId: hooks.state.selectedId,
    selectedIds: hooks.state.selectedIds,
    resolveVariables: hooks.resolveVariables,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
    getElementLineHeight: hooks.getElementLineHeight,
    getElementTextColor: hooks.getElementTextColor,
    getElementFontShorthand: hooks.getElementFontShorthand,
    getDefaultBorderRadius: hooks.getDefaultBorderRadius,
    projectTextElement: hooks.projectTextElement,
    getTableData: hooks.getTableData,
    getCell: hooks.getCell,
    getResolvedTableCellContent: hooks.getResolvedTableCellContent,
    getTableCellRenderState: hooks.getTableCellRenderState,
    getTableCellFontFamily: hooks.getTableCellFontFamily,
    getTableCellFontSize: hooks.getTableCellFontSize,
    getTableCellFontWeight: hooks.getTableCellFontWeight,
    getTableCellLineHeight: hooks.getTableCellLineHeight,
    updateMascotPositions: hooks.updateMascotPositions,
    resetMascotBasePositions: hooks.resetMascotBasePositions,
    stopMascotAnimation: hooks.stopMascotAnimation,
    stopGifAnimation: hooks.stopGifAnimation,
    syncGifAnimation: hooks.syncGifAnimation,
    syncMascotAnimation: hooks.syncMascotAnimation,
    clearTextProjectionCache: hooks.clearTextProjectionCache,
    showProgress: (message, ratio) => {
      hooks.gifExportStatus.textContent = message
      hooks.gifExportProgressBar.style.width = `${Math.round(ratio * 100)}%`
    },
  })

  const previousUrl = hooks.getPreviewUrl()
  if (previousUrl !== null) URL.revokeObjectURL(previousUrl)
  const previewUrl = URL.createObjectURL(result.blob)
  hooks.setPreviewUrl(previewUrl)
  hooks.gifExportPreview.src = previewUrl
  hooks.gifExportPreview.classList.add('ready')
  hooks.gifExportPreview.dataset['filename'] = `${hooks.slugifyFilename(hooks.state.templateName)}.gif`
  hooks.gifExportStatus.textContent = `GIF ready · ${result.frameCount} frames · ${result.width}×${result.height}`
  hooks.gifExportStatus.className = 'email-test-status success'
  hooks.gifExportProgressBar.style.width = '100%'
  hooks.gifExportRenderButton.disabled = false
  hooks.gifExportDownloadButton.disabled = false
  hooks.showToast('Animated GIF exported')
}

export function downloadGifExport(
  hooks: Pick<GifExportHooks, 'gifExportPreview' | 'getPreviewUrl' | 'slugifyFilename' | 'state'>,
): void {
  const previewUrl = hooks.getPreviewUrl()
  if (previewUrl === null) return
  const filename = hooks.gifExportPreview.dataset['filename'] ?? `${hooks.slugifyFilename(hooks.state.templateName)}.gif`
  const link = document.createElement('a')
  link.href = previewUrl
  link.download = filename
  link.click()
}
