import type {
  CanvasElement,
  ElementId,
  ElementType,
  ExportSnapshot,
  ExportSnapshotBlockItem,
  ExportSnapshotPage,
  ExportSnapshotTextItem,
  SurfaceTheme,
  TableCell,
  TableData,
  TextProjection,
} from './schema.ts'
import { getButtonLabelFontSize } from './element-typography.ts'
import { buildTableHtml, parseTableData } from './table-engine.ts'
import { escapeAttribute, escapeHtml, clamp } from './utils.ts'
import { getDefaultBackground, getDefaultBorderRadius, getSurfacePalette } from './theme.ts'
import { sanitizeHtml } from './content.ts'
import { buildEmailText as buildFlowEmailText, type BuildFlowBlocksOptions } from './flow-export.ts'

const DEFAULT_BAND_HEIGHT = 50

export type EmailExportHooks = {
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getButtonHref: (element: CanvasElement) => string | null
  getVideoHref: (element: CanvasElement) => string | null
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getTableCellRenderState?: (element: CanvasElement, tableData: TableData, cell: TableCell, rowIndex: number, content: string) => {
    rect: { x: number; y: number; width: number; height: number }
    padding: number
    bg: string
    borderTop: TableData['defaultBorder']
    borderRight: TableData['defaultBorder']
    borderBottom: TableData['defaultBorder']
    borderLeft: TableData['defaultBorder']
    projection: TextProjection
  }
  getResolvedTableCellContent?: (cell: TableCell, data: TableData) => string
  buildFlowBlocksOptions: Omit<BuildFlowBlocksOptions, 'elements' | 'pageHeight' | 'pageCount'> & {
    elements: CanvasElement[]
    pageHeight: number
    pageCount: number
  }
}

export type EmailExportWarningCode =
  | 'unsupported-element'
  | 'overlap-dropped'
  | 'clipped-to-page'
  | 'missing-source'
  | 'invalid-table-data'
  | 'table-cell-truncated'
  | 'dense-grid'
  | 'large-html'

export type EmailExportWarning = {
  code: EmailExportWarningCode
  message: string
  elementId?: string
  pageIndex?: number
}

export type EmailExportResult = {
  html: string
  warnings: EmailExportWarning[]
  stats: {
    estimatedHtmlBytes: number
    pageCount: number
  }
}

export type EmailRenderableElement = {
  id: string
  sourceId: string
  type: ElementType
  pageIndex: number
  order: number
  x: number
  y: number
  width: number
  height: number
  colStart: number
  colSpan: number
  startBand: number
  rowSpan: number
  topOffset: number
  blockItem: ExportSnapshotBlockItem | null
  textLines: ExportSnapshotTextItem[]
  element: CanvasElement | null
}

export type EmailTableGrid = {
  boundaries: number[]
  columnWidths: number[]
  columnCount: number
}

export type CanvasBandCell = {
  element: EmailRenderableElement
  startColumn: number
  colSpan: number
  rowSpan: number
  x: number
  width: number
  topOffset: number
}

export type CanvasBand = {
  pageIndex: number
  bandIndex: number
  y: number
  height: number
  cells: CanvasBandCell[]
}

export type BandToTableRowOptions = {
  grid: EmailTableGrid
  occupancy: ReadonlyArray<ReadonlyArray<string | null>>
  palette: ReturnType<typeof getSurfacePalette>
  surfaceTheme: SurfaceTheme
  hooks: EmailExportHooks
  warningSink: WarningSink
}

export type ElementToCellOptions = {
  palette: ReturnType<typeof getSurfacePalette>
  surfaceTheme: SurfaceTheme
  hooks: EmailExportHooks
  warningSink: WarningSink
}

type WarningSink = {
  warnings: EmailExportWarning[]
  seen: Set<string>
}

function createWarningSink(): WarningSink {
  return {
    warnings: [],
    seen: new Set<string>(),
  }
}

function addWarning(sink: WarningSink, warning: EmailExportWarning): void {
  const key = `${warning.code}|${warning.pageIndex ?? '-'}|${warning.elementId ?? '-'}|${warning.message}`
  if (sink.seen.has(key)) return
  sink.seen.add(key)
  sink.warnings.push(warning)
}

function buildDiagnosticsComment(warnings: EmailExportWarning[]): string {
  if (warnings.length === 0) return '<!-- Pretext email export: no compatibility warnings -->'
  const lines = warnings.map(warning => `- ${warning.message}`.replaceAll('--', '- -'))
  return `<!-- Pretext email export warnings:\n${lines.join('\n')}\n-->`
}

