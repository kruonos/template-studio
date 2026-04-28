import { buildAbsoluteHtmlDocument as buildAbsoluteHtmlDocumentExport } from './html-export.ts'
import { buildPdfBlob as buildPdfBlobExport } from './pdf-export.ts'
import { buildDocxBlob as buildDocxBlobExport } from './docx-export.ts'
import {
  buildLegacyEmailHtmlDetailed as buildLegacyEmailHtmlDetailedExport,
  buildEmailText as buildEmailTextExport,
  type EmailExportResult,
} from './email-export.ts'
import { buildEmailHtmlWithFallback } from './export-controller.ts'
import type {
  CanvasElement,
  ExportSnapshot,
  TableCell,
  TableData,
  TextProjection,
  StudioState,
} from './schema.ts'
import { cellKey, getCell } from './table-engine.ts'
import { escapeAttribute, escapeHtml, escapeXml, roundTo } from './utils.ts'

type ExportAssemblyHooks = {
  state: StudioState
  docxMime: string
  buildExportSnapshot: () => ExportSnapshot
  resolveVariables: (text: string) => string
  normalizeHref: (value: string) => string | null
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getElementLineHeight: (element: CanvasElement) => number
  getElementTextColor: (element: CanvasElement) => string
  getElementFontShorthand: (element: CanvasElement) => string
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getImageSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getVideoHref: (element: CanvasElement) => string | null
  getMascotPresetLabel: (preset: string) => string
  getTableCellRenderState: (element: CanvasElement, tableData: TableData, cell: TableCell, rowIndex: number, content: string) => {
    rect: { x: number; y: number; width: number; height: number }
    padding: number
    bg: string
    borderTop: import('./schema.ts').CellBorderStyle
    borderRight: import('./schema.ts').CellBorderStyle
    borderBottom: import('./schema.ts').CellBorderStyle
    borderLeft: import('./schema.ts').CellBorderStyle
    projection: TextProjection
  }
  getResolvedTableCellContent: (cell: TableCell, data: TableData) => string
  getTableCellFontFamily: (cell: TableCell) => string
  getTableCellFontSize: (cell: TableCell) => number
  getTableCellFontWeight: (cell: TableCell) => number
  formatTableBorderCss: (border: TableData['defaultBorder']) => string
  parseTableData: (content: string) => TableData | null
  sanitizeHtml: (html: string) => string
  showToast: (message: string) => void
}

export function renderAbsoluteHtmlTableExport(element: CanvasElement, tableData: TableData, hooks: Pick<ExportAssemblyHooks, 'getResolvedTableCellContent' | 'getTableCellRenderState' | 'formatTableBorderCss'>): string {
  const visitedCells = new Set<string>()
  const parts: string[] = []

  parts.push(`<div style="position:absolute;left:${roundTo(element.x, 2)}px;top:${roundTo(element.y, 2)}px;width:${roundTo(element.width, 2)}px;height:${roundTo(element.height, 2)}px;overflow:hidden;">`)

  for (let row = 0; row < tableData.rows; row += 1) {
    for (let col = 0; col < tableData.cols; col += 1) {
      const key = cellKey(row, col)
      if (visitedCells.has(key)) continue
      const cell = getCell(tableData, row, col)
      if (cell === null) continue
      if (cell.row !== row || cell.col !== col) {
        visitedCells.add(key)
        continue
      }
      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) visitedCells.add(cellKey(row + dr, col + dc))
      }

      const content = hooks.getResolvedTableCellContent(cell, tableData)
      const renderState = hooks.getTableCellRenderState(element, tableData, cell, row, content)
      const { rect, bg, borderTop, borderRight, borderBottom, borderLeft, projection } = renderState
      const bgCss = bg.length > 0 ? `background:${escapeAttribute(bg)};` : ''
      parts.push(`<div style="position:absolute;left:${roundTo(rect.x, 2)}px;top:${roundTo(rect.y, 2)}px;width:${roundTo(rect.width, 2)}px;height:${roundTo(rect.height, 2)}px;border-top:${escapeAttribute(hooks.formatTableBorderCss(borderTop))};border-right:${escapeAttribute(hooks.formatTableBorderCss(borderRight))};border-bottom:${escapeAttribute(hooks.formatTableBorderCss(borderBottom))};border-left:${escapeAttribute(hooks.formatTableBorderCss(borderLeft))};${bgCss}overflow:hidden;">`)
      for (const line of projection.lines) {
        parts.push(`<div style="position:absolute;left:${roundTo(line.x, 2)}px;top:${roundTo(line.y, 2)}px;white-space:pre;font:${escapeAttribute(projection.font)};line-height:${projection.lineHeight}px;color:${escapeAttribute(projection.color)};text-decoration:${escapeAttribute(projection.textDecoration)};">${escapeHtml(line.text)}</div>`)
      }
      parts.push('</div>')
    }
  }

  parts.push('</div>')
  return parts.join('')
}

