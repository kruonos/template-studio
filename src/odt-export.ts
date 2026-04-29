import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotItem,
  ExportSnapshotTextItem,
  TableCell,
  TableData,
} from './schema.ts'
import { canvasToBlob, loadImageElement, stripHtmlToText } from './content.ts'
import { getRenderableExportPages } from './export-pages.ts'
import { getSurfacePalette } from './theme.ts'
import { cellKey, getCell, parseTableData } from './table-engine.ts'
import { escapeXml, toDocxColor } from './utils.ts'

type OdtExportHooks = {
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getButtonHref: (element: CanvasElement) => string | null
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getVideoHref: (element: CanvasElement) => string | null
}

type OdtMedia = {
  blockId: string
  entryName: string
  bytes: Uint8Array
}

type ZipEntry = {
  name: string
  data: Uint8Array
}

type OdtBuildContext = {
  snapshot: ExportSnapshot
  hooks: OdtExportHooks
  mediaByBlockId: Map<string, OdtMedia>
  automaticStyles: string[]
  styleCounter: number
}

export async function buildOdtBlob(snapshot: ExportSnapshot, hooks: OdtExportHooks, mimeType: string): Promise<Blob> {
  const media = await collectOdtMedia(snapshot, hooks)
  const contentXml = buildOdtContentXml(snapshot, hooks, media)
  const stylesXml = buildOdtStylesXml(snapshot)
  const entries: ZipEntry[] = [
    zipEntry('mimetype', mimeType),
    zipEntry('content.xml', contentXml),
    zipEntry('styles.xml', stylesXml),
    zipEntry('meta.xml', buildOdtMetaXml(snapshot.templateName)),
    zipEntry('META-INF/manifest.xml', buildOdtManifestXml(media, mimeType)),
  ]
  for (const item of media) entries.push({ name: `Pictures/${item.entryName}`, data: item.bytes })
  const zipBytes = buildZip(entries)
  const arrayBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(arrayBuffer).set(zipBytes)
  return new Blob([arrayBuffer], { type: mimeType })
}

async function collectOdtMedia(snapshot: ExportSnapshot, hooks: OdtExportHooks): Promise<OdtMedia[]> {
  const media: OdtMedia[] = []
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
      const image = await resolveOdtImage(src)
      if (image === null) continue
      media.push({
        blockId: element.id,
        entryName: `image-${media.length + 1}.png`,
        bytes: image.bytes,
      })
    }
  }
  return media
}