function buildEmailPreheader(snapshot: ExportSnapshot, hooks: EmailExportHooks): string {
  const ordered = hooks.buildFlowBlocksOptions.elements
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const chunks: string[] = []

  if (snapshot.templateName.trim().length > 0) chunks.push(snapshot.templateName.trim())
  for (const element of ordered) {
    if (element.type !== 'heading' && element.type !== 'text' && element.type !== 'button') continue
    const text = hooks.resolveVariables(element.content).replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue
    chunks.push(text)
    if (chunks.join(' ').length >= 140) break
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function buildLegacyEmailHtml(snapshot: ExportSnapshot, hooks: EmailExportHooks): string {
  return buildLegacyEmailHtmlDetailed(snapshot, hooks).html
}

export function buildLegacyEmailHtmlDetailed(snapshot: ExportSnapshot, hooks: EmailExportHooks): EmailExportResult {
  return exportCanvasToEmailTableDetailed(snapshot, hooks)
}

export function exportCanvasToEmailTable(
  snapshot: ExportSnapshot,
  hooks: EmailExportHooks,
  options: { bandHeight?: number } = {},
): string {
  return exportCanvasToEmailTableDetailed(snapshot, hooks, options).html
}

export function exportCanvasToEmailTableDetailed(
  snapshot: ExportSnapshot,
  hooks: EmailExportHooks,
  options: { bandHeight?: number } = {},
): EmailExportResult {
  const pages = getRenderablePages(snapshot)
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const bandHeight = Math.max(1, Math.round(options.bandHeight ?? DEFAULT_BAND_HEIGHT))
  const warningSink = createWarningSink()
  const pageTableHtmlParts = pages.map(page => buildEmailPageTable(page, snapshot, hooks, bandHeight, warningSink))
  const pageSeparator = pages.length > 1
    ? `<tr><td style="padding:0;height:24px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`
    : ''

  const innerRows = pageTableHtmlParts
    .map(html => `<tr><td align="center" style="padding:0;">${html}</td></tr>`)
    .join(pageSeparator.length > 0 ? `\n${pageSeparator}\n` : '\n')

  const preheaderText = buildEmailPreheader(snapshot, hooks)
  const diagnosticsComment = buildDiagnosticsComment(warningSink.warnings)
  const preheaderHtml = preheaderText.length > 0
    ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;mso-hide:all;">${escapeHtml(preheaderText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>${escapeHtml(snapshot.templateName)}</title>
<style>
body { margin: 0; padding: 0; -webkit-text-size-adjust: none; -ms-text-size-adjust: 100%; }
table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
td { padding: 0; }
img { display: block; border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${palette.exportFrame};-webkit-text-size-adjust:none;-ms-text-size-adjust:100%;mso-line-height-rule:exactly;">
  ${diagnosticsComment}
  ${preheaderHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:${palette.exportFrame};">
    <tr>
      <td align="center" style="padding:24px 0;background-color:${palette.exportFrame};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          ${innerRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const estimatedHtmlBytes = new TextEncoder().encode(html).length
  if (estimatedHtmlBytes > 200 * 1024) {
    addWarning(warningSink, {
      code: 'large-html',
      message: `Exported email HTML is ${Math.round(estimatedHtmlBytes / 1024)}KB; some ESPs or inboxes may clip large messages.`,
    })
  }

  const finalHtml = warningSink.warnings.some(warning => warning.code === 'large-html')
    ? html.replace(diagnosticsComment, buildDiagnosticsComment(warningSink.warnings))
    : html

  return {
    html: finalHtml,
    warnings: warningSink.warnings,
    stats: {
      estimatedHtmlBytes,
      pageCount: pages.length,
    },
  }
}

export function buildEmailText(snapshot: ExportSnapshot, hooks: EmailExportHooks): string {
  return buildFlowEmailText({
    ...hooks.buildFlowBlocksOptions,
    elements: hooks.buildFlowBlocksOptions.elements,
    pageHeight: snapshot.pageHeight,
    pageCount: snapshot.pageCount,
    resolveVariables: hooks.resolveVariables,
    getButtonHref: hooks.getButtonHref,
    getImageSource: hooks.getImageSource,
    getAnimatedGifSource: hooks.getAnimatedGifSource,
    getMascotSource: hooks.getMascotSource,
    getVideoHref: hooks.getVideoHref,
  })
}

function buildEmailPageTable(
  page: ExportSnapshotPage,
  snapshot: ExportSnapshot,
  hooks: EmailExportHooks,
  bandHeight: number,
  warningSink: WarningSink,
): string {
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const baseElements = collectRenderableElements(page, snapshot, hooks, warningSink)
  const grid = buildEmailTableGrid(baseElements, snapshot.canvasWidth)
  if (grid.columnCount > 48) {
    addWarning(warningSink, {
      code: 'dense-grid',
      pageIndex: page.pageIndex,
      message: `Page ${page.pageIndex + 1} expands to ${grid.columnCount} table columns; some email clients may render dense layouts less reliably.`,
    })
  }
  const placedElements = baseElements.map(element => attachBandPlacement(element, grid, snapshot.pageHeight, bandHeight))
  const acceptedElements = resolveElementConflicts(placedElements, Math.ceil(snapshot.pageHeight / bandHeight), grid.columnCount, warningSink)
  const bands = sliceToBands(acceptedElements, snapshot.pageHeight, bandHeight)
  const occupancy = buildOccupancyMatrix(acceptedElements, bands.length, grid.columnCount)
  const tableRows = bands
    .map(band => bandToTableRow(band, {
      grid,
      occupancy,
      palette,
      surfaceTheme: snapshot.surfaceTheme,
      hooks,
      warningSink,
    }))
    .join('\n')

  return `<!--[if mso]><table role="presentation" width="${snapshot.canvasWidth}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${snapshot.canvasWidth}px;background-color:${palette.pageBackground};"><tr><td valign="top"><![endif]--><table role="presentation" width="${snapshot.canvasWidth}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:${snapshot.canvasWidth}px;max-width:${snapshot.canvasWidth}px;background-color:${palette.pageBackground};">${renderColGroup(grid)}${tableRows}</table><!--[if mso]></td></tr></table><![endif]-->`
}

function collectRenderableElements(
  page: ExportSnapshotPage,
  snapshot: ExportSnapshot,
  hooks: EmailExportHooks,
  warningSink: WarningSink,
): EmailRenderableElement[] {
  const elementById = new Map(hooks.buildFlowBlocksOptions.elements.map((element, index) => [element.id, { element, index }]))
  const renderables: EmailRenderableElement[] = []
  const textLineGroups = new Map<ElementId, ExportSnapshotTextItem[]>()
  const textOrder: ElementId[] = []

  for (const item of page.items) {
    if (item.kind === 'block') {
      if (item.element.type === 'mascot') {
        addWarning(warningSink, {
          code: 'unsupported-element',
          pageIndex: page.pageIndex,
          elementId: item.element.id,
          message: `Mascot element "${item.element.id}" is ignored during email export.`,
        })
        continue
      }
      const order = elementById.get(item.element.id)?.index ?? renderables.length
      const bounds = clampRect(item.element.x, item.y, item.element.width, item.element.height, snapshot.canvasWidth, snapshot.pageHeight)
      if (bounds.clipped) {
        addWarning(warningSink, {
          code: 'clipped-to-page',
          pageIndex: page.pageIndex,
          elementId: item.element.id,
          message: `Element "${item.element.id}" extends outside the page bounds and was clipped for email export.`,
        })
      }
      renderables.push({
        id: item.element.id,
        sourceId: item.element.id,
        type: item.element.type,
        pageIndex: page.pageIndex,
        order,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        colStart: 0,
        colSpan: 1,
        startBand: 0,
        rowSpan: 1,
        topOffset: 0,
        blockItem: item,
        textLines: [],
        element: item.element,
      })
      continue
    }

    if (!textLineGroups.has(item.elementId)) textOrder.push(item.elementId)
    const existing = textLineGroups.get(item.elementId)
    if (existing === undefined) {
      textLineGroups.set(item.elementId, [item])
    } else {
      existing.push(item)
    }
  }

  for (const elementId of textOrder) {
    const lines = textLineGroups.get(elementId)
    if (lines === undefined || lines.length === 0) continue
    const order = elementById.get(elementId)?.index ?? renderables.length
    const sourceElement = elementById.get(elementId)?.element ?? null
    const lineBounds = getTextBounds(lines)
    const bounds = clampRect(
      sourceElement?.x ?? lineBounds.x,
      lineBounds.y,
      sourceElement?.width ?? lineBounds.width,
      lineBounds.height,
      snapshot.canvasWidth,
      snapshot.pageHeight,
    )
    if (bounds.clipped) {
      addWarning(warningSink, {
        code: 'clipped-to-page',
        pageIndex: page.pageIndex,
        elementId,
        message: `Text element "${elementId}" extends outside the page bounds and was clipped for email export.`,
      })
    }
    renderables.push({
      id: elementId,
      sourceId: elementId,
      type: lines[0]!.elementType,
      pageIndex: page.pageIndex,
      order,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      colStart: 0,
      colSpan: 1,
      startBand: 0,
      rowSpan: 1,
      topOffset: 0,
      blockItem: null,
      textLines: lines.slice().sort((a, b) => a.y - b.y || a.x - b.x),
      element: sourceElement,
    })
  }

  return renderables.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x)
}

function getRenderablePages(snapshot: ExportSnapshot): ExportSnapshotPage[] {
  let lastNonEmptyIndex = snapshot.pages.length - 1
  while (lastNonEmptyIndex > 0 && snapshot.pages[lastNonEmptyIndex]?.items.length === 0) lastNonEmptyIndex -= 1
  return snapshot.pages.slice(0, lastNonEmptyIndex + 1)
}

function getTextBounds(lines: ExportSnapshotTextItem[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    minX = Math.min(minX, line.x)
    minY = Math.min(minY, line.y)
    maxX = Math.max(maxX, line.x + Math.max(line.width, line.slotWidth))
    maxY = Math.max(maxY, line.y + line.lineHeight)
  }
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  }
}

function getLineSlotLeft(line: { x: number; width: number; slotWidth: number }, align: 'left' | 'center' | 'right'): number {
  if (align === 'center') return line.x - Math.max(0, (line.slotWidth - line.width) / 2)
  if (align === 'right') return line.x - Math.max(0, line.slotWidth - line.width)
  return line.x
}

function clampRect(
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { x: number; y: number; width: number; height: number; clipped: boolean } {
  const rawLeft = Math.round(x)
  const rawTop = Math.round(y)
  const rawRight = Math.round(x + width)
  const rawBottom = Math.round(y + height)
  const left = clamp(rawLeft, 0, Math.max(0, maxWidth - 1))
  const top = clamp(rawTop, 0, Math.max(0, maxHeight - 1))
  const right = clamp(rawRight, left + 1, maxWidth)
  const bottom = clamp(rawBottom, top + 1, maxHeight)
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    clipped: left !== rawLeft || top !== rawTop || right !== rawRight || bottom !== rawBottom,
  }
}

function attachBandPlacement(
  element: EmailRenderableElement,
  grid: EmailTableGrid,
  canvasHeight: number,
  bandHeight: number,
): EmailRenderableElement {
  const bandCount = Math.max(1, Math.ceil(canvasHeight / bandHeight))
  const startBand = clamp(Math.floor(element.y / bandHeight), 0, bandCount - 1)
  const endBand = clamp(Math.floor((element.y + Math.max(1, element.height) - 1) / bandHeight), startBand, bandCount - 1)
  const topOffset = Math.max(0, element.y - startBand * bandHeight)
  const startBoundaryIndex = findBoundaryIndex(grid.boundaries, element.x)
  const endBoundaryIndex = findBoundaryIndex(grid.boundaries, element.x + element.width)
  return {
    ...element,
    colStart: startBoundaryIndex,
    colSpan: Math.max(1, endBoundaryIndex - startBoundaryIndex),
    startBand,
    rowSpan: Math.max(1, endBand - startBand + 1),
    topOffset,
  }
}

function findBoundaryIndex(boundaries: number[], value: number): number {
  const index = boundaries.indexOf(value)
  if (index >= 0) return index
  for (let cursor = 0; cursor < boundaries.length - 1; cursor += 1) {
    const left = boundaries[cursor]!
    const right = boundaries[cursor + 1]!
    if (value >= left && value <= right) return cursor
  }
  return Math.max(0, boundaries.length - 2)
}

export function buildEmailTableGrid(elements: ReadonlyArray<Pick<EmailRenderableElement, 'x' | 'width'>>, canvasWidth: number): EmailTableGrid {
  const boundarySet = new Set<number>([0, Math.max(1, Math.round(canvasWidth))])
  for (const element of elements) {
    boundarySet.add(Math.max(0, Math.round(element.x)))
    boundarySet.add(clamp(Math.round(element.x + element.width), 1, Math.max(1, Math.round(canvasWidth))))
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b)
  const columnWidths: number[] = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    columnWidths.push(Math.max(1, boundaries[index + 1]! - boundaries[index]!))
  }
  return {
    boundaries,
    columnWidths,
    columnCount: columnWidths.length,
  }
}

function resolveElementConflicts(
  elements: EmailRenderableElement[],
  bandCount: number,
  columnCount: number,
  warningSink: WarningSink,
): EmailRenderableElement[] {
  const occupancy = createOccupancyMatrix(bandCount, columnCount)
  const accepted: EmailRenderableElement[] = []
  const sorted = elements.slice().sort((a, b) => b.order - a.order || a.y - b.y || a.x - b.x)

  for (const element of sorted) {
    let blocked = false
    for (let bandIndex = element.startBand; bandIndex < element.startBand + element.rowSpan && !blocked; bandIndex += 1) {
      for (let columnIndex = element.colStart; columnIndex < element.colStart + element.colSpan; columnIndex += 1) {
        if (occupancy[bandIndex]?.[columnIndex] !== null) {
          blocked = true
          break
        }
      }
    }
    if (blocked) {
      addWarning(warningSink, {
        code: 'overlap-dropped',
        pageIndex: element.pageIndex,
        elementId: element.id,
        message: `Element "${element.id}" overlaps a later canvas element and was dropped to keep the exported table layout stable.`,
      })
      continue
    }

    for (let bandIndex = element.startBand; bandIndex < element.startBand + element.rowSpan; bandIndex += 1) {
      for (let columnIndex = element.colStart; columnIndex < element.colStart + element.colSpan; columnIndex += 1) {
        occupancy[bandIndex]![columnIndex] = element.id
      }
    }
    accepted.push(element)
  }

  return accepted.sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order)
}

