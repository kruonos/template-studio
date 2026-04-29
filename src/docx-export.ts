import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotItem,
  ExportSnapshotTextItem,
  TableCell,
  TableData,
} from './schema.ts'
import { cellKey, getCell, parseTableData } from './table-engine.ts'
import { getRenderableExportPages } from './export-pages.ts'
import { getSurfacePalette } from './theme.ts'
import type { BuildFlowBlocksOptions } from './flow-export.ts'
import { stripHtmlToText, canvasToBlob, loadImageElement } from './content.ts'
import { toDocxColor } from './utils.ts'

type DocxExportHooks = {
  resolveVariables: (text: string) => string
  escapeXml: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getButtonHref: (element: CanvasElement) => string | null
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getVideoHref: (element: CanvasElement) => string | null
  buildFlowBlocksOptions: Omit<BuildFlowBlocksOptions, 'elements' | 'pageHeight' | 'pageCount'> & {
    elements: CanvasElement[]
    pageHeight: number
    pageCount: number
  }
}

type DocxMedia = {
  blockId: string
  relationshipId: string
  entryName: string
  bytes: Uint8Array
  drawingId: number
}

type ZipEntry = {
  name: string
  data: Uint8Array
}

export async function buildDocxBlob(snapshot: ExportSnapshot, hooks: DocxExportHooks, mimeType: string): Promise<Blob> {
  const now = new Date().toISOString()
  const media = await collectDocxMedia(snapshot, hooks)
  const documentXml = buildDocxDocumentXml(snapshot, media, hooks)
  return buildDocxPackage(snapshot, media, documentXml, mimeType, now)
}

function buildDocxPackage(snapshot: ExportSnapshot, media: DocxMedia[], documentXml: string, mimeType: string, timestamp = new Date().toISOString()): Blob {
  const entries = [
    zipEntry('[Content_Types].xml', buildDocxContentTypesXml(media)),
    zipEntry('_rels/.rels', buildDocxRootRelationshipsXml()),
    zipEntry('docProps/core.xml', buildDocxCoreXml(snapshot.templateName, timestamp)),
    zipEntry('docProps/app.xml', buildDocxAppXml()),
    zipEntry('word/document.xml', documentXml),
    zipEntry('word/_rels/document.xml.rels', buildDocxDocumentRelationshipsXml(media)),
  ]
  for (const item of media) {
    entries.push({ name: `word/media/${item.entryName}`, data: item.bytes })
  }
  const zipBytes = buildZip(entries)
  const arrayBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(arrayBuffer).set(zipBytes)
  return new Blob([arrayBuffer], { type: mimeType })
}

async function collectDocxMedia(snapshot: ExportSnapshot, hooks: DocxExportHooks): Promise<DocxMedia[]> {
  const media: DocxMedia[] = []
  let relationshipCounter = 1
  for (const page of getRenderableExportPages(snapshot)) {
    for (const item of page.items) {
      if (item.kind !== 'block') continue
      const element = item.element
      if (element.type !== 'image' && element.type !== 'animated-gif' && element.type !== 'mascot') continue
      const src = element.type === 'image'
        ? hooks.getImageSource(element)
        : element.type === 'animated-gif'
          ? hooks.getAnimatedGifSource(element)
          : hooks.getMascotSource(element)
      if (src === null || src.length === 0) continue
      const image = await resolveDocxImage(src)
      if (image === null) continue
      media.push({
        blockId: element.id,
        relationshipId: `rId${relationshipCounter++}`,
        entryName: `image-${media.length + 1}.png`,
        bytes: image.bytes,
        drawingId: media.length + 1,
      })
    }
  }
  return media
}