async function resolveOdtImage(src: string): Promise<{ bytes: Uint8Array } | null> {
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
      if (context === null) throw new Error('Canvas 2D context unavailable for ODT image rendering')
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

function buildOdtContentXml(snapshot: ExportSnapshot, hooks: OdtExportHooks, media: OdtMedia[]): string {
  const context: OdtBuildContext = {
    snapshot,
    hooks,
    mediaByBlockId: new Map(media.map(item => [item.blockId, item])),
    automaticStyles: [
      '<style:style style:name="PageAnchor" style:family="paragraph"><style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0in"/></style:style>',
      '<style:style style:name="PageBreak" style:family="paragraph"><style:paragraph-properties fo:break-before="page" fo:margin-top="0in" fo:margin-bottom="0in"/></style:style>',
    ],
    styleCounter: 0,
  }
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const pageFill = odtColor(palette.pageBackground, '#FFFFFF')
  const body: string[] = []

  for (const page of getRenderableExportPages(snapshot)) {
    if (page.pageIndex > 0) body.push('<text:p text:style-name="PageBreak"/>')
    body.push('<text:p text:style-name="PageAnchor">')
    body.push(renderOdtPageBackground(context, page.pageIndex, pageFill))
    for (const item of page.items) body.push(renderOdtItem(context, item, page.pageIndex))
    body.push('</text:p>')
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${odtNamespaces()} office:version="1.3">
  <office:automatic-styles>
    ${context.automaticStyles.join('\n    ')}
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${body.join('\n      ')}
    </office:text>
  </office:body>
</office:document-content>`
}

function renderOdtPageBackground(context: OdtBuildContext, pageIndex: number, fill: string): string {
  const styleName = addGraphicStyle(context, { fill, stroke: 'none' })
  return `<draw:rect draw:name="page-${pageIndex + 1}-background" draw:style-name="${styleName}" text:anchor-type="page" text:anchor-page-number="${pageIndex + 1}" svg:x="0in" svg:y="0in" svg:width="${pxToIn(context.snapshot.canvasWidth)}" svg:height="${pxToIn(context.snapshot.pageHeight)}" draw:z-index="0"/>`
}

function renderOdtItem(context: OdtBuildContext, item: ExportSnapshotItem, pageIndex: number): string {
  if (item.kind === 'text-line') return renderOdtTextLine(context, item, pageIndex)

  const { element } = item
  const common = { x: element.x, y: item.y, width: element.width, height: element.height, pageIndex }
  const palette = getSurfacePalette(context.snapshot.surfaceTheme)

  switch (element.type) {
    case 'image':
    case 'animated-gif':
    case 'mascot': {
      const media = context.mediaByBlockId.get(element.id)
      if (media === undefined) return renderOdtTextFrame(context, common, `[${element.type}]`, fallbackTextStyle(context, palette.body), 'none')
      return renderOdtImageFrame(context, common, media)
    }
    case 'button':
      return renderOdtTextFrame(context, common, context.hooks.resolveVariables(element.content), {
        fontFamily: context.hooks.getElementFontFamily(element),
        fontSize: Math.max(10, Math.round(context.hooks.getElementFontSize(element) * 0.9)),
        fontWeight: element.styles.fontWeight ?? 700,
        fontStyle: element.styles.fontStyle ?? 'normal',
        lineHeight: Math.max(14, Math.round(context.hooks.getElementFontSize(element) * 1.2)),
        color: odtColor(element.styles.color, palette.buttonText),
        align: 'center',
      }, odtColor(element.styles.background, palette.buttonBackground), 12)
    case 'divider':
      return renderOdtDivider(context, common, odtColor(element.styles.color, palette.divider))
    case 'html':
      return renderOdtTextFrame(context, common, stripHtmlToText(context.hooks.resolveVariables(element.content)), {
        fontFamily: context.hooks.getElementFontFamily(element),
        fontSize: context.hooks.getElementFontSize(element),
        fontWeight: element.styles.fontWeight ?? 400,
        fontStyle: element.styles.fontStyle ?? 'normal',
        lineHeight: Math.max(14, Math.round(context.hooks.getElementFontSize(element) * 1.45)),
        color: odtColor(element.styles.color, palette.body),
        align: 'left',
      }, odtColor(element.styles.background, context.snapshot.surfaceTheme === 'dark' ? '#112633' : '#EDF8F6'), 12)
    case 'video': {
      const href = context.hooks.getVideoHref(element)
      return renderOdtTextFrame(context, common, href === null ? 'Video block' : `Video: ${href}`, {
        ...fallbackTextStyle(context, context.snapshot.surfaceTheme === 'dark' ? '#EEF5FB' : '#F2F6F9'),
        align: 'center',
      }, context.snapshot.surfaceTheme === 'dark' ? '#111A23' : '#091019')
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      return tableData === null
        ? renderOdtTextFrame(context, common, 'Invalid table', fallbackTextStyle(context, '#9F2D26'), 'none')
        : renderOdtTableFrame(context, common, element, tableData)
    }
    case 'spacer':
    default:
      return ''
  }
}

function renderOdtTextLine(context: OdtBuildContext, item: ExportSnapshotTextItem, pageIndex: number): string {
  return renderOdtTextFrame(context, {
    x: item.x,
    y: item.y,
    width: Math.max(item.slotWidth, item.width, 1),
    height: Math.max(item.height, item.lineHeight, 1),
    pageIndex,
  }, item.text, {
    fontFamily: item.fontFamily,
    fontSize: item.fontSize,
    fontWeight: item.fontWeight,
    fontStyle: item.fontStyle,
    lineHeight: item.lineHeight,
    color: odtColor(item.color, item.color),
    textDecoration: item.textDecoration,
    align: 'left',
  }, 'none')
}

function renderOdtTextFrame(
  context: OdtBuildContext,
  rect: { x: number; y: number; width: number; height: number; pageIndex: number },
  text: string,
  textStyle: OdtTextStyle,
  fill: string,
  insetPx = 0,
): string {
  const frameStyle = addGraphicStyle(context, { fill, stroke: 'none', padding: insetPx })
  const paragraphStyle = addParagraphStyle(context, textStyle)
  return `<draw:frame draw:name="text-${context.styleCounter}" draw:style-name="${frameStyle}" text:anchor-type="page" text:anchor-page-number="${rect.pageIndex + 1}" svg:x="${pxToIn(rect.x)}" svg:y="${pxToIn(rect.y)}" svg:width="${pxToIn(rect.width)}" svg:height="${pxToIn(rect.height)}" draw:z-index="5"><draw:text-box fo:min-height="${pxToIn(rect.height)}">${textToParagraphs(text, paragraphStyle)}</draw:text-box></draw:frame>`
}

function renderOdtImageFrame(context: OdtBuildContext, rect: { x: number; y: number; width: number; height: number; pageIndex: number }, media: OdtMedia): string {
  const frameStyle = addGraphicStyle(context, { fill: 'none', stroke: 'none' })
  return `<draw:frame draw:name="${escapeXml(media.blockId)}" draw:style-name="${frameStyle}" text:anchor-type="page" text:anchor-page-number="${rect.pageIndex + 1}" svg:x="${pxToIn(rect.x)}" svg:y="${pxToIn(rect.y)}" svg:width="${pxToIn(rect.width)}" svg:height="${pxToIn(rect.height)}" draw:z-index="4"><draw:image xlink:href="Pictures/${escapeXml(media.entryName)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
}

function renderOdtDivider(context: OdtBuildContext, rect: { x: number; y: number; width: number; height: number; pageIndex: number }, color: string): string {
  const styleName = addGraphicStyle(context, { fill: 'none', stroke: color })
  const y = rect.y + rect.height / 2
  return `<draw:line draw:name="divider-${context.styleCounter}" draw:style-name="${styleName}" text:anchor-type="page" text:anchor-page-number="${rect.pageIndex + 1}" svg:x1="${pxToIn(rect.x)}" svg:y1="${pxToIn(y)}" svg:x2="${pxToIn(rect.x + rect.width)}" svg:y2="${pxToIn(y)}" draw:z-index="3"/>`
}

function renderOdtTableFrame(context: OdtBuildContext, rect: { x: number; y: number; width: number; height: number; pageIndex: number }, element: CanvasElement, tableData: TableData): string {
  const frameStyle = addGraphicStyle(context, { fill: 'none', stroke: 'none' })
  const tableXml = renderOdtTable(context, element, tableData)
  return `<draw:frame draw:name="${escapeXml(element.id)}" draw:style-name="${frameStyle}" text:anchor-type="page" text:anchor-page-number="${rect.pageIndex + 1}" svg:x="${pxToIn(rect.x)}" svg:y="${pxToIn(rect.y)}" svg:width="${pxToIn(rect.width)}" svg:height="${pxToIn(rect.height)}" draw:z-index="6"><draw:text-box fo:min-height="${pxToIn(rect.height)}">${tableXml}</draw:text-box></draw:frame>`
}

function renderOdtTable(context: OdtBuildContext, element: CanvasElement, tableData: TableData): string {
  const colWidths = roundedColumnWidths(tableData.colWidths, element.width)
  const tableName = `Table${context.styleCounter++}`
  const visited = new Set<string>()
  const columns = colWidths.map((width, index) => {
    const styleName = `${tableName}Col${index}`
    context.automaticStyles.push(`<style:style style:name="${styleName}" style:family="table-column"><style:table-column-properties style:column-width="${pxToIn(width)}"/></style:style>`)
    return `<table:table-column table:style-name="${styleName}"/>`
  }).join('')
  const rows: string[] = []

  for (let row = 0; row < tableData.rows; row += 1) {
    const rowStyle = `${tableName}Row${row}`
    context.automaticStyles.push(`<style:style style:name="${rowStyle}" style:family="table-row"><style:table-row-properties style:row-height="${pxToIn(Math.max(1, tableData.rowHeights[row] ?? 1))}" style:use-optimal-row-height="false"/></style:style>`)
    const cells: string[] = []
    for (let col = 0; col < tableData.cols; col += 1) {
      const key = cellKey(row, col)
      if (visited.has(key)) continue
      const cell = getCell(tableData, row, col)
      if (cell === null) continue
      if (cell.row !== row || cell.col !== col) {
        visited.add(key)
        cells.push('<table:covered-table-cell/>')
        continue
      }
      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) visited.add(cellKey(row + dr, col + dc))
      }
      cells.push(renderOdtTableCell(context, tableName, cell, tableData, row, element))
    }
    rows.push(`<table:table-row table:style-name="${rowStyle}">${cells.join('')}</table:table-row>`)
  }

  return `<table:table table:name="${tableName}">${columns}${rows.join('')}</table:table>`
}