function createOccupancyMatrix(bandCount: number, columnCount: number): Array<Array<string | null>> {
  return Array.from({ length: bandCount }, () => Array.from({ length: columnCount }, () => null))
}

function buildOccupancyMatrix(
  elements: EmailRenderableElement[],
  bandCount: number,
  columnCount: number,
): Array<Array<string | null>> {
  const occupancy = createOccupancyMatrix(bandCount, columnCount)
  for (const element of elements) {
    for (let bandIndex = element.startBand; bandIndex < element.startBand + element.rowSpan; bandIndex += 1) {
      for (let columnIndex = element.colStart; columnIndex < element.colStart + element.colSpan; columnIndex += 1) {
        occupancy[bandIndex]![columnIndex] = element.id
      }
    }
  }
  return occupancy
}

export function sliceToBands(
  elements: EmailRenderableElement[],
  canvasHeight: number,
  bandHeight: number = DEFAULT_BAND_HEIGHT,
): CanvasBand[] {
  const safeBandHeight = Math.max(1, Math.round(bandHeight))
  const bandCount = Math.max(1, Math.ceil(canvasHeight / safeBandHeight))
  const bands: CanvasBand[] = Array.from({ length: bandCount }, (_, bandIndex) => {
    const top = bandIndex * safeBandHeight
    return {
      pageIndex: elements[0]?.pageIndex ?? 0,
      bandIndex,
      y: top,
      height: Math.max(1, Math.min(safeBandHeight, canvasHeight - top)),
      cells: [],
    }
  })

  for (const element of elements) {
    const startBand = clamp(Math.floor(element.y / safeBandHeight), 0, bandCount - 1)
    const cell: CanvasBandCell = {
      element,
      startColumn: element.colStart,
      colSpan: element.colSpan,
      rowSpan: element.rowSpan,
      x: element.x,
      width: element.width,
      topOffset: element.topOffset,
    }
    bands[startBand]!.cells.push(cell)
  }

  for (const band of bands) band.cells.sort((a, b) => a.x - b.x || a.startColumn - b.startColumn)
  return bands
}

