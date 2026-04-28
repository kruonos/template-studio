import {
  buildTableHtml,
  parseTableData,
} from './table-engine.ts'
import {
  MASCOT_PRESETS,
  svgMarkupToDataUrl,
} from './mascots.ts'
import {
  escapeAttribute,
  escapeHtml,
  roundTo,
} from './utils.ts'
import {
  getDefaultBackground,
  getDefaultBorderRadius,
  getSurfacePalette,
} from './theme.ts'
import {
  normalizeSafeUrl,
  sanitizeHtml,
} from './content.ts'
import type {
  CanvasElement,
  ElementType,
  ExportSnapshot,
  ExportSnapshotBlockItem,
  ExportSnapshotPage,
  ExportSnapshotTextItem,
  MascotPreset,
  SurfaceTheme,
} from './schema.ts'

type ResolveVariables = (text: string) => string
type FontFamilyResolver = (element: CanvasElement) => string
type FontSizeResolver = (element: CanvasElement) => number
type FontWeightResolver = (element: CanvasElement) => number

type EmailLayoutEntry = {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  blockItem: ExportSnapshotBlockItem | null
  textLines: ExportSnapshotTextItem[]
  element: CanvasElement | null
}

type EmailLayoutRow = {
  top: number
  bottom: number
  entries: EmailLayoutEntry[]
}

type SnapshotToMjmlOptions = {
  breakpoint: number
  resolveVariables: ResolveVariables
  getElementFontFamily: FontFamilyResolver
  getElementFontSize: FontSizeResolver
  getElementFontWeight: FontWeightResolver
}

export function snapshotToMjml(snapshot: ExportSnapshot, options: SnapshotToMjmlOptions): string {
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const bodySections = getRenderablePages(snapshot).flatMap(page => {
    const sections = buildMjmlSectionsForPage(page, snapshot, options)
    if (page.pageIndex < snapshot.pageCount - 1 && sections.length > 0) {
      sections.push(`
        <mj-section padding="0">
          <mj-column>
            <mj-spacer height="24px" />
          </mj-column>
        </mj-section>
      `)
    }
    return sections
  })

  return `<!doctype html>
<mjml>
  <mj-head>
    <mj-breakpoint width="${Math.round(options.breakpoint)}px" />
    <mj-attributes>
      <mj-all font-family="'Avenir Next','Segoe UI',sans-serif" />
      <mj-text color="${palette.body}" padding="0" />
      <mj-section padding="0" background-color="${palette.pageBackground}" />
      <mj-column padding="0" />
    </mj-attributes>
    <mj-preview>${escapeHtml(snapshot.templateName)}</mj-preview>
    <mj-style inline="inline">
      .mj-raw-html div, .mj-raw-html span, .mj-raw-html p { margin: 0; }
      .mj-inline-lines > div { white-space: nowrap; }
    </mj-style>
  </mj-head>
  <mj-body width="${Math.round(snapshot.canvasWidth)}px" background-color="${palette.exportFrame}">
    ${bodySections.join('\n')}
  </mj-body>
</mjml>`
}

function getRenderablePages(snapshot: ExportSnapshot): ExportSnapshotPage[] {
  return snapshot.pages
}

function buildMjmlSectionsForPage(
  page: ExportSnapshotPage,
  snapshot: ExportSnapshot,
  options: SnapshotToMjmlOptions,
): string[] {
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const rows = buildEmailLayoutRows(page)
  const sections: string[] = []

  if (rows.length === 0) return sections

  const firstTop = Math.round(rows[0]!.top)
  if (firstTop > 4) {
    sections.push(singleSpacerSection(firstTop))
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!
    if (index > 0) {
      const prevBottom = Math.round(rows[index - 1]!.bottom)
      const currentTop = Math.round(row.top)
      const gap = currentTop - prevBottom
      if (gap > 2) sections.push(singleSpacerSection(gap))
    }

    sections.push(renderMjmlRow(row, snapshot.canvasWidth, snapshot.surfaceTheme, palette, options))
  }

  return sections
}