async function resolveDocxImage(src: string): Promise<{ bytes: Uint8Array } | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`Image fetch failed with ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = await loadImageElement(objectUrl)
      const width = Math.max(1, image.naturalWidth || image.width)
      const height = Math.max(1, image.naturalHeight || image.height)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('Canvas 2D context unavailable for DOCX image rendering')
      context.drawImage(image, 0, 0, width, height)
      const pngBlob = await canvasToBlob(canvas, 'image/png')
      return { bytes: new Uint8Array(await pngBlob.arrayBuffer()) }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

function buildDocxDocumentXml(snapshot: ExportSnapshot, media: DocxMedia[], hooks: DocxExportHooks): string {
  const pages = getRenderableExportPages(snapshot)
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const mediaByBlockId = new Map(media.map(item => [item.blockId, item]))
  const bodyParts: string[] = []

  pages.forEach((page, pageIndex) => {
    const pageFill = toDocxColor(palette.pageBackground, 'FFFFFF')
    bodyParts.push(positioningAnchorParagraphXml(positionedFillShapeXml(`page-bg-${page.pageIndex}`, 0, 0, snapshot.canvasWidth, snapshot.pageHeight, pageFill, -1, hooks.escapeXml)))
    bodyParts.push(positioningAnchorParagraphXml(page.items.map((item, itemIndex) => positionedItemXml(item, snapshot, mediaByBlockId, hooks, itemIndex + 1)).join('')))
    if (pageIndex < pages.length - 1) bodyParts.push(pageBreakParagraphXml())
  })

  const pgWidthTwips = Math.round(snapshot.canvasWidth * 15)
  const pgHeightTwips = Math.round(snapshot.pageHeight * 15)

return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join('')}
    <w:sectPr>
      <w:pgSz w:w="${pgWidthTwips}" w:h="${pgHeightTwips}" />
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0" />
    </w:sectPr>
  </w:body>
</w:document>`
}

