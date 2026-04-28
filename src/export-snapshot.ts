import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotItem,
  StudioState,
  TextProjection,
} from './schema.ts'
import { cloneData, clamp } from './utils.ts'
import { isTextBlock } from './utils.ts'

type ExportSnapshotHooks = {
  state: StudioState
  canvasWidth: () => number
  pageHeight: () => number
  pageMargin: () => number
  projectTextElement: (element: CanvasElement) => TextProjection
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
}

export function buildExportSnapshot(hooks: ExportSnapshotHooks): ExportSnapshot {
  const pages = Array.from({ length: hooks.state.pageCount }, (_, pageIndex) => ({
    pageIndex,
    items: [] as ExportSnapshotItem[],
  }))

  for (const element of hooks.state.elements) {
    if (isTextBlock(element.type)) continue
    const pageIndex = clamp(Math.floor(element.y / hooks.pageHeight()), 0, hooks.state.pageCount - 1)
    const pageY = element.y - pageIndex * hooks.pageHeight()
    pages[pageIndex]!.items.push({
      kind: 'block',
      element: cloneData(element),
      pageIndex,
      y: pageY,
    })
  }

  for (const element of hooks.state.elements) {
    if (!isTextBlock(element.type)) continue
    const projection = hooks.projectTextElement(element)
    for (const line of projection.lines) {
      const absoluteTop = element.y + line.y
      const pageIndex = clamp(Math.floor(absoluteTop / hooks.pageHeight()), 0, hooks.state.pageCount - 1)
      const pageY = absoluteTop - pageIndex * hooks.pageHeight()
      pages[pageIndex]!.items.push({
        kind: 'text-line',
        elementId: element.id,
        elementType: element.type,
        pageIndex,
        x: element.x + line.x,
        y: pageY,
        width: line.width,
        slotWidth: line.slotWidth,
        height: projection.lineHeight,
        text: line.text,
        font: projection.font,
        fontFamily: hooks.getElementFontFamily(element),
        fontSize: hooks.getElementFontSize(element),
        fontWeight: hooks.getElementFontWeight(element),
        fontStyle: element.styles.fontStyle ?? 'normal',
        lineHeight: projection.lineHeight,
        color: projection.color,
        textDecoration: (element.styles.textDecoration ?? 'none') as 'none' | 'underline',
        letterSpacing: element.styles.letterSpacing ?? 0,
        opacity: element.styles.opacity ?? 1,
      })
    }
  }

  return {
    templateName: hooks.state.templateName,
    description: hooks.state.description,
    canvasWidth: hooks.canvasWidth(),
    pageHeight: hooks.pageHeight(),
    pageMargin: hooks.pageMargin(),
    canvasHeight: hooks.state.canvasHeight,
    pageCount: hooks.state.pageCount,
    surfaceTheme: hooks.state.surfaceTheme,
    wrapMode: hooks.state.wrapMode,
    paperSizeId: hooks.state.paperSize.id,
    pages,
  }
}