function singleSpacerSection(height: number): string {
  return `
    <mj-section padding="0">
      <mj-column>
        <mj-spacer height="${Math.round(height)}px" />
      </mj-column>
    </mj-section>
  `
}

function renderMjmlRow(
  row: EmailLayoutRow,
  canvasWidth: number,
  surfaceTheme: SurfaceTheme,
  palette: ReturnType<typeof getSurfacePalette>,
  options: SnapshotToMjmlOptions,
): string {
  const sorted = row.entries.slice().sort((a, b) => a.x - b.x)
  const adjusted = sorted.length > 1 ? adjustOverlappingWidths(sorted) : sorted.map(entry => ({ entry, effectiveX: entry.x, effectiveWidth: entry.width }))
  const columns: string[] = []
  let cursor = 0

  for (const { entry, effectiveX, effectiveWidth } of adjusted) {
    const gap = Math.max(0, Math.round(effectiveX) - cursor)
    if (gap > 0) {
      columns.push(renderSpacerColumn(gap, Math.max(1, Math.round(row.bottom - row.top)), canvasWidth))
      cursor += gap
    }
    const width = Math.max(1, Math.round(effectiveWidth))
    columns.push(renderMjmlEntryColumn(entry, width, canvasWidth, surfaceTheme, palette, options))
    cursor += width
  }

  const rightGap = Math.max(0, Math.round(canvasWidth - cursor))
  if (rightGap > 0) {
    columns.push(renderSpacerColumn(rightGap, Math.max(1, Math.round(row.bottom - row.top)), canvasWidth))
  }

  return `
    <mj-section padding="0">
      ${columns.join('\n')}
    </mj-section>
  `
}

function renderSpacerColumn(width: number, height: number, canvasWidth: number): string {
  return `
    <mj-column width="${toMjmlWidth(width, canvasWidth)}">
      <mj-spacer height="${Math.max(1, height)}px" />
    </mj-column>
  `
}

function renderMjmlEntryColumn(
  entry: EmailLayoutEntry,
  width: number,
  canvasWidth: number,
  surfaceTheme: SurfaceTheme,
  palette: ReturnType<typeof getSurfacePalette>,
  options: SnapshotToMjmlOptions,
): string {
  return `
    <mj-column width="${toMjmlWidth(width, canvasWidth)}">
      ${renderMjmlEntry(entry, width, surfaceTheme, palette, options)}
    </mj-column>
  `
}

function renderMjmlEntry(
  entry: EmailLayoutEntry,
  width: number,
  surfaceTheme: SurfaceTheme,
  palette: ReturnType<typeof getSurfacePalette>,
  options: SnapshotToMjmlOptions,
): string {
  if (entry.textLines.length > 0) {
    return renderMjmlTextEntry(entry, options)
  }
  if (entry.blockItem !== null) {
    return renderMjmlBlockEntry(entry.blockItem, width, surfaceTheme, palette, options)
  }
  return '<mj-text padding="0">&nbsp;</mj-text>'
}