function positioningAnchorParagraphXml(content: string): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r>${content}</w:r></w:p>`
}

function pageBreakParagraphXml(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function positionedItemXml(
  item: ExportSnapshotItem,
  snapshot: ExportSnapshot,
  mediaByBlockId: Map<string, DocxMedia>,
  hooks: DocxExportHooks,
  zIndex: number,
): string {
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  if (item.kind === 'text-line') {
    return positionedTextBoxXml({
      id: `${item.elementId}-${zIndex}`,
      x: item.x,
      y: item.y,
      width: Math.max(item.slotWidth, item.width, 1),
      height: Math.max(item.height, item.lineHeight, 1),
      fillColor: 'none',
      zIndex,
      content: renderTextLineParagraphXml(item, hooks.escapeXml),
      escapeXml: hooks.escapeXml,
    })
  }

  const element = item.element
  switch (element.type) {
    case 'image':
    case 'animated-gif':
    case 'mascot': {
      const image = mediaByBlockId.get(element.id)
      if (image !== undefined) return positionedImageXml(element.id, element.x, item.y, element.width, element.height, image, hooks.escapeXml, zIndex)
      return positionedTextBoxXml({
        id: `missing-${element.id}`,
        x: element.x,
        y: item.y,
        width: element.width,
        height: element.height,
        fillColor: 'none',
        zIndex,
        content: textParagraphXml(`[${element.type}]`, {
          fontFamily: 'Arial',
          fontSize: 12,
          fontWeight: 600,
          fontStyle: 'normal',
          lineHeight: 16,
          color: '5B6F7F',
          align: 'center',
          escapeXml: hooks.escapeXml,
        }),
        escapeXml: hooks.escapeXml,
      })
    }
    case 'button':
      return positionedTextBoxXml({
        id: element.id,
        x: element.x,
        y: item.y,
        width: element.width,
        height: element.height,
        fillColor: toDocxColor(element.styles.background, palette.buttonBackground),
        zIndex,
        insetPx: 12,
        content: textParagraphXml(hooks.resolveVariables(element.content), {
          fontFamily: hooks.getElementFontFamily(element),
          fontSize: Math.max(10, Math.round(hooks.getElementFontSize(element) * 0.9)),
          fontWeight: element.styles.fontWeight ?? 700,
          fontStyle: element.styles.fontStyle ?? 'normal',
          lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.2)),
          color: toDocxColor(element.styles.color, palette.buttonText),
          textDecoration: element.styles.textDecoration ?? 'none',
          align: 'center',
          escapeXml: hooks.escapeXml,
        }),
        escapeXml: hooks.escapeXml,
      })
    case 'divider':
      return positionedDividerXml(element.x, item.y + element.height / 2, element.width, toDocxColor(element.styles.color, palette.divider), zIndex)
    case 'html':
      return positionedTextBoxXml({
        id: element.id,
        x: element.x,
        y: item.y,
        width: element.width,
        height: element.height,
        fillColor: toDocxColor(element.styles.background, snapshot.surfaceTheme === 'dark' ? '112633' : 'EDF8F6'),
        zIndex,
        insetPx: 16,
        content: textParagraphXml(stripHtmlToText(hooks.resolveVariables(element.content)), {
          fontFamily: hooks.getElementFontFamily(element),
          fontSize: hooks.getElementFontSize(element),
          fontWeight: element.styles.fontWeight ?? 400,
          fontStyle: element.styles.fontStyle ?? 'normal',
          lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.45)),
          color: toDocxColor(element.styles.color, palette.body),
          textDecoration: element.styles.textDecoration ?? 'none',
          align: 'left',
          escapeXml: hooks.escapeXml,
        }),
        escapeXml: hooks.escapeXml,
      })
    case 'video': {
      const href = hooks.getVideoHref(element)
      return positionedTextBoxXml({
        id: element.id,
        x: element.x,
        y: item.y,
        width: element.width,
        height: element.height,
        fillColor: snapshot.surfaceTheme === 'dark' ? '111A23' : '091019',
        zIndex,
        content: textParagraphXml(href === null ? 'Video block' : `Video: ${href}`, {
          fontFamily: hooks.getElementFontFamily(element),
          fontSize: hooks.getElementFontSize(element),
          fontWeight: 600,
          fontStyle: 'normal',
          lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.3)),
          color: snapshot.surfaceTheme === 'dark' ? 'EEF5FB' : 'F2F6F9',
          align: 'center',
          escapeXml: hooks.escapeXml,
        }),
        escapeXml: hooks.escapeXml,
      })
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      const content = tableData === null
        ? textParagraphXml('Invalid table', {
          fontFamily: 'Arial',
          fontSize: 12,
          fontWeight: 700,
          fontStyle: 'normal',
          lineHeight: 16,
          color: '9F2D26',
          align: 'center',
          escapeXml: hooks.escapeXml,
        })
        : tableDocxXml(tableData, element, snapshot, hooks)
      return positionedTextBoxXml({
        id: element.id,
        x: element.x,
        y: item.y,
        width: element.width,
        height: element.height,
        fillColor: 'none',
        zIndex,
        content,
        escapeXml: hooks.escapeXml,
      })
    }
    case 'spacer':
    default:
      return ''
  }
}

function positionedShapeStyle(x: number, y: number, width: number, height: number, zIndex: number): string {
  return `position:absolute;margin-left:${pxToPoints(x)}pt;margin-top:${pxToPoints(y)}pt;width:${pxToPoints(width)}pt;height:${pxToPoints(height)}pt;z-index:${zIndex};mso-position-horizontal-relative:page;mso-position-vertical-relative:page`
}

function positionedFillShapeXml(id: string, x: number, y: number, width: number, height: number, fillColor: string, zIndex: number, escapeXml: (text: string) => string): string {
  return `<w:pict><v:rect id="${escapeXml(id)}" style="${positionedShapeStyle(x, y, width, height, zIndex)}" filled="t" fillcolor="#${fillColor}" stroked="f"/></w:pict>`
}

function positionedTextBoxXml(options: {
  id: string
  x: number
  y: number
  width: number
  height: number
  fillColor: string
  zIndex: number
  content: string
  insetPx?: number | undefined
  escapeXml: (text: string) => string
}): string {
  const inset = pxToPoints(options.insetPx ?? 0)
  const filled = options.fillColor === 'none' ? 'f' : 't'
  const fillColor = options.fillColor === 'none' ? '' : ` fillcolor="#${options.fillColor}"`
  return `<w:pict><v:rect id="${options.escapeXml(options.id)}" style="${positionedShapeStyle(options.x, options.y, options.width, options.height, options.zIndex)}" filled="${filled}"${fillColor} stroked="f"><v:textbox inset="${inset}pt,${inset}pt,${inset}pt,${inset}pt"><w:txbxContent>${options.content}</w:txbxContent></v:textbox></v:rect></w:pict>`
}

function positionedImageXml(id: string, x: number, y: number, width: number, height: number, image: DocxMedia, escapeXml: (text: string) => string, zIndex: number): string {
  return `<w:pict><v:rect id="${escapeXml(id)}" style="${positionedShapeStyle(x, y, width, height, zIndex)}" filled="f" stroked="f"><v:imagedata r:id="${image.relationshipId}" o:title="${escapeXml(image.entryName)}"/></v:rect></w:pict>`
}

function positionedDividerXml(x: number, y: number, width: number, color: string, zIndex: number): string {
  return `<w:pict><v:line from="${pxToPoints(x)}pt,${pxToPoints(y)}pt" to="${pxToPoints(x + width)}pt,${pxToPoints(y)}pt" style="position:absolute;z-index:${zIndex};mso-position-horizontal-relative:page;mso-position-vertical-relative:page" strokecolor="#${color}" strokeweight="1pt"/></w:pict>`
}

function renderTextLineParagraphXml(item: ExportSnapshotTextItem, escapeXml: (text: string) => string): string {
  return textParagraphXml(item.text, {
    fontFamily: item.fontFamily,
    fontSize: item.fontSize,
    fontWeight: item.fontWeight,
    fontStyle: item.fontStyle,
    lineHeight: item.lineHeight,
    color: toDocxColor(item.color, item.color),
    textDecoration: item.textDecoration,
    align: 'left',
    escapeXml,
  })
}

function tableDocxXml(tableData: TableData, element: CanvasElement, snapshot: ExportSnapshot, hooks: DocxExportHooks): string {
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const pageFill = toDocxColor(palette.pageBackground, 'FFFFFF')
  const colPixelWidths = roundedColumnWidths(tableData.colWidths, element.width)
  const visitedCells = new Set<string>()
  const parts: string[] = []

  parts.push('<w:tbl>')
  parts.push(`<w:tblPr><w:tblW w:w="${pxToTwips(element.width)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>`)
  parts.push('<w:tblGrid>')
  for (const width of colPixelWidths) parts.push(`<w:gridCol w:w="${pxToTwips(width)}"/>`)
  parts.push('</w:tblGrid>')

  for (let row = 0; row < tableData.rows; row += 1) {
    const rowHeight = Math.max(1, tableData.rowHeights[row] ?? 1)
    parts.push(`<w:tr><w:trPr><w:trHeight w:val="${pxToTwips(rowHeight)}" w:hRule="exact"/></w:trPr>`)
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

      const cellWidth = sumColumnWidths(colPixelWidths, col, cell.colspan)
      const content = hooks.resolveVariables(cell.content)
      const bg = getTableCellFill(cell, row, element, pageFill)
      const color = readableDocxTextColor(toDocxColor(cell.styles.color, palette.body), bg, snapshot.surfaceTheme)
      const cellContent = textParagraphXml(content, {
        fontFamily: cell.styles.fontFamily ?? "'Avenir Next','Segoe UI',sans-serif",
        fontSize: cell.styles.fontSize ?? 13,
        fontWeight: cell.styles.fontWeight ?? 400,
        fontStyle: cell.styles.fontStyle ?? 'normal',
        lineHeight: Math.max(12, Math.round((cell.styles.fontSize ?? 13) * 1.2)),
        color,
        align: cell.styles.hAlign ?? 'left',
        escapeXml: hooks.escapeXml,
      })
      parts.push(docxTableCellXml(cell, tableData, cellWidth, bg, cellContent))
    }
    parts.push('</w:tr>')
  }

  parts.push('</w:tbl>')
  return parts.join('')
}