function renderColGroup(grid: EmailTableGrid): string {
  return `<colgroup>${grid.columnWidths.map(width => `<col width="${width}" style="width:${width}px;">`).join('')}</colgroup>`
}

export function bandToTableRow(band: CanvasBand, options: BandToTableRowOptions): string {
  const startCellByColumn = new Map<number, CanvasBandCell>()
  for (const cell of band.cells) startCellByColumn.set(cell.startColumn, cell)

  const cells: string[] = []
  let columnIndex = 0
  while (columnIndex < options.grid.columnCount) {
    const startCell = startCellByColumn.get(columnIndex)
    if (startCell !== undefined) {
      const width = getColumnSpanWidth(options.grid.columnWidths, columnIndex, startCell.colSpan)
      const attrs = [
        startCell.colSpan > 1 ? `colspan="${startCell.colSpan}"` : '',
        startCell.rowSpan > 1 ? `rowspan="${startCell.rowSpan}"` : '',
        `width="${width}"`,
        `style="width:${width}px;padding:0;vertical-align:top;"`,
      ].filter(Boolean).join(' ')
      cells.push(`<td ${attrs}>${elementToCell(startCell, width, {
        palette: options.palette,
        surfaceTheme: options.surfaceTheme,
        hooks: options.hooks,
        warningSink: options.warningSink,
      })}</td>`)
      columnIndex += startCell.colSpan
      continue
    }

    const occupyingId = options.occupancy[band.bandIndex]?.[columnIndex] ?? null
    if (occupyingId !== null) {
      while (columnIndex < options.grid.columnCount && (options.occupancy[band.bandIndex]?.[columnIndex] ?? null) === occupyingId && !startCellByColumn.has(columnIndex)) {
        columnIndex += 1
      }
      continue
    }

    let span = 1
    while (
      columnIndex + span < options.grid.columnCount &&
      (options.occupancy[band.bandIndex]?.[columnIndex + span] ?? null) === null &&
      !startCellByColumn.has(columnIndex + span)
    ) {
      span += 1
    }
    const width = getColumnSpanWidth(options.grid.columnWidths, columnIndex, span)
    const attrs = [
      span > 1 ? `colspan="${span}"` : '',
      `width="${width}"`,
      `style="width:${width}px;height:${band.height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;"`,
    ].filter(Boolean).join(' ')
    cells.push(`<td ${attrs}>&nbsp;</td>`)
    columnIndex += span
  }

  if (cells.length === 0) {
    return `<tr height="${band.height}" style="height:${band.height}px;mso-height-source:userset;"></tr>`
  }
  return `<tr height="${band.height}" style="height:${band.height}px;mso-height-source:userset;">${cells.join('')}</tr>`
}