function renderOdtTableCell(context: OdtBuildContext, tableName: string, cell: TableCell, tableData: TableData, row: number, element: CanvasElement): string {
  const styleName = `${tableName}Cell${context.styleCounter++}`
  const fill = odtColor(cell.styles.background, (element.styles.tableStriped ?? false) && row % 2 === 1 ? element.styles.tableStripeColor ?? '#F5F7F9' : '#FFFFFF')
  const border = odtBorder(cell.styles.borderTop ?? tableData.defaultBorder)
  const padding = pxToIn(Math.min(cell.styles.padding ?? 8, 6))
  const color = odtColor(cell.styles.color, context.snapshot.surfaceTheme === 'dark' ? '#CAD9E5' : '#354A5A')
  const paragraphStyle = addParagraphStyle(context, {
    fontFamily: cell.styles.fontFamily ?? '"Avenir Next","Segoe UI",sans-serif',
    fontSize: cell.styles.fontSize ?? 13,
    fontWeight: cell.styles.fontWeight ?? 400,
    fontStyle: cell.styles.fontStyle ?? 'normal',
    lineHeight: Math.max(12, Math.round((cell.styles.fontSize ?? 13) * 1.2)),
    color,
    align: cell.styles.hAlign ?? 'left',
  })
  context.automaticStyles.push(`<style:style style:name="${styleName}" style:family="table-cell"><style:table-cell-properties fo:background-color="${fill}" fo:border="${border}" fo:padding="${padding}"/></style:style>`)
  const spanAttrs = `${cell.colspan > 1 ? ` table:number-columns-spanned="${cell.colspan}"` : ''}${cell.rowspan > 1 ? ` table:number-rows-spanned="${cell.rowspan}"` : ''}`
  const content = context.hooks.resolveVariables(cell.content)
  return `<table:table-cell table:style-name="${styleName}" office:value-type="string"${spanAttrs}>${textToParagraphs(content, paragraphStyle)}</table:table-cell>`
}