function docxTableCellXml(cell: TableCell, tableData: TableData, widthPx: number, fill: string, content: string): string {
  const colSpanXml = cell.colspan > 1 ? `<w:gridSpan w:val="${cell.colspan}"/>` : ''
  const vMergeXml = cell.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : ''
  const vAlign = cell.styles.vAlign === 'middle' ? 'center' : cell.styles.vAlign === 'bottom' ? 'bottom' : 'top'
  return `<w:tc><w:tcPr><w:tcW w:w="${pxToTwips(widthPx)}" w:type="dxa"/>${colSpanXml}${vMergeXml}<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="${vAlign}"/>${tableCellBordersXml(cell, tableData)}<w:tcMar>${tableCellMarginXml(cell.styles.padding ?? 8)}</w:tcMar></w:tcPr>${content}</w:tc>`
}

function tableCellBordersXml(cell: TableCell, tableData: TableData): string {
  const borderXml = (edge: 'top' | 'right' | 'bottom' | 'left', tag: string) => {
    const border = edge === 'top'
      ? (cell.styles.borderTop ?? tableData.defaultBorder)
      : edge === 'right'
        ? (cell.styles.borderRight ?? tableData.defaultBorder)
        : edge === 'bottom'
          ? (cell.styles.borderBottom ?? tableData.defaultBorder)
          : (cell.styles.borderLeft ?? tableData.defaultBorder)
    if (border.style === 'none' || border.width <= 0) return `<${tag} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`
    const color = toDocxColor(border.color, 'C9D3DC')
    const style = border.style === 'dashed' ? 'dashed' : border.style === 'dotted' ? 'dotted' : 'single'
    return `<${tag} w:val="${style}" w:sz="${Math.max(2, Math.round(border.width * 8))}" w:space="0" w:color="${color}"/>`
  }
  return `<w:tcBorders>${borderXml('top', 'w:top')}${borderXml('right', 'w:right')}${borderXml('bottom', 'w:bottom')}${borderXml('left', 'w:left')}</w:tcBorders>`
}