function getColumnSpanWidth(columnWidths: number[], startColumn: number, colSpan: number): number {
  let width = 0
  for (let index = startColumn; index < startColumn + colSpan && index < columnWidths.length; index += 1) width += columnWidths[index]!
  return Math.max(1, width)
}

export function elementToCell(cell: CanvasBandCell, availableWidth: number, options: ElementToCellOptions): string {
  const topSpacer = cell.topOffset > 0
    ? `<div style="height:${cell.topOffset}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div>`
    : ''
  if (cell.element.textLines.length > 0) return `${topSpacer}${renderTextElement(cell.element, availableWidth, options)}`
  if (cell.element.blockItem !== null) return `${topSpacer}${renderBlockElement(cell.element.blockItem, availableWidth, options)}`
  return topSpacer.length > 0 ? topSpacer : '&nbsp;'
}

function renderTextElement(
  element: EmailRenderableElement,
  availableWidth: number,
  options: ElementToCellOptions,
): string {
  const textLines = element.textLines.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  if (textLines.length === 0) return '&nbsp;'

  const sourceElement = element.element
  const fontFamily = sourceElement !== null ? options.hooks.getElementFontFamily(sourceElement) : (textLines[0]?.fontFamily ?? 'Arial, Helvetica, sans-serif')
  const fontSize = sourceElement !== null ? options.hooks.getElementFontSize(sourceElement) : (textLines[0]?.fontSize ?? 16)
  const fontWeight = sourceElement !== null ? options.hooks.getElementFontWeight(sourceElement) : (textLines[0]?.fontWeight ?? 400)
  const fontStyle = sourceElement?.styles.fontStyle ?? (textLines[0]?.fontStyle ?? 'normal')
  const textDecoration = sourceElement?.styles.textDecoration ?? (textLines[0]?.textDecoration ?? 'none')
  const align = sourceElement?.styles.textAlign ?? 'left'
  const letterSpacing = sourceElement?.styles.letterSpacing ?? (textLines[0]?.letterSpacing ?? 0)
  const color = textLines[0]?.color ?? options.palette.body
  const opacity = sourceElement?.styles.opacity ?? (textLines[0]?.opacity ?? 1)

  return renderProjectedTextTable(textLines, {
    originX: element.x,
    originY: element.y,
    boxWidth: availableWidth,
    align,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    lineHeight: textLines[0]?.lineHeight ?? fontSize,
    color,
    textDecoration,
    letterSpacing,
    opacity,
  })
}

type ProjectedTextLine = {
  x: number
  y: number
  text: string
  width: number
  slotWidth: number
}