type OdtTextStyle = {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  color: string
  textDecoration?: 'none' | 'underline'
  align: 'left' | 'center' | 'right'
}

function fallbackTextStyle(context: OdtBuildContext, color: string): OdtTextStyle {
  return {
    fontFamily: 'Arial, sans-serif',
    fontSize: 12,
    fontWeight: 600,
    fontStyle: 'normal',
    lineHeight: 16,
    color: odtColor(color, getSurfacePalette(context.snapshot.surfaceTheme).body),
    align: 'left',
  }
}

function addGraphicStyle(context: OdtBuildContext, options: { fill: string; stroke: string; padding?: number | undefined }): string {
  const name = `G${context.styleCounter++}`
  const fill = options.fill === 'none' ? 'draw:fill="none"' : `draw:fill="solid" draw:fill-color="${options.fill}"`
  const stroke = options.stroke === 'none' ? 'draw:stroke="none"' : `draw:stroke="solid" svg:stroke-color="${options.stroke}" svg:stroke-width="0.75pt"`
  const padding = options.padding === undefined ? '' : ` fo:padding="${pxToIn(options.padding)}"`
  context.automaticStyles.push(`<style:style style:name="${name}" style:family="graphic"><style:graphic-properties ${fill} ${stroke}${padding} style:wrap="run-through" style:run-through="foreground" draw:auto-grow-height="false" draw:auto-grow-width="false"/></style:style>`)
  return name
}