function tableCellMarginXml(padding: number): string {
  const value = pxToTwips(Math.min(padding, 4))
  return `<w:top w:w="${value}" w:type="dxa"/><w:left w:w="${value}" w:type="dxa"/><w:bottom w:w="${value}" w:type="dxa"/><w:right w:w="${value}" w:type="dxa"/>`
}

function getTableCellFill(cell: TableCell, row: number, element: CanvasElement, pageFill: string): string {
  if (cell.styles.background !== undefined) return toDocxColor(cell.styles.background, pageFill)
  if ((element.styles.tableStriped ?? false) && row % 2 === 1) return toDocxColor(element.styles.tableStripeColor, 'F5F7F9')
  return pageFill
}

function textParagraphXml(text: string, options: {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  color: string
  textDecoration?: 'none' | 'underline'
  align?: 'left' | 'center' | 'right'
  escapeXml: (text: string) => string
}): string {
  const halfPoints = pxToHalfPoints(options.fontSize)
  const bold = options.fontWeight >= 700 ? '<w:b/>' : ''
  const italic = options.fontStyle === 'italic' ? '<w:i/>' : ''
  const underline = options.textDecoration === 'underline' ? '<w:u w:val="single"/>' : ''
  const fontFamily = options.escapeXml(normalizeDocxFontFamily(options.fontFamily))
  const align = options.align === 'center' ? 'center' : options.align === 'right' ? 'right' : 'left'
  const runs = textRunsXml(text, options.escapeXml)
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${pxToTwips(options.lineHeight)}" w:lineRule="exact"/><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>${bold}${italic}${underline}<w:color w:val="${options.color}"/></w:rPr>${runs}</w:r></w:p>`
}

