import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotBlockItem,
} from './schema.ts'
import { parseTableData } from './table-engine.ts'
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
    const items = page.items.slice()
    bodyParts.push(positioningAnchorParagraphXml(items.map((item, itemIndex) => {
      if (item.kind === 'text-line') {
        return positionedTextBoxXml({
          id: `text-${page.pageIndex}-${itemIndex}`,
          x: item.x,
          y: item.y,
          width: Math.max(item.slotWidth, item.width, 1),
          height: item.height,
          text: item.text,
          fontFamily: item.fontFamily,
          fontSize: item.fontSize,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
          lineHeight: item.lineHeight,
          color: toDocxColor(item.color, item.color),
          textDecoration: item.textDecoration,
          zIndex: itemIndex + 1,
          escapeXml: hooks.escapeXml,
        })
      }

      const element = item.element
      switch (element.type) {
        case 'image':
        case 'animated-gif':
        case 'mascot': {
          const image = mediaByBlockId.get(element.id)
          if (image !== undefined) {
            return positionedImageXml(item, image, hooks.escapeXml, itemIndex + 1)
          }
          return positionedTextBoxXml({
            id: `missing-${page.pageIndex}-${itemIndex}`,
            x: element.x,
            y: item.y,
            width: element.width,
            height: element.height,
            text: `[${element.type}]`,
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 600,
            fontStyle: 'normal',
            lineHeight: 16,
            color: '5B6F7F',
            textDecoration: 'none',
            zIndex: itemIndex + 1,
            escapeXml: hooks.escapeXml,
          })
        }
        case 'button': {
          const href = hooks.getButtonHref(element)
          return positionedTextBoxXml({
            id: `button-${page.pageIndex}-${itemIndex}`,
            x: element.x,
            y: item.y,
            width: element.width,
            height: element.height,
            text: `${hooks.resolveVariables(element.content)}${href === null ? '' : `\n${href}`}`,
            fontFamily: hooks.getElementFontFamily(element),
            fontSize: Math.round(hooks.getElementFontSize(element) * 0.9),
            fontWeight: 700,
            fontStyle: 'normal',
            lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.2)),
            color: toDocxColor(element.styles.color, palette.buttonText),
            textDecoration: element.styles.textDecoration ?? 'none',
            fillColor: toDocxColor(element.styles.background, palette.buttonBackground),
            zIndex: itemIndex + 1,
            escapeXml: hooks.escapeXml,
          })
        }
        case 'divider':
          return positionedDividerXml(element.x, item.y + element.height / 2, element.width, toDocxColor(element.styles.color, palette.divider), itemIndex + 1)
        case 'spacer':
          return ''
        case 'html':
          return positionedTextBoxXml({
            id: `html-${page.pageIndex}-${itemIndex}`,
            x: element.x,
            y: item.y,
            width: element.width,
            height: element.height,
            text: stripHtmlToText(hooks.resolveVariables(element.content)),
            fontFamily: hooks.getElementFontFamily(element),
            fontSize: hooks.getElementFontSize(element),
            fontWeight: element.styles.fontWeight ?? 400,
            fontStyle: element.styles.fontStyle ?? 'normal',
            lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.45)),
            color: toDocxColor(element.styles.color, palette.body),
            textDecoration: element.styles.textDecoration ?? 'none',
            fillColor: toDocxColor(element.styles.background, 'EDF8F6'),
            zIndex: itemIndex + 1,
            escapeXml: hooks.escapeXml,
          })
        case 'video': {
          const href = hooks.getVideoHref(element)
          return positionedTextBoxXml({
            id: `video-${page.pageIndex}-${itemIndex}`,
            x: element.x,
            y: item.y,
            width: element.width,
            height: element.height,
            text: href === null ? 'Video block' : `Video: ${href}`,
            fontFamily: hooks.getElementFontFamily(element),
            fontSize: hooks.getElementFontSize(element),
            fontWeight: 600,
            fontStyle: 'normal',
            lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.3)),
            color: toDocxColor(element.styles.color, palette.body),
            textDecoration: 'none',
            fillColor: snapshot.surfaceTheme === 'dark' ? '111A23' : '091019',
            zIndex: itemIndex + 1,
            escapeXml: hooks.escapeXml,
          })
        }
        case 'table': {
          const tableData = parseTableData(element.content)
          if (tableData !== null) {
            return positionedTextBoxXml({
              id: `table-${page.pageIndex}-${itemIndex}`,
              x: element.x,
              y: item.y,
              width: element.width,
              height: element.height,
              text: tableData.cells.map(cell => hooks.resolveVariables(cell.content)).filter(Boolean).join('\n'),
              fontFamily: hooks.getElementFontFamily(element),
              fontSize: hooks.getElementFontSize(element),
              fontWeight: 400,
              fontStyle: 'normal',
              lineHeight: Math.max(14, Math.round(hooks.getElementFontSize(element) * 1.3)),
              color: toDocxColor(element.styles.color, palette.body),
              textDecoration: 'none',
              fillColor: 'FFFFFF',
              zIndex: itemIndex + 1,
              escapeXml: hooks.escapeXml,
            })
          }
          return positionedTextBoxXml({
            id: `table-${page.pageIndex}-${itemIndex}`,
            x: element.x,
            y: item.y,
            width: element.width,
            height: element.height,
            text: '[Table]',
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 600,
            fontStyle: 'normal',
            lineHeight: 16,
            color: '5B6F7F',
            textDecoration: 'none',
            zIndex: itemIndex + 1,
            escapeXml: hooks.escapeXml,
          })
        }
        default:
          return ''
      }
    }).join('')))

    if (pageIndex < pages.length - 1) bodyParts.push(pageBreakParagraphXml())
  })

  const pgWidthTwips = Math.round(snapshot.canvasWidth * 15)
  const pgHeightTwips = Math.round(snapshot.pageHeight * 15)
  const marginTwips = Math.round(snapshot.pageMargin * 15)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join('')}
    <w:sectPr>
      <w:pgSz w:w="${pgWidthTwips}" w:h="${pgHeightTwips}" />
      <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="720" w:footer="720" w:gutter="0" />
    </w:sectPr>
  </w:body>