export async function buildPdfBlob(hooks: ExportAssemblyHooks): Promise<Blob> {
  return buildPdfBlobExport(hooks.buildExportSnapshot(), {
    importJsPdf: () => import('jspdf'),
    resolveVariables: hooks.resolveVariables,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
    getElementLineHeight: hooks.getElementLineHeight,
    getElementTextColor: hooks.getElementTextColor,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotPresetLabel: hooks.getMascotPresetLabel,
    getTableCellRenderState: hooks.getTableCellRenderState,
    getResolvedTableCellContent: hooks.getResolvedTableCellContent,
    getTableCellFontFamily: hooks.getTableCellFontFamily,
    getTableCellFontSize: hooks.getTableCellFontSize,
    getTableCellFontWeight: hooks.getTableCellFontWeight,
    getVideoHref: hooks.getVideoHref,
  })
}

export function buildAbsoluteHtmlDocument(
  options: { paged: boolean; printable: boolean; autoPrint: boolean },
  hooks: ExportAssemblyHooks,
): string {
  return buildAbsoluteHtmlDocumentExport(hooks.buildExportSnapshot(), {
    paged: options.paged,
    autoPrint: options.autoPrint,
  }, {
    resolveVariables: hooks.resolveVariables,
    renderAbsoluteHtmlTableExport: (element, tableData) => renderAbsoluteHtmlTableExport(element, tableData, hooks),
    getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
    getImageSource: hooks.getImageSource,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotSource: hooks.getMascotSource,
    getVideoHref: hooks.getVideoHref,
    sanitizeHtml: hooks.sanitizeHtml,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
  })
}

export function buildLegacyEmailHtml(hooks: ExportAssemblyHooks): string {
  return buildLegacyEmailHtmlResult(hooks).html
}

export function buildLegacyEmailHtmlResult(hooks: ExportAssemblyHooks): EmailExportResult {
  const snapshot = hooks.buildExportSnapshot()
  return buildLegacyEmailHtmlDetailedExport(snapshot, {
    resolveVariables: hooks.resolveVariables,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
    getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
    getVideoHref: hooks.getVideoHref,
    getImageSource: hooks.getImageSource,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotSource: hooks.getMascotSource,
    getTableCellRenderState: hooks.getTableCellRenderState,
    getResolvedTableCellContent: hooks.getResolvedTableCellContent,
    buildFlowBlocksOptions: {
      elements: hooks.state.elements,
      pageHeight: snapshot.pageHeight,
      pageCount: hooks.state.pageCount,
      resolveVariables: hooks.resolveVariables,
      getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
      getImageSource: hooks.getImageSource,
      getAnimatedGifSource: hooks.getAnimatedGifSource,
      getMascotSource: hooks.getMascotSource,
      getVideoHref: hooks.getVideoHref,
    },
  })
}

export function buildEmailHtml(hooks: ExportAssemblyHooks): string {
  const snapshot = hooks.buildExportSnapshot()
  if (hooks.state.emailFormat !== 'mjml') return buildLegacyEmailHtmlResult(hooks).html
  const result = buildEmailHtmlWithFallback({
    snapshot,
    breakpoint: hooks.state.emailBreakpoint,
    resolveVariables: hooks.resolveVariables,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
    buildLegacyHtml: () => buildLegacyEmailHtmlResult(hooks).html,
  })
  if (result.format === 'legacy' && result.warnings.length > 0) hooks.showToast(result.warnings[0]!)
  return result.html
}

export function buildEmailText(hooks: ExportAssemblyHooks): string {
  const snapshot = hooks.buildExportSnapshot()
  return buildEmailTextExport(snapshot, {
    resolveVariables: hooks.resolveVariables,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getElementFontWeight: hooks.getElementFontWeight,
    getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
    getVideoHref: hooks.getVideoHref,
    getImageSource: hooks.getImageSource,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotSource: hooks.getMascotSource,
    buildFlowBlocksOptions: {
      elements: hooks.state.elements,
      pageHeight: snapshot.pageHeight,
      pageCount: hooks.state.pageCount,
      resolveVariables: hooks.resolveVariables,
      getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
      getImageSource: hooks.getImageSource,
      getAnimatedGifSource: hooks.getAnimatedGifSource,
      getMascotSource: hooks.getMascotSource,
      getVideoHref: hooks.getVideoHref,
    },
  })
}

export async function buildDocxBlob(hooks: ExportAssemblyHooks): Promise<Blob> {
  const snapshot = hooks.buildExportSnapshot()
  return buildDocxBlobExport(snapshot, {
    resolveVariables: hooks.resolveVariables,
    escapeXml,
    getElementFontFamily: hooks.getElementFontFamily,
    getElementFontSize: hooks.getElementFontSize,
    getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
    getImageSource: hooks.getImageSource,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotSource: hooks.getMascotSource,
    getVideoHref: hooks.getVideoHref,
    buildFlowBlocksOptions: {
      elements: hooks.state.elements,
      pageHeight: snapshot.pageHeight,
      pageCount: hooks.state.pageCount,
      resolveVariables: hooks.resolveVariables,
      getButtonHref: element => hooks.normalizeHref(hooks.resolveVariables(element.styles.href ?? '')),
      getImageSource: hooks.getImageSource,
      getAnimatedGifSource: hooks.getAnimatedGifSource,
      getMascotSource: hooks.getMascotSource,
      getVideoHref: hooks.getVideoHref,
    },
  }, hooks.docxMime)
}
