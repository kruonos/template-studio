import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotBlockItem,
  FlowBlock,
} from './schema.ts'
import { buildTableDocxXml, parseTableData } from './table-engine.ts'
import { getRenderableExportPages } from './export-pages.ts'
import { getSurfacePalette } from './theme.ts'
import { buildFlowBlocks, type BuildFlowBlocksOptions } from './flow-export.ts'
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
  const blocks = buildFlowBlocks({
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
  const now = new Date().toISOString()
  const media = await collectDocxMedia(blocks)
  const documentXml = buildDocxDocumentXml(snapshot, media, hooks)
  const entries = [
    zipEntry('[Content_Types].xml', buildDocxContentTypesXml(media)),
    zipEntry('_rels/.rels', buildDocxRootRelationshipsXml()),
    zipEntry('docProps/core.xml', buildDocxCoreXml(snapshot.templateName, now)),
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

async function collectDocxMedia(blocks: FlowBlock[]): Promise<DocxMedia[]> {
  const media: DocxMedia[] = []
  let relationshipCounter = 1
  for (const block of blocks) {
    if (block.type !== 'image' && block.type !== 'animated-gif' && block.type !== 'mascot') continue
    const src = block.src
    if (src === null || src.length === 0) continue
    const image = await resolveDocxImage(src)
    if (image === null) continue
    media.push({
      blockId: block.id,
      relationshipId: `rId${relationshipCounter++}`,
      entryName: `image-${media.length + 1}.png`,
      bytes: image.bytes,
      drawingId: media.length + 1,
    })
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
    const items = page.items.slice().sort((a, b) => {
      const deltaY = a.y - b.y
      if (deltaY !== 0) return deltaY
      const leftA = a.kind === 'text-line' ? a.x : a.element.x
      const leftB = b.kind === 'text-line' ? b.x : b.element.x
      return leftA - leftB
    })
    let previousBottom = 0

    for (const item of items) {
      const spacingBefore = Math.max(0, pxToTwips(item.y - previousBottom))
      if (item.kind === 'text-line') {
        bodyParts.push(paragraphXml(item.text, hooks.escapeXml, {
          size: pxToDocxHalfPoints(item.fontSize),
          ...(item.fontWeight >= 700 ? { bold: true } : {}),
          ...(item.fontStyle === 'italic' ? { italic: true } : {}),
          ...(item.textDecoration === 'underline' ? { underline: true } : {}),
          fontFamily: item.fontFamily,
          color: toDocxColor(item.color, item.color),
          ...(spacingBefore > 0 ? { spacingBefore } : {}),
          indentLeft: pxToTwips(item.x),
          ...(item.letterSpacing !== 0 ? { letterSpacing: item.letterSpacing } : {}),
        }))
        previousBottom = Math.max(previousBottom, item.y + item.height)
        continue
      }

      const element = item.element
      const indentLeft = pxToTwips(element.x)
      switch (element.type) {
        case 'image':
        case 'animated-gif':
        case 'mascot': {
          const image = mediaByBlockId.get(element.id)
          if (image !== undefined) {
            bodyParts.push(imageParagraphXml(item, image, hooks.escapeXml, { ...(spacingBefore > 0 ? { spacingBefore } : {}), ...(indentLeft > 0 ? { indentLeft } : {}) }))
          } else {
            bodyParts.push(paragraphXml(`[${element.type}]`, hooks.escapeXml, {
              size: 20,
              color: '5B6F7F',
              ...(spacingBefore > 0 ? { spacingBefore } : {}),
              ...(indentLeft > 0 ? { indentLeft } : {}),
            }))
          }
          break
        }
        case 'button': {
          const href = hooks.getButtonHref(element)
          bodyParts.push(paragraphXml(`${hooks.resolveVariables(element.content)}${href === null ? '' : ` — ${href}`}`, hooks.escapeXml, {
            size: pxToDocxHalfPoints(Math.round(hooks.getElementFontSize(element) * 0.9)),
            bold: true,
            fontFamily: hooks.getElementFontFamily(element),
            color: toDocxColor(element.styles.color, palette.buttonText),
            ...(spacingBefore > 0 ? { spacingBefore } : {}),
            ...(indentLeft > 0 ? { indentLeft } : {}),
          }))
          break
        }
        case 'divider':
          bodyParts.push(paragraphXml('------------------------------------------------------------', hooks.escapeXml, {
            size: 20,
            color: toDocxColor(element.styles.color, palette.divider),
            ...(spacingBefore > 0 ? { spacingBefore } : {}),
            ...(indentLeft > 0 ? { indentLeft } : {}),
          }))
          break
        case 'spacer':
          bodyParts.push(paragraphXml('', hooks.escapeXml, {
            size: 20,
            ...(spacingBefore + pxToTwips(element.height) > 0 ? { spacingBefore: spacingBefore + pxToTwips(element.height) } : {}),
            ...(indentLeft > 0 ? { indentLeft } : {}),
          }))
          break
        case 'html':
          bodyParts.push(paragraphXml(stripHtmlToText(hooks.resolveVariables(element.content)), hooks.escapeXml, {
            size: pxToDocxHalfPoints(hooks.getElementFontSize(element)),
            ...(element.styles.fontStyle === 'italic' ? { italic: true } : {}),
            ...(element.styles.textDecoration === 'underline' ? { underline: true } : {}),
            fontFamily: hooks.getElementFontFamily(element),
            color: toDocxColor(element.styles.color, palette.body),
            ...(spacingBefore > 0 ? { spacingBefore } : {}),
            ...(indentLeft > 0 ? { indentLeft } : {}),
            ...(element.styles.letterSpacing !== undefined && element.styles.letterSpacing !== 0 ? { letterSpacing: element.styles.letterSpacing } : {}),
          }))
          break
        case 'video': {
          const href = hooks.getVideoHref(element)
          bodyParts.push(paragraphXml(href === null ? 'Video block' : `Video: ${href}`, hooks.escapeXml, {
            size: pxToDocxHalfPoints(hooks.getElementFontSize(element)),
            fontFamily: hooks.getElementFontFamily(element),
            color: toDocxColor(element.styles.color, palette.body),
            ...(spacingBefore > 0 ? { spacingBefore } : {}),
            ...(indentLeft > 0 ? { indentLeft } : {}),
          }))
          break
        }
        case 'table': {
          const tableData = parseTableData(element.content)
          if (tableData !== null) {
            bodyParts.push(buildTableDocxXml(tableData, element.width, tableData.defaultBorder, hooks.resolveVariables, hooks.escapeXml))
          } else {
            bodyParts.push(paragraphXml('[Table]', hooks.escapeXml, {
              size: 20,
              color: '5B6F7F',
              ...(spacingBefore > 0 ? { spacingBefore } : {}),
              ...(indentLeft > 0 ? { indentLeft } : {}),
            }))
          }
          break
        }
      }
      previousBottom = Math.max(previousBottom, item.y + element.height)
    }

    if (pageIndex < pages.length - 1) bodyParts.push(pageBreakParagraphXml())
  })

  const pgWidthTwips = Math.round(snapshot.canvasWidth * 15)
  const pgHeightTwips = Math.round(snapshot.pageHeight * 15)
  const marginTwips = Math.round(snapshot.pageMargin * 15)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join('')}
    <w:sectPr>
      <w:pgSz w:w="${pgWidthTwips}" w:h="${pgHeightTwips}" />
      <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="720" w:footer="720" w:gutter="0" />
    </w:sectPr>
  </w:body>
</w:document>`
}

function imageParagraphXml(item: ExportSnapshotBlockItem, image: DocxMedia, escapeXml: (text: string) => string, options?: { spacingBefore?: number; indentLeft?: number }): string {
  const widthEmu = Math.round(Math.max(1, Math.round(item.element.width)) * 9525)
  const heightEmu = Math.round(Math.max(1, Math.round(item.element.height)) * 9525)
  const spacingAttrs = [options?.spacingBefore !== undefined ? `w:before="${options.spacingBefore}"` : '', 'w:after="220"'].filter(Boolean).join(' ')
  const indentXml = options?.indentLeft !== undefined ? `<w:ind w:left="${options.indentLeft}" />` : ''
  return `
    <w:p>
      <w:pPr><w:spacing ${spacingAttrs} />${indentXml}</w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${widthEmu}" cy="${heightEmu}" />
            <wp:docPr id="${image.drawingId}" name="${escapeXml(image.entryName)}" />
            <wp:cNvGraphicFramePr />
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="${image.drawingId}" name="${escapeXml(image.entryName)}" />
                    <pic:cNvPicPr />
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${image.relationshipId}" />
                    <a:stretch><a:fillRect /></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0" />
                      <a:ext cx="${widthEmu}" cy="${heightEmu}" />
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst /></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
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

function pxToTwips(px: number): number {
  return Math.max(0, Math.round(px * 15))
}

function pxToDocxHalfPoints(px: number): number {
  return Math.max(2, Math.round(px * 1.5))
}

function paragraphXml(text: string, escapeXml: (text: string) => string, options: { size: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; fontFamily?: string; spacingBefore?: number; spacingAfter?: number; indentLeft?: number; align?: 'left' | 'center' | 'right'; letterSpacing?: number }): string {
  const safeText = escapeXml(text)
  const runContent = safeText.length === 0
    ? '<w:r><w:rPr><w:sz w:val="20" /></w:rPr><w:t></w:t></w:r>'
    : safeText.split('\n').map((line, index) => `${index === 0 ? '' : '<w:br/>'}<w:t xml:space="preserve">${line}</w:t>`).join('')
  const spacingAttrs = [options.spacingBefore !== undefined ? `w:before="${options.spacingBefore}"` : '', options.spacingAfter !== undefined ? `w:after="${options.spacingAfter}"` : ''].filter(Boolean).join(' ')
  return `
    <w:p>
      <w:pPr>${spacingAttrs.length === 0 ? '' : `<w:spacing ${spacingAttrs} />`}${options.indentLeft === undefined ? '' : `<w:ind w:left="${options.indentLeft}" />`}${options.align === undefined || options.align === 'left' ? '' : `<w:jc w:val="${options.align}" />`}</w:pPr>
      <w:r>
        <w:rPr>
          ${options.bold ? '<w:b />' : ''}
          ${options.italic ? '<w:i />' : ''}
          ${options.underline ? '<w:u w:val="single" />' : ''}
          ${options.color ? `<w:color w:val="${options.color}" />` : ''}
          ${options.letterSpacing !== undefined && options.letterSpacing !== 0 ? `<w:spacing w:val="${Math.round(options.letterSpacing * 20)}" />` : ''}
          <w:rFonts w:ascii="${escapeXml(options.fontFamily ?? 'Georgia')}" w:hAnsi="${escapeXml(options.fontFamily ?? 'Georgia')}" />
          <w:sz w:val="${options.size}" />
        </w:rPr>
        ${runContent}
      </w:r>
    </w:p>
  `
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