function addParagraphStyle(context: OdtBuildContext, style: OdtTextStyle): string {
  const name = `P${context.styleCounter++}`
  const underline = style.textDecoration === 'underline'
    ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"'
    : ''
  const fontFamily = normalizeFontFamily(style.fontFamily)
  context.automaticStyles.push(`<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0in" fo:line-height="${pxToPt(style.lineHeight)}" fo:text-align="${style.align}"/><style:text-properties fo:font-family="${escapeXml(fontFamily)}" style:font-name="${escapeXml(fontFamily)}" fo:font-size="${pxToPt(style.fontSize)}" fo:font-weight="${style.fontWeight >= 700 ? 'bold' : 'normal'}" fo:font-style="${style.fontStyle}" fo:color="${style.color}"${underline}/></style:style>`)
  return name
}

function textToParagraphs(text: string, paragraphStyle: string): string {
  const paragraphs = text.split(/\n+/)
  return paragraphs.map(line => `<text:p text:style-name="${paragraphStyle}">${escapeXml(line)}</text:p>`).join('')
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

function odtBorder(border: TableData['defaultBorder']): string {
  if (border.style === 'none' || border.width <= 0) return 'none'
  return `${Math.max(0.25, border.width * 0.75)}pt ${border.style} ${odtColor(border.color, '#C9D3DC')}`
}

function odtColor(value: string | undefined, fallback: string): string {
  return `#${toDocxColor(value, fallback)}`
}

function normalizeFontFamily(fontFamily: string): string {
  return fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'Arial'
}

function pxToIn(px: number): string {
  return `${round(px / 96)}in`
}

function pxToPt(px: number): string {
  return `${round(px * 0.75)}pt`
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function buildOdtStylesXml(snapshot: ExportSnapshot): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${odtNamespaces()} office:version="1.3">
  <office:styles>
    <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="pm1">
      <style:page-layout-properties fo:page-width="${pxToIn(snapshot.canvasWidth)}" fo:page-height="${pxToIn(snapshot.pageHeight)}" fo:margin="0in"/>
    </style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="pm1"/>
  </office:master-styles>
</office:document-styles>`
}

function buildOdtMetaXml(title: string): string {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${odtNamespaces()} office:version="1.3">
  <office:meta>
    <meta:generator>Pretext Template Studio</meta:generator>
    <dc:title>${escapeXml(title)}</dc:title>
    <meta:creation-date>${now}</meta:creation-date>
    <dc:date>${now}</dc:date>
  </office:meta>
</office:document-meta>`
}

function buildOdtManifestXml(media: OdtMedia[], mimeType: string): string {
  const mediaEntries = media.map(item => `<manifest:file-entry manifest:full-path="Pictures/${escapeXml(item.entryName)}" manifest:media-type="image/png"/>`).join('\n  ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="${mimeType}"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
  ${mediaEntries}
</manifest:manifest>`
}

function odtNamespaces(): string {
  return [
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
    'xmlns:xlink="http://www.w3.org/1999/xlink"',
    'xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"',
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
    'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  ].join(' ')
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