function renderProjectedTextTable(
  lines: ReadonlyArray<ProjectedTextLine>,
  options: {
    originX: number
    originY: number
    boxWidth: number
    align: 'left' | 'center' | 'right'
    fontFamily: string
    fontSize: number
    fontWeight: number
    fontStyle: 'normal' | 'italic'
    lineHeight: number
    color: string
    textDecoration: 'none' | 'underline'
    letterSpacing: number
    opacity: number
  },
): string {
  const rowsByY = groupTextFragmentsByRow(lines, options.originX, options.originY, options.align, options.lineHeight)
  const rows: string[] = []
  let cursorY = 0

  for (const row of rowsByY) {
    const gap = row.offsetY - cursorY
    if (gap > 0) {
      rows.push(`<tr><td width="${options.boxWidth}" style="width:${options.boxWidth}px;height:${gap}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`)
      cursorY += gap
    }

    const rowCells: string[] = []
    let cursorX = 0
    for (const fragment of row.fragments) {
      const leftGap = Math.max(cursorX, clamp(fragment.left, 0, options.boxWidth))
      const gapWidth = leftGap - cursorX
      if (gapWidth > 0) {
        rowCells.push(renderGapCell(gapWidth))
        cursorX += gapWidth
      }

      const lineBoxWidth = clamp(fragment.width, 1, Math.max(1, options.boxWidth - cursorX))
      const lineStyle = [
        `width:${lineBoxWidth}px`,
        `padding:0`,
        `font-family:${escapeAttribute(options.fontFamily)}`,
        `font-size:${options.fontSize}px`,
        `font-weight:${options.fontWeight}`,
        options.fontStyle !== 'normal' ? `font-style:${options.fontStyle}` : '',
        `line-height:${row.lineHeight}px`,
        `mso-line-height-rule:exactly`,
        `color:${escapeAttribute(options.color)}`,
        `text-align:${options.align}`,
        options.textDecoration !== 'none' ? `text-decoration:${options.textDecoration}` : '',
        options.letterSpacing !== 0 ? `letter-spacing:${options.letterSpacing}px` : '',
        options.opacity < 1 ? `opacity:${options.opacity}` : '',
        `white-space:pre`,
      ].filter(Boolean).join(';')
      rowCells.push(`<td width="${lineBoxWidth}" style="${lineStyle}">${fragment.text.length > 0 ? escapeHtml(fragment.text) : '&nbsp;'}</td>`)
      cursorX += lineBoxWidth
    }

    const rightGap = Math.max(0, options.boxWidth - cursorX)
    if (rightGap > 0) rowCells.push(renderGapCell(rightGap))
    rows.push(`<tr>${rowCells.join('')}</tr>`)
    cursorY = row.offsetY + row.lineHeight
  }

  return `<table role="presentation" width="${options.boxWidth}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${options.boxWidth}px;table-layout:fixed;">${rows.join('')}</table>`
}

function groupTextFragmentsByRow(
  lines: ReadonlyArray<ProjectedTextLine>,
  originX: number,
  originY: number,
  align: 'left' | 'center' | 'right',
  fallbackLineHeight: number,
): Array<{
  offsetY: number
  lineHeight: number
  fragments: Array<{ left: number; width: number; text: string }>
}> {
  const rows: Array<{
    offsetY: number
    lineHeight: number
    fragments: Array<{ left: number; width: number; text: string }>
  }> = []

  for (const line of lines) {
    const offsetY = Math.max(0, Math.round(line.y - originY))
    const slotLeft = getLineSlotLeft(line, align)
    const left = Math.round(slotLeft - originX)
    const width = Math.max(1, Math.round(line.slotWidth))
    const existingRow = rows[rows.length - 1]
    if (existingRow !== undefined && existingRow.offsetY === offsetY) {
      existingRow.fragments.push({ left, width, text: line.text })
      existingRow.lineHeight = Math.max(existingRow.lineHeight, getProjectedLineHeight(line, existingRow.lineHeight))
      continue
    }
    rows.push({
      offsetY,
      lineHeight: getProjectedLineHeight(line, fallbackLineHeight),
      fragments: [{ left, width, text: line.text }],
    })
  }

  for (const row of rows) row.fragments.sort((a, b) => a.left - b.left)
  return rows
}

function getProjectedLineHeight(line: ProjectedTextLine, fallback: number): number {
  return 'lineHeight' in line && typeof line.lineHeight === 'number'
    ? Math.max(1, Math.round(line.lineHeight))
    : Math.max(1, Math.round(fallback))
}

function renderGapCell(width: number): string {
  if (width <= 0) return '<td width="0" style="width:0;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>'
  return `<td width="${width}" style="width:${width}px;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>`
}

