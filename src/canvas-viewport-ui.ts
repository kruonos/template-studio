import type { StudioState } from './schema.ts'

type CanvasSurfaceTokens = {
  workbench: string
  pageBg: string
  pageBorder: string
  pageRule: string
  pageBreak: string
  pageShadow: string
}

type RenderCanvasViewportOptions = {
  state: StudioState
  canvasShell: HTMLDivElement
  canvasViewport: HTMLDivElement
  canvasSurface: HTMLDivElement
  zoomIndicator: HTMLElement
  canvasWidth: number
  canvasHeight: number
  canvasScale: number
  surface: CanvasSurfaceTokens
}

export function renderCanvasViewport(options: RenderCanvasViewportOptions): void {
  options.canvasSurface.style.width = `${options.canvasWidth}px`
  options.canvasSurface.style.height = `${options.canvasHeight}px`
  options.canvasSurface.style.setProperty('--surface-page-bg', options.surface.pageBg)
  options.canvasSurface.style.setProperty('--surface-page-border', options.surface.pageBorder)
  options.canvasSurface.style.setProperty('--surface-page-rule', options.surface.pageRule)
  options.canvasSurface.style.setProperty('--surface-page-break', options.surface.pageBreak)
  options.canvasSurface.style.setProperty('--surface-page-shadow', options.surface.pageShadow)
  options.canvasSurface.style.transform = `scale(${options.canvasScale})`
  options.canvasSurface.style.transformOrigin = 'top left'
  options.canvasViewport.style.width = `${Math.round(options.canvasWidth * options.canvasScale)}px`
  options.canvasViewport.style.height = `${Math.round(options.canvasHeight * options.canvasScale)}px`
  options.canvasViewport.style.background = options.surface.workbench
  options.canvasShell.dataset['viewMode'] = options.state.viewMode
  options.canvasShell.dataset['surfaceTheme'] = options.state.surfaceTheme
  options.zoomIndicator.textContent = options.state.zoomMode === 'fit'
    ? `Fit · ${Math.round(options.canvasScale * 100)}%`
    : `${Math.round(options.canvasScale * 100)}%`
}

export function renderPageGuides(
  pageGuides: HTMLDivElement,
  pageCount: number,
  pageHeight: number,
): void {
  pageGuides.replaceChildren()
  for (let index = 0; index < pageCount; index++) {
    const guide = document.createElement('div')
    guide.className = 'page-guide'
    guide.style.top = `${index * pageHeight}px`
    guide.style.height = `${pageHeight}px`
    const label = document.createElement('div')
    label.className = 'page-guide__label'
    label.textContent = `Page ${index + 1}`
    guide.append(label)
    pageGuides.append(guide)
    if (index > 0) {
      const breakLine = document.createElement('div')
      breakLine.className = 'page-break-line'
      breakLine.style.top = `${index * pageHeight}px`
      pageGuides.append(breakLine)
    }
  }
}