</w:document>`
}

function positioningAnchorParagraphXml(content: string): string {
  return `
    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="0" /></w:pPr>
      <w:r>${content}</w:r>
    </w:p>
  `
}

function pageBreakParagraphXml(): string {
  return `
    <w:p>
      <w:r>
        <w:br w:type="page" />
      </w:r>
    </w:p>
  `
}

function positionedShapeStyle(x: number, y: number, width: number, height: number, zIndex: number): string {
  return `position:absolute;margin-left:${pxToPoints(x)}pt;margin-top:${pxToPoints(y)}pt;width:${pxToPoints(width)}pt;height:${pxToPoints(height)}pt;z-index:${zIndex};mso-position-horizontal-relative:page;mso-position-vertical-relative:page`
}

function positionedTextBoxXml(options: {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  color: string
  textDecoration: 'none' | 'underline'
  fillColor?: string
  zIndex: number
  escapeXml: (text: string) => string
}): string {
  const fillColor = options.fillColor ?? 'none'
  const lines = options.text.split('\n').map(line => options.escapeXml(line)).join('<br/>')
  const textDecoration = options.textDecoration === 'underline' ? 'text-decoration:underline;' : ''
  const fontStyle = options.fontStyle === 'italic' ? 'font-style:italic;' : ''
  return `<w:pict><v:shape id="${options.escapeXml(options.id)}" type="#_x0000_t202" style="${positionedShapeStyle(options.x, options.y, options.width, options.height, options.zIndex)}" filled="${fillColor === 'none' ? 'f' : 't'}" fillcolor="#${fillColor}" stroked="f"><v:textbox inset="0,0,0,0"><div style="font-family:${options.escapeXml(options.fontFamily)};font-size:${Math.max(1, Math.round(options.fontSize))}px;font-weight:${options.fontWeight};${fontStyle}${textDecoration}line-height:${Math.max(1, Math.round(options.lineHeight))}px;color:#${options.color};mso-line-height-rule:exactly;">${lines}</div></v:textbox></v:shape></w:pict>`
}

function positionedImageXml(item: ExportSnapshotBlockItem, image: DocxMedia, escapeXml: (text: string) => string, zIndex: number): string {
  const element = item.element
  return `<w:pict><v:shape id="${escapeXml(element.id)}" style="${positionedShapeStyle(element.x, item.y, element.width, element.height, zIndex)}" stroked="f"><v:imagedata r:id="${image.relationshipId}" o:title="${escapeXml(image.entryName)}" /></v:shape></w:pict>`
}

function positionedDividerXml(x: number, y: number, width: number, color: string, zIndex: number): string {
  return `<w:pict><v:line from="${pxToPoints(x)}pt,${pxToPoints(y)}pt" to="${pxToPoints(x + width)}pt,${pxToPoints(y)}pt" style="position:absolute;z-index:${zIndex};mso-position-horizontal-relative:page;mso-position-vertical-relative:page" strokecolor="#${color}" strokeweight="1pt" /></w:pict>`
}

function pxToPoints(px: number): number {
  return Math.round(px * 75) / 100
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