function renderBlockElement(
  item: ExportSnapshotBlockItem,
  availableWidth: number,
  options: ElementToCellOptions,
): string {
  const element = item.element
  const width = Math.max(1, Math.round(availableWidth))
  const height = Math.max(1, Math.round(element.height))

  switch (element.type) {
    case 'image': {
      const src = options.hooks.getImageSource(element)
      if (src === null || src.length === 0) {
        addWarning(options.warningSink, {
          code: 'missing-source',
          pageIndex: item.pageIndex,
          elementId: element.id,
          message: `Image element "${element.id}" has no source; a placeholder was exported instead.`,
        })
        return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;background-color:#e8eef3;color:#607585;font-family:Arial, Helvetica, sans-serif;font-size:13px;font-weight:600;text-align:center;mso-line-height-rule:exactly;" valign="middle">Image placeholder</td></tr></table>`
      }
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('image')
      return `<img src="${escapeAttribute(src)}" alt="" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;${borderRadius > 0 ? `border-radius:${borderRadius}px;` : ''}border:0;outline:none;text-decoration:none;" />`
    }
    case 'button': {
      const href = options.hooks.getButtonHref(element) ?? '#'
      const background = element.styles.background ?? options.palette.buttonBackground
      const color = element.styles.color ?? options.palette.buttonText
      const fontFamily = options.hooks.getElementFontFamily(element)
      const fontSize = getButtonLabelFontSize(element)
      const fontWeight = options.hooks.getElementFontWeight(element)
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('button')
      const fontStyle = element.styles.fontStyle ?? 'normal'
      const textDecoration = element.styles.textDecoration ?? 'none'
      const letterSpacing = element.styles.letterSpacing ?? 0
      const label = escapeHtml(options.hooks.resolveVariables(element.content))
      const arcsize = getVmlArcSizePercent(borderRadius, width, height)
      return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeAttribute(href)}" style="height:${height}px;v-text-anchor:middle;width:${width}px;" arcsize="${arcsize}%" strokecolor="${background}" fillcolor="${background}"><w:anchorlock/><center style="color:${color};font-family:${escapeAttribute(fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};${letterSpacing !== 0 ? `letter-spacing:${letterSpacing}px;` : ''}text-decoration:${textDecoration};">${label}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${escapeAttribute(href)}" style="display:block;width:${width}px;height:${height}px;line-height:${height}px;text-align:center;text-decoration:${textDecoration};background-color:${background};color:${color};font-family:${escapeAttribute(fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};${letterSpacing !== 0 ? `letter-spacing:${letterSpacing}px;` : ''}border-radius:${borderRadius}px;mso-hide:all;">${label}</a><!--<![endif]-->`
    }
    case 'divider':
      return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;padding:0;" valign="middle"><div style="border-top:1px solid ${element.styles.color ?? options.palette.divider};font-size:0;line-height:0;height:0;">&nbsp;</div></td></tr></table>`
    case 'spacer':
      return `<div style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div>`
    case 'html': {
      const background = element.styles.background ?? getDefaultBackground('html', options.surfaceTheme)
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('html')
      const content = sanitizeHtml(options.hooks.resolveVariables(element.content))
      return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" style="width:${width}px;padding:14px;background-color:${background};${borderRadius > 0 ? `border-radius:${borderRadius}px;` : ''}color:${options.palette.body};font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:1.5;mso-line-height-rule:exactly;" valign="top">${content}</td></tr></table>`
    }
    case 'video': {
      const href = options.hooks.getVideoHref(element) ?? '#'
      if (href === '#') {
        addWarning(options.warningSink, {
          code: 'missing-source',
          pageIndex: item.pageIndex,
          elementId: element.id,
          message: `Video element "${element.id}" has no valid URL; a fallback button was exported without a real destination.`,
        })
      }
      const background = options.surfaceTheme === 'dark' ? '#111a23' : '#091019'
      const color = options.surfaceTheme === 'dark' ? '#eef5fb' : '#f2f6f9'
      return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;background-color:${background};text-align:center;font-family:Arial, Helvetica, sans-serif;font-size:14px;color:${color};" valign="middle"><a href="${escapeAttribute(href)}" style="color:${color};text-decoration:none;">&#9654; Open video</a></td></tr></table>`
    }
    case 'animated-gif': {
      const src = options.hooks.getAnimatedGifSource(element)
      if (src === null || src.length === 0) {
        addWarning(options.warningSink, {
          code: 'missing-source',
          pageIndex: item.pageIndex,
          elementId: element.id,
          message: `Animated visual element "${element.id}" has no source; a placeholder was exported instead.`,
        })
        return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;background-color:#e8eef3;color:#607585;font-family:Arial, Helvetica, sans-serif;font-size:13px;font-weight:600;text-align:center;mso-line-height-rule:exactly;" valign="middle">Animated visual</td></tr></table>`
      }
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('image')
      return `<img src="${escapeAttribute(src)}" alt="" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;${borderRadius > 0 ? `border-radius:${borderRadius}px;` : ''}border:0;outline:none;text-decoration:none;" />`
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      if (tableData === null) {
        addWarning(options.warningSink, {
          code: 'invalid-table-data',
          pageIndex: item.pageIndex,
          elementId: element.id,
          message: `Table element "${element.id}" contains malformed table data; an error placeholder was exported instead.`,
        })
        return renderInvalidTablePlaceholder(width, height)
      }
      if (options.hooks.getResolvedTableCellContent !== undefined && options.hooks.getTableCellRenderState !== undefined) {
        return renderProjectedTableElement(element, tableData, width, options)
      }
      const emailTableOptions: { striped?: boolean; stripeColor?: string; headerRows?: number } = {}
      if (element.styles.tableStriped !== undefined) emailTableOptions.striped = element.styles.tableStriped
      if (element.styles.tableStripeColor !== undefined) emailTableOptions.stripeColor = element.styles.tableStripeColor
      if (element.styles.tableHeaderRows !== undefined) emailTableOptions.headerRows = element.styles.tableHeaderRows
      return buildTableHtml(tableData, width, tableData.defaultBorder, options.hooks.resolveVariables, emailTableOptions)
    }
    case 'mascot': {
      return '&nbsp;'
    }
    default:
      return '&nbsp;'
  }
}

function renderInvalidTablePlaceholder(width: number, height: number): string {
  return `<table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:${width}px;"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;background-color:#fff3f2;color:#9f2d26;font-family:Arial, Helvetica, sans-serif;font-size:13px;font-weight:600;text-align:center;mso-line-height-rule:exactly;border:1px solid #f0b7b2;" valign="middle">Invalid table data</td></tr></table>`
}

function renderProjectedTableElement(
  element: CanvasElement,
  tableData: TableData,
  availableWidth: number,
  options: ElementToCellOptions,
): string {
  const getResolvedTableCellContent = options.hooks.getResolvedTableCellContent!
  const getTableCellRenderState = options.hooks.getTableCellRenderState!
  const colPixelWidths = getRoundedColumnWidths(tableData.colWidths, availableWidth)
  const visited = new Set<string>()
  const parts: string[] = []

  parts.push(`<table role="presentation" width="${availableWidth}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:${availableWidth}px;">`)
  parts.push('<colgroup>')
  for (const width of colPixelWidths) parts.push(`<col width="${width}" style="width:${width}px;">`)
  parts.push('</colgroup>')

  for (let rowIndex = 0; rowIndex < tableData.rows; rowIndex += 1) {
    const rowHeight = Math.max(1, Math.round(tableData.rowHeights[rowIndex]!))
    parts.push(`<tr style="height:${rowHeight}px;">`)
    for (let colIndex = 0; colIndex < tableData.cols; colIndex += 1) {
      const key = `${rowIndex},${colIndex}`
      if (visited.has(key)) continue
      const cell = tableData.cells.find(candidate => candidate.row === rowIndex && candidate.col === colIndex)
        ?? tableData.cells.find(candidate => rowIndex >= candidate.row && rowIndex < candidate.row + candidate.rowspan && colIndex >= candidate.col && colIndex < candidate.col + candidate.colspan)
      if (cell === undefined) continue
      if (cell.row !== rowIndex || cell.col !== colIndex) {
        visited.add(key)
        continue
      }

      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) visited.add(`${rowIndex + dr},${colIndex + dc}`)
      }

      const cellWidth = sumWidths(colPixelWidths, colIndex, cell.colspan)
      const content = getResolvedTableCellContent(cell, tableData)
      const renderState = getTableCellRenderState(element, tableData, cell, rowIndex, content)
      if (renderState.projection.truncated) {
        addWarning(options.warningSink, {
          code: 'table-cell-truncated',
          elementId: element.id,
          message: `Table element "${element.id}" has truncated cell content at row ${rowIndex + 1}, column ${colIndex + 1}.`,
        })
      }

      const tdAttrs = [
        cell.colspan > 1 ? `colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : '',
        `width="${cellWidth}"`,
        `valign="${mapVAlign(cell.styles.vAlign)}"`,
        `style="width:${cellWidth}px;height:${Math.max(1, Math.round(renderState.rect.height))}px;padding:0;border-top:${escapeAttribute(formatBorderCss(renderState.borderTop))};border-right:${escapeAttribute(formatBorderCss(renderState.borderRight))};border-bottom:${escapeAttribute(formatBorderCss(renderState.borderBottom))};border-left:${escapeAttribute(formatBorderCss(renderState.borderLeft))};${renderState.bg.length > 0 ? `background-color:${renderState.bg};` : ''}overflow:hidden;"`,
      ].filter(Boolean).join(' ')

      const fontFamily = cell.styles.fontFamily ?? 'Arial, Helvetica, sans-serif'
      const fontSize = cell.styles.fontSize ?? 13
      const fontWeight = cell.styles.fontWeight ?? 400
      const fontStyle = cell.styles.fontStyle ?? 'normal'
      const textColor = renderState.projection.color
      const textDecoration = renderState.projection.textDecoration as 'none' | 'underline'
      const align = cell.styles.hAlign ?? 'left'
      const inner = renderState.projection.lines.length > 0
        ? renderProjectedTextTable(renderState.projection.lines, {
          originX: 0,
          originY: 0,
          boxWidth: Math.max(1, Math.round(renderState.rect.width)),
          align,
          fontFamily,
          fontSize,
          fontWeight,
          fontStyle,
          lineHeight: renderState.projection.lineHeight,
          color: textColor,
          textDecoration,
          letterSpacing: 0,
          opacity: 1,
        })
        : (content.trim().length > 0 ? `<div style="padding:${renderState.padding}px;font-family:${escapeAttribute(fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};${fontStyle !== 'normal' ? `font-style:${fontStyle};` : ''}line-height:${renderState.projection.lineHeight}px;color:${escapeAttribute(textColor)};">${escapeHtml(content)}</div>` : '&nbsp;')
      parts.push(`<td ${tdAttrs}>${inner}</td>`)
    }
    parts.push('</tr>')
  }

  parts.push('</table>')
  return parts.join('')
}

function getRoundedColumnWidths(colWidths: number[], totalWidth: number): number[] {
  const safeWidth = Math.max(1, Math.round(totalWidth))
  const widths: number[] = []
  let consumed = 0
  let cumulative = 0
  for (let index = 0; index < colWidths.length; index += 1) {
    cumulative += colWidths[index] ?? 0
    const edge = index === colWidths.length - 1 ? safeWidth : Math.round(cumulative * safeWidth)
    widths.push(Math.max(1, edge - consumed))
    consumed = edge
  }
  return widths
}

function sumWidths(widths: number[], start: number, span: number): number {
  let total = 0
  for (let index = start; index < start + span && index < widths.length; index += 1) total += widths[index]!
  return Math.max(1, total)
}

function mapVAlign(value: TableCell['styles']['vAlign']): 'top' | 'middle' | 'bottom' {
  if (value === 'middle') return 'middle'
  if (value === 'bottom') return 'bottom'
  return 'top'
}

function formatBorderCss(border: TableData['defaultBorder']): string {
  return border.style === 'none' || border.width <= 0 ? 'none' : `${border.width}px ${border.style} ${border.color}`
}

function getVmlArcSizePercent(radius: number, width: number, height: number): number {
  if (radius <= 0) return 0
  const maxRadius = Math.max(1, Math.min(width, height) / 2)
  return Math.max(0, Math.min(50, Math.round((Math.min(radius, maxRadius) / maxRadius) * 50)))
}