function renderMjmlTextEntry(entry: EmailLayoutEntry, options: SnapshotToMjmlOptions): string {
  const textLines = entry.textLines.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  const element = entry.element
  const fontFamily = element !== null ? options.getElementFontFamily(element) : (textLines[0]?.fontFamily ?? 'Georgia, serif')
  const fontSize = element !== null ? options.getElementFontSize(element) : (textLines[0]?.fontSize ?? 18)
  const fontWeight = element !== null ? options.getElementFontWeight(element) : (textLines[0]?.fontWeight ?? 400)
  const fontStyle = element?.styles.fontStyle ?? (textLines[0]?.fontStyle ?? 'normal')
  const color = textLines[0]?.color ?? '#354a5a'
  const lineHeight = textLines[0]?.lineHeight ?? Math.round(fontSize * 1.5)
  const align = element?.styles.textAlign ?? 'left'
  const letterSpacing = element?.styles.letterSpacing ?? 0
  const textDecoration = element?.styles.textDecoration ?? 'none'
  const opacity = element?.styles.opacity ?? 1
  const htmlContent = textLines
    .map(line => `<div>${line.text.length > 0 ? escapeHtml(line.text) : '&nbsp;'}</div>`)
    .join('')

  const attrs = [
    `padding="0"`,
    `font-family="${escapeAttribute(fontFamily)}"`,
    `font-size="${fontSize}px"`,
    `font-weight="${fontWeight}"`,
    `line-height="${lineHeight}px"`,
    `color="${escapeAttribute(color)}"`,
    `align="${align}"`,
    opacity < 1 ? `css-class="mj-inline-lines"` : `css-class="mj-inline-lines"`,
  ]

  return `<mj-text ${attrs.join(' ')}><span style="font-style:${fontStyle};text-decoration:${textDecoration};${letterSpacing !== 0 ? `letter-spacing:${letterSpacing}px;` : ''}${opacity < 1 ? `opacity:${opacity};` : ''}">${htmlContent}</span></mj-text>`
}

function renderMjmlBlockEntry(
  item: ExportSnapshotBlockItem,
  width: number,
  surfaceTheme: SurfaceTheme,
  palette: ReturnType<typeof getSurfacePalette>,
  options: SnapshotToMjmlOptions,
): string {
  const element = item.element
  const height = Math.max(1, Math.round(element.height))
  switch (element.type) {
    case 'image': {
      if (element.content.trim().length === 0) {
        return `<mj-text padding="0" align="center" color="#607585" font-size="13px" font-weight="600" height="${height}px">Image placeholder</mj-text>`
      }
      return `<mj-image padding="0" src="${escapeAttribute(element.content)}" width="${Math.max(1, Math.round(width))}px" border-radius="${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px" />`
    }
    case 'button': {
      const href = normalizeSafeUrl(options.resolveVariables(element.styles.href ?? ''), 'href') ?? '#'
      return `<mj-button padding="0" href="${escapeAttribute(href)}" background-color="${escapeAttribute(element.styles.background ?? '#17384f')}" color="${escapeAttribute(element.styles.color ?? '#f8fffd')}" border-radius="${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px" font-family="${escapeAttribute(options.getElementFontFamily(element))}" font-size="${options.getElementFontSize(element)}px" font-weight="${options.getElementFontWeight(element)}" inner-padding="16px 18px">${escapeHtml(options.resolveVariables(element.content))}</mj-button>`
    }
    case 'divider':
      return `<mj-divider padding="0" border-color="${escapeAttribute(element.styles.color ?? palette.divider)}" border-width="1px" />`
    case 'spacer':
      return `<mj-spacer height="${height}px" />`
    case 'html': {
      const bgColor = element.styles.background ?? getDefaultBackground(element.type, surfaceTheme)
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius(element.type)
      return `<mj-raw><div class="mj-raw-html" style="padding:14px;background:${escapeAttribute(bgColor)};border-radius:${borderRadius}px;color:${escapeAttribute(palette.body)};line-height:1.5;">${sanitizeHtml(options.resolveVariables(element.content))}</div></mj-raw>`
    }
    case 'video': {
      const href = normalizeSafeUrl(element.content, 'href') ?? '#'
      const bgColor = surfaceTheme === 'dark' ? '#111a23' : '#091019'
      const textColor = surfaceTheme === 'dark' ? '#eef5fb' : '#f2f6f9'
      return `<mj-button padding="0" href="${escapeAttribute(href)}" background-color="${bgColor}" color="${textColor}" border-radius="${getDefaultBorderRadius('button')}px" font-size="14px" inner-padding="16px 18px">Open video</mj-button>`
    }
    case 'mascot': {
      const preset = (element.styles.mascotPreset ?? 'dragon') as MascotPreset
      const presetDef = MASCOT_PRESETS[preset] ?? MASCOT_PRESETS.dragon
      const src = preset === 'custom' && element.content.trim().length > 0
        ? element.content
        : svgMarkupToDataUrl(presetDef.svg)
      return `<mj-image padding="0" src="${escapeAttribute(src)}" width="${Math.max(1, Math.round(width))}px" />`
    }
    case 'animated-gif': {
      if (element.content.trim().length === 0) {
        return `<mj-text padding="0" align="center" color="#607585" font-size="13px" font-weight="600">Animated visual</mj-text>`
      }
      return `<mj-image padding="0" src="${escapeAttribute(element.content)}" width="${Math.max(1, Math.round(width))}px" />`
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      if (tableData === null) return '<mj-text padding="0">Invalid table</mj-text>'
      const emailTableOpts: { striped?: boolean; stripeColor?: string; headerRows?: number } = {}
      if (element.styles.tableStriped !== undefined) emailTableOpts.striped = element.styles.tableStriped
      if (element.styles.tableStripeColor !== undefined) emailTableOpts.stripeColor = element.styles.tableStripeColor
      if (element.styles.tableHeaderRows !== undefined) emailTableOpts.headerRows = element.styles.tableHeaderRows
      const tableHtml = buildTableHtml(tableData, element.width, tableData.defaultBorder, options.resolveVariables, emailTableOpts)
      return `<mj-raw>${tableHtml}</mj-raw>`
    }
    default:
      return '<mj-text padding="0">&nbsp;</mj-text>'
  }
}