function textRunsXml(text: string, escapeXml: (text: string) => string): string {
  const lines = text.split('\n')
  return lines.map((line, index) => `${index === 0 ? '' : '<w:br/>'}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('')
}

function roundedColumnWidths(colWidths: number[], totalWidth: number): number[] {
  const widths: number[] = []
  let consumed = 0
  let cumulative = 0
  for (let index = 0; index < colWidths.length; index += 1) {
    cumulative += colWidths[index] ?? 0
    const edge = index === colWidths.length - 1 ? Math.round(totalWidth) : Math.round(cumulative * totalWidth)
    widths.push(Math.max(1, edge - consumed))
    consumed = edge
  }
  return widths
}

function sumColumnWidths(widths: number[], start: number, span: number): number {
  let total = 0
  for (let index = start; index < start + span; index += 1) total += widths[index] ?? 0
  return Math.max(1, total)
}

function readableDocxTextColor(preferred: string, background: string, surfaceTheme: ExportSnapshot['surfaceTheme']): string {
  if (contrastRatio(preferred, background) >= 3) return preferred
  return surfaceTheme === 'dark' ? 'CAD9E5' : '354A5A'
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  const light = Math.max(fg, bg)
  const dark = Math.min(fg, bg)
  return (light + 0.05) / (dark + 0.05)
}

function relativeLuminance(color: string): number {
  const normalized = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 1
  const channel = (offset: number) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function normalizeDocxFontFamily(fontFamily: string): string {
  return fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'Arial'
}

function pxToTwips(px: number): number {
  return Math.max(1, Math.round(px * 15))
}

function pxToPoints(px: number): number {
  return Math.round(px * 75) / 100
}

function pxToHalfPoints(px: number): number {
  return Math.max(1, Math.round(px * 1.33))
}

function buildDocxContentTypesXml(media: DocxMedia[]): string {
  const mediaDefaults = media.length === 0 ? '' : '\n  <Default Extension="png" ContentType="image/png" />'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  ${mediaDefaults}
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml" />
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
</Types>`
}

function buildDocxRootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" />
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml" />
</Relationships>`
}

function buildDocxDocumentRelationshipsXml(media: DocxMedia[]): string {
  const relationships = media.map(item => `\n  <Relationship Id="${item.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.entryName}" />`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}
</Relationships>`
}

function buildDocxCoreXml(templateName: string, timestamp: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${templateName}</dc:title>
  <dc:creator>Pretext Template Studio</dc:creator>
  <cp:lastModifiedBy>Pretext Template Studio</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`
}

function buildDocxAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Pretext Template Studio</Application>
</Properties>`
}

function zipEntry(name: string, text: string): ZipEntry {
  return { name, data: new TextEncoder().encode(text) }
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const crcTable = getCrcTable()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const crc = crc32(entry.data, crcTable)
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, entry.data.length, true)
    localView.setUint32(22, entry.data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(entry.data, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, entry.data.length, true)
    centralView.setUint32(24, entry.data.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)
    offset += local.length
  }

  const centralOffset = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, centralOffset, true)
  endView.setUint16(20, 0, true)
  return concatUint8Arrays([...localParts, ...centralParts, end])
}

let sharedCrcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (sharedCrcTable !== null) return sharedCrcTable
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[index] = crc >>> 0
  }
  sharedCrcTable = table
  return table
}

function crc32(bytes: Uint8Array, table: Uint32Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