function toMjmlWidth(width: number, canvasWidth: number): string {
  return `${roundTo((width / Math.max(1, canvasWidth)) * 100, 3)}%`
}

function buildEmailLayoutRows(
  page: ExportSnapshotPage,
): EmailLayoutRow[] {
  const entryMap = new Map<string, EmailLayoutEntry>()

  for (const item of page.items) {
    if (item.kind === 'block') {
      entryMap.set(item.element.id, {
        id: item.element.id,
        type: item.element.type,
        x: item.element.x,
        y: item.y,
        width: item.element.width,
        height: item.element.height,
        blockItem: item,
        textLines: [],
        element: item.element,
      })
    } else {
      let entry = entryMap.get(item.elementId)
      if (entry === undefined) {
        entry = {
          id: item.elementId,
          type: item.elementType,
          x: item.x,
          y: item.y,
          width: item.slotWidth,
          height: item.lineHeight,
          blockItem: null,
          textLines: [],
          element: null,
        }
        entryMap.set(item.elementId, entry)
      }
      entry.textLines.push(item)
    }
  }

  for (const entry of entryMap.values()) {
    if (entry.textLines.length > 0) {
      const bounds = getEmailTextEntryBounds(entry.textLines)
      if (bounds !== null) {
        entry.x = bounds.x
        entry.y = bounds.y
        entry.width = bounds.width
        entry.height = bounds.height
      }
    }
  }

  const entries = Array.from(entryMap.values()).flatMap(entry =>
    entry.textLines.length > 0 ? splitEmailTextEntryIntoBands(entry) : [entry],
  )

  entries.sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: EmailLayoutRow[] = []

  for (const entry of entries) {
    const eTop = entry.y
    const eBottom = entry.y + entry.height
    const eHeight = eBottom - eTop

    if (entry.type === 'heading') {
      rows.push({ top: eTop, bottom: eBottom, entries: [entry] })
      continue
    }

    let merged = false
    for (const row of rows) {
      if (row.entries.some(existing => existing.type === 'heading')) continue
      let fitsAll = true
      for (const existing of row.entries) {
        const overlapTop = Math.max(eTop, existing.y)
        const overlapBottom = Math.min(eBottom, existing.y + existing.height)
        const overlapAmount = overlapBottom - overlapTop
        if (overlapAmount <= 0) { fitsAll = false; break }
        const boxOverlap = Math.min(entry.x + entry.width, existing.x + existing.width) - Math.max(entry.x, existing.x)
        if (boxOverlap > 8 && !isTextLike(entry.type) && !isTextLike(existing.type)) { fitsAll = false; break }
        if (overlapAmount < Math.min(eHeight, existing.height) * 0.2) { fitsAll = false; break }
        if (boxOverlap > 12) { fitsAll = false; break }
      }
      if (fitsAll) {
        row.entries.push(entry)
        row.top = Math.min(row.top, eTop)
        row.bottom = Math.max(row.bottom, eBottom)
        merged = true
        break
      }
    }
    if (!merged) rows.push({ top: eTop, bottom: eBottom, entries: [entry] })
  }

  rows.sort((a, b) => a.top - b.top)
  return rows
}

function getEmailTextEntryBounds(lines: ExportSnapshotTextItem[]): { x: number; y: number; width: number; height: number } | null {
  if (lines.length === 0) return null
  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  for (const line of lines) {
    minY = Math.min(minY, line.y)
    maxY = Math.max(maxY, line.y + line.lineHeight)
    minX = Math.min(minX, line.x)
    maxX = Math.max(maxX, line.x + Math.max(line.width, line.slotWidth))
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

function splitEmailTextEntryIntoBands(entry: EmailLayoutEntry): EmailLayoutEntry[] {
  const sortedLines = entry.textLines.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  if (sortedLines.length <= 1) return [entry]
  const bands: ExportSnapshotTextItem[][] = []
  let currentBand: ExportSnapshotTextItem[] = [sortedLines[0]!]
  for (let index = 1; index < sortedLines.length; index += 1) {
    const previous = currentBand[currentBand.length - 1]!
    const line = sortedLines[index]!
    const maxYGap = Math.max(previous.lineHeight * 1.35, previous.lineHeight + 4)
    const previousRight = previous.x + Math.max(previous.width, previous.slotWidth)
    const lineRight = line.x + Math.max(line.width, line.slotWidth)
    const xShift = Math.abs(line.x - previous.x)
    const widthShift = Math.abs(lineRight - previousRight)
    if (line.y - previous.y <= maxYGap && xShift <= Math.max(48, previous.fontSize * 3) && widthShift <= Math.max(96, previous.fontSize * 6)) {
      currentBand.push(line)
    } else {
      bands.push(currentBand)
      currentBand = [line]
    }
  }
  bands.push(currentBand)

  return bands.map((bandLines, bandIndex) => {
    const bounds = getEmailTextEntryBounds(bandLines)!
    return {
      id: `${entry.id}__band_${bandIndex}`,
      type: entry.type,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      blockItem: null,
      textLines: bandLines,
      element: entry.element,
    }
  })
}

function adjustOverlappingWidths(entries: EmailLayoutEntry[]): Array<{ entry: EmailLayoutEntry; effectiveX: number; effectiveWidth: number }> {
  const sorted = entries.slice().sort((a, b) => a.x - b.x)
  return sorted.map((entry, index) => {
    let effectiveX = entry.x
    let effectiveWidth = entry.width
    if (isTextLike(entry.type) && index + 1 < sorted.length) {
      const next = sorted[index + 1]!
      const rightEdge = effectiveX + effectiveWidth
      if (rightEdge > next.x + 1) effectiveWidth = Math.max(40, next.x - effectiveX - 8)
    }
    if (isTextLike(entry.type) && index > 0) {
      const previous = sorted[index - 1]!
      const previousRight = previous.x + previous.width
      if (previousRight > effectiveX + 1 && !isTextLike(previous.type)) {
        effectiveX = previousRight + 8
        effectiveWidth = Math.max(40, entry.x + entry.width - effectiveX)
      }
    }
    return { entry, effectiveX: Math.round(effectiveX), effectiveWidth: Math.max(1, Math.round(effectiveWidth)) }
  })
}

function isTextLike(type: ElementType): boolean {
  return type === 'text' || type === 'heading'
}
