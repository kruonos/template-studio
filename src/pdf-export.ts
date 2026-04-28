import type { GState, jsPDF } from 'jspdf'
import { loadImageElement, normalizeSafeUrl, sanitizeHtml, stripHtmlToText } from './content.ts'
import { getRenderableExportPages } from './export-pages.ts'
import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotBlockItem,
  ExportSnapshotTextItem,
  MascotPreset,
  SurfacePalette,
  SurfaceTheme,
  TableData,
} from './schema.ts'
import { getButtonLabelFontSize } from './element-typography.ts'
import { parseTableData, cellKey, getCell } from './table-engine.ts'
import { getDefaultBackground, getDefaultBorderRadius, getSurfacePalette } from './theme.ts'
import { roundTo, toHexColor } from './utils.ts'

type PdfExportHooks = {
  importJsPdf: () => Promise<{ jsPDF: unknown; GState?: unknown }>
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getElementLineHeight: (element: CanvasElement) => number
  getElementTextColor: (element: CanvasElement, surfaceTheme: SurfaceTheme) => string
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotPresetLabel: (preset: MascotPreset) => string
  getTableCellRenderState: (element: CanvasElement, tableData: TableData, cell: TableData['cells'][number], rowIndex: number, content: string) => {
    rect: ReturnType<typeof import('./table-engine.ts').getCellRect>
    bg: string
    borderTop: TableData['defaultBorder']
    borderRight: TableData['defaultBorder']
    borderBottom: TableData['defaultBorder']
    borderLeft: TableData['defaultBorder']
    projection: {
      color: string
      lines: Array<{ x: number; y: number; text: string }>
    }
  }
  getResolvedTableCellContent: (cell: TableData['cells'][number], data: TableData) => string
  getTableCellFontFamily: (cell: TableData['cells'][number]) => string
  getTableCellFontSize: (cell: TableData['cells'][number]) => number
  getTableCellFontWeight: (cell: TableData['cells'][number]) => number
  getVideoHref: (element: CanvasElement) => string | null
}

let pdfColorProbeContext: CanvasRenderingContext2D | null = null

export async function buildPdfBlob(snapshot: ExportSnapshot, hooks: PdfExportHooks): Promise<Blob> {
  const pages = getRenderableExportPages(snapshot)
  const palette = getSurfacePalette(snapshot.surfaceTheme)
  const { jsPDF, GState } = await hooks.importJsPdf() as { jsPDF: typeof import('jspdf').jsPDF; GState?: typeof import('jspdf').GState }
  const pageWidthPt = pxToPdfPoints(snapshot.canvasWidth)
  const pageHeightPt = pxToPdfPoints(snapshot.pageHeight)
  const orientation = pageWidthPt > pageHeightPt ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pageWidthPt, pageHeightPt],
    compress: true,
    putOnlyUsedFonts: true,
  })
  pdf.setDocumentProperties({
    title: snapshot.templateName,
    subject: snapshot.description,
    creator: 'Pretext Template Studio',
  })

  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage([pageWidthPt, pageHeightPt], orientation)
    const [bgR, bgG, bgB] = cssColorToPdfRgb(palette.pageBackground, '#ffffff')
    pdf.setFillColor(bgR, bgG, bgB)
    pdf.rect(0, 0, pageWidthPt, pageHeightPt, 'F')
    for (const item of pages[index]!.items) {
      if (item.kind === 'text-line') {
        drawPdfTextLine(pdf, item, GState)
      } else {
        await drawPdfBlockItem(pdf, item, palette, snapshot.surfaceTheme, hooks, GState)
      }
    }
  }

  return pdf.output('blob') as Blob
}

function pxToPdfPoints(px: number): number {
  return roundTo((px * 72) / 96, 2)
}

function getPdfColorProbeContext(): CanvasRenderingContext2D | null {
  if (pdfColorProbeContext !== null) return pdfColorProbeContext
  const canvas = document.createElement('canvas')
  pdfColorProbeContext = canvas.getContext('2d')
  return pdfColorProbeContext
}

function cssColorToPdfRgb(value: string | undefined, fallback: string): [number, number, number] {
  const context = getPdfColorProbeContext()
  if (context === null) return hexColorToRgb(toHexColor(value ?? fallback))
  context.fillStyle = fallback
  if (value !== undefined && value.trim().length > 0) context.fillStyle = value
  const normalized = String(context.fillStyle)
  if (normalized.startsWith('#')) return hexColorToRgb(toHexColor(normalized))
  const rgbMatch = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch !== null) {
    return [Number.parseInt(rgbMatch[1]!, 10), Number.parseInt(rgbMatch[2]!, 10), Number.parseInt(rgbMatch[3]!, 10)]
  }
  return hexColorToRgb(toHexColor(fallback))
}

function hexColorToRgb(value: string): [number, number, number] {
  const hex = toHexColor(value).slice(1)
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function getPdfFontDescriptor(fontFamily: string, fontStyle: 'normal' | 'italic', fontWeight: number): { name: 'times' | 'helvetica' | 'courier'; style: 'normal' | 'bold' | 'italic' | 'bolditalic' } {
  const normalized = fontFamily.toLowerCase()
  const name = normalized.includes('georgia') || normalized.includes('times')
    ? 'times'
    : (normalized.includes('mono') || normalized.includes('courier') ? 'courier' : 'helvetica')
  const style = fontWeight >= 700
    ? (fontStyle === 'italic' ? 'bolditalic' : 'bold')
    : (fontStyle === 'italic' ? 'italic' : 'normal')
  return { name, style }
}

function getPdfTextWidth(pdf: jsPDF, text: string, letterSpacingPx: number): number {
  const baseWidth = pdf.getTextWidth(text)
  if (text.length <= 1 || letterSpacingPx === 0) return baseWidth
  return baseWidth + pxToPdfPoints(letterSpacingPx) * (text.length - 1)
}

function applyPdfFont(pdf: jsPDF, fontFamily: string, fontStyle: 'normal' | 'italic', fontWeight: number, fontSizePx: number): void {
  const descriptor = getPdfFontDescriptor(fontFamily, fontStyle, fontWeight)
  pdf.setFont(descriptor.name, descriptor.style)
  pdf.setFontSize(pxToPdfPoints(fontSizePx))
}

function withPdfOpacity(pdf: jsPDF, GStateCtor: typeof GState | undefined, opacity: number, draw: () => void): void {
  if (opacity >= 1 || GStateCtor === undefined) {
    draw()
    return
  }
  pdf.saveGraphicsState()
  pdf.setGState(new GStateCtor({ opacity, 'stroke-opacity': opacity }))
  try {
    draw()
  } finally {
    pdf.restoreGraphicsState()
  }
}

function drawPdfTextLine(pdf: jsPDF, item: ExportSnapshotTextItem, GStateCtor: typeof GState | undefined): void {
  const [red, green, blue] = cssColorToPdfRgb(item.color, '#000000')
  const x = pxToPdfPoints(item.x)
  const y = pxToPdfPoints(item.y)
  const fontSize = pxToPdfPoints(item.fontSize)
  const charSpace = pxToPdfPoints(item.letterSpacing)
  withPdfOpacity(pdf, GStateCtor, item.opacity, () => {
    applyPdfFont(pdf, item.fontFamily, item.fontStyle, item.fontWeight, item.fontSize)
    pdf.setTextColor(red, green, blue)
    pdf.text(item.text, x, y, { baseline: 'top', charSpace })
    if (item.textDecoration === 'underline' && item.text.length > 0) {
      const underlineY = y + fontSize + pxToPdfPoints(Math.max(1, item.fontSize * 0.08))
      const textWidth = getPdfTextWidth(pdf, item.text, item.letterSpacing)
      pdf.setDrawColor(red, green, blue)
      pdf.setLineWidth(Math.max(0.5, pxToPdfPoints(item.fontSize * 0.04)))
      pdf.line(x, underlineY, x + textWidth, underlineY)
    }
  })
}

function drawPdfCenteredLabel(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fontFamily: string; fontStyle: 'normal' | 'italic'; fontWeight: number; fontSizePx: number; color: string },
): void {
  const [red, green, blue] = cssColorToPdfRgb(options.color, '#000000')
  applyPdfFont(pdf, options.fontFamily, options.fontStyle, options.fontWeight, options.fontSizePx)
  pdf.setTextColor(red, green, blue)
  pdf.text(text, x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' })
}

function drawPdfWrappedTextBlock(
  pdf: jsPDF,
  element: CanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  surfaceTheme: SurfaceTheme,
  hooks: Pick<PdfExportHooks, 'resolveVariables' | 'getElementFontFamily' | 'getElementFontSize' | 'getElementFontWeight' | 'getElementLineHeight' | 'getElementTextColor'>,
): void {
  const fontFamily = hooks.getElementFontFamily(element)
  const fontStyle = element.styles.fontStyle ?? 'normal'
  const fontWeight = hooks.getElementFontWeight(element)
  const fontSizePx = hooks.getElementFontSize(element)
  const lineHeightPt = pxToPdfPoints(hooks.getElementLineHeight(element))
  const paddingPt = pxToPdfPoints(14)
  const innerWidth = Math.max(1, width - paddingPt * 2)
  const maxBottom = y + height - paddingPt
  const content = stripHtmlToText(sanitizeHtml(hooks.resolveVariables(element.content)))
  const [red, green, blue] = cssColorToPdfRgb(hooks.getElementTextColor(element, surfaceTheme), '#1a2b3a')
  applyPdfFont(pdf, fontFamily, fontStyle, fontWeight, fontSizePx)
  pdf.setTextColor(red, green, blue)
  const lines = pdf.splitTextToSize(content, innerWidth) as string[]
  let currentY = y + paddingPt
  for (const line of lines) {
    if (currentY + lineHeightPt > maxBottom) break
    pdf.text(line, x + paddingPt, currentY, {
      baseline: 'top',
      charSpace: pxToPdfPoints(element.styles.letterSpacing ?? 0),
      maxWidth: innerWidth,
    })
    currentY += lineHeightPt
  }
}

function traceRoundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  if (safeRadius <= 0) {
    context.rect(x, y, width, height)
    return
  }
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function rasterizeImageForPdf(
  image: CanvasImageSource,
  widthPx: number,
  heightPx: number,
  radiusPx: number,
  opacity: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(widthPx))
  canvas.height = Math.max(1, Math.round(heightPx))
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.save()
  context.globalAlpha = opacity
  traceRoundedRectPath(context, 0, 0, canvas.width, canvas.height, radiusPx)
  context.clip()
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  context.restore()
  return canvas
}

function shouldRasterizeImageForPdf(src: string, borderRadius: number, opacity: number): boolean {
  const normalizedSrc = src.toLowerCase()
  return borderRadius > 0 || opacity < 1 || normalizedSrc.startsWith('data:image/svg+xml') || normalizedSrc.endsWith('.svg') || normalizedSrc.includes('.svg?')
}

async function renderPdfHtmlBlockCanvas(
  element: CanvasElement,
  surfaceTheme: SurfaceTheme,
  hooks: Pick<PdfExportHooks, 'resolveVariables'>,
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = `${Math.max(1, Math.round(element.width))}px`
  host.style.height = `${Math.max(1, Math.round(element.height))}px`
  host.style.boxSizing = 'border-box'
  host.style.padding = '14px'
  host.style.overflow = 'hidden'
  host.style.background = element.styles.background ?? getDefaultBackground('html', surfaceTheme)
  host.style.borderRadius = `${element.styles.borderRadius ?? getDefaultBorderRadius('html')}px`
  host.style.color = getSurfacePalette(surfaceTheme).body
  host.style.fontFamily = '"Avenir Next", "Segoe UI", sans-serif'
  host.style.fontSize = '14px'
  host.style.lineHeight = '1.5'
  host.innerHTML = sanitizeHtml(hooks.resolveVariables(element.content))
  document.body.append(host)
  try {
    return await html2canvas(host, {
      backgroundColor: null,
      width: Math.max(1, Math.round(element.width)),
      height: Math.max(1, Math.round(element.height)),
      scale: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      useCORS: true,
    })
  } finally {
    host.remove()
  }
}

async function drawPdfBlockItem(
  pdf: jsPDF,
  item: ExportSnapshotBlockItem,
  palette: SurfacePalette,
  surfaceTheme: SurfaceTheme,
  hooks: PdfExportHooks,
  GStateCtor: typeof GState | undefined,
): Promise<void> {
  const element = item.element
  const x = pxToPdfPoints(element.x)
  const y = pxToPdfPoints(item.y)
  const width = pxToPdfPoints(element.width)
  const height = pxToPdfPoints(element.height)
  const opacity = element.styles.opacity ?? 1

  switch (element.type) {
    case 'image': {
      const src = normalizeSafeUrl(element.content, 'src')
      if (src !== null && src.length > 0) {
        try {
          const image = await loadImageElement(src)
          const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius(element.type)
          const raster = shouldRasterizeImageForPdf(src, borderRadius, opacity)
            ? rasterizeImageForPdf(image, element.width, element.height, borderRadius, opacity)
            : null
          withPdfOpacity(pdf, GStateCtor, raster === null ? opacity : 1, () => {
            pdf.addImage(raster ?? image, x, y, width, height, undefined, 'FAST')
          })
          return
        } catch {
          // Fall through to placeholder drawing.
        }
      }
      const [fillR, fillG, fillB] = cssColorToPdfRgb('#e8eef3', '#e8eef3')
      const [textR, textG, textB] = cssColorToPdfRgb('#607585', '#607585')
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        pdf.setFillColor(fillR, fillG, fillB)
        pdf.rect(x, y, width, height, 'F')
        pdf.setTextColor(textR, textG, textB)
        applyPdfFont(pdf, 'Helvetica, Arial, sans-serif', 'normal', 600, 13)
        pdf.text('Image placeholder', x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' })
      })
      return
    }
    case 'button': {
      const [fillR, fillG, fillB] = cssColorToPdfRgb(element.styles.background ?? palette.buttonBackground, palette.buttonBackground)
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        pdf.setFillColor(fillR, fillG, fillB)
        const radius = Math.min(pxToPdfPoints(element.styles.borderRadius ?? getDefaultBorderRadius(element.type)), width / 2, height / 2)
        pdf.roundedRect(x, y, width, height, radius, radius, 'F')
        drawPdfCenteredLabel(pdf, hooks.resolveVariables(element.content), x, y, width, height, {
          fontFamily: hooks.getElementFontFamily(element),
          fontStyle: element.styles.fontStyle ?? 'normal',
          fontWeight: hooks.getElementFontWeight(element),
          fontSizePx: getButtonLabelFontSize(element),
          color: element.styles.color ?? palette.buttonText,
        })
        const href = normalizeSafeUrl(hooks.resolveVariables(element.styles.href ?? ''), 'href')
        if (href !== null) pdf.link(x, y, width, height, { url: href })
      })
      return
    }
    case 'divider': {
      const [red, green, blue] = cssColorToPdfRgb(element.styles.color ?? palette.divider, palette.divider)
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        pdf.setDrawColor(red, green, blue)
        pdf.setLineWidth(Math.max(0.5, pxToPdfPoints(1)))
        pdf.line(x, y + height / 2, x + width, y + height / 2)
      })
      return
    }
    case 'spacer':
      return
    case 'html': {
      try {
        const canvas = await renderPdfHtmlBlockCanvas(element, surfaceTheme, hooks)
        if (canvas !== null) {
          withPdfOpacity(pdf, GStateCtor, opacity, () => {
            pdf.addImage(canvas, x, y, width, height, undefined, 'FAST')
          })
          return
        }
      } catch {
        // Fall back to text-only approximation.
      }
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        drawPdfWrappedTextBlock(pdf, element, x, y, width, height, surfaceTheme, hooks)
      })
      return
    }
    case 'video': {
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        const [fillR, fillG, fillB] = cssColorToPdfRgb(surfaceTheme === 'dark' ? '#111a23' : '#091019', '#091019')
        pdf.setFillColor(fillR, fillG, fillB)
        const radius = Math.min(pxToPdfPoints(element.styles.borderRadius ?? getDefaultBorderRadius(element.type)), width / 2, height / 2)
        if (radius > 0) pdf.roundedRect(x, y, width, height, radius, radius, 'F')
        else pdf.rect(x, y, width, height, 'F')
        drawPdfCenteredLabel(pdf, 'Open video', x, y, width, height, {
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSizePx: 14,
          color: surfaceTheme === 'dark' ? '#eef5fb' : '#f2f6f9',
        })
        const href = hooks.getVideoHref(element)
        if (href !== null) pdf.link(x, y, width, height, { url: href })
      })
      return
    }
    case 'mascot': {
      const preset = (element.styles.mascotPreset ?? 'dragon') as MascotPreset
      const isCustom = preset === 'custom' && element.content.trim().length > 0
      if (isCustom) {
        try {
          const image = await loadImageElement(element.content)
          const borderRadius = element.styles.borderRadius ?? 0
          const raster = shouldRasterizeImageForPdf(element.content, borderRadius, opacity)
            ? rasterizeImageForPdf(image, element.width, element.height, borderRadius, opacity)
            : null
          withPdfOpacity(pdf, GStateCtor, raster === null ? opacity : 1, () => {
            pdf.addImage(raster ?? image, x, y, width, height, undefined, 'FAST')
          })
          return
        } catch {
          // fall through to placeholder
        }
      }
      const [fillR, fillG, fillB] = cssColorToPdfRgb('#f0f4f8', '#f0f4f8')
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        pdf.setFillColor(fillR, fillG, fillB)
        pdf.roundedRect(x, y, width, height, pxToPdfPoints(8), pxToPdfPoints(8), 'F')
        drawPdfCenteredLabel(pdf, `[${hooks.getMascotPresetLabel(preset)}]`, x, y, width, height, {
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSizePx: 12,
          color: '#607585',
        })
      })
      return
    }
    case 'animated-gif': {
      const src = hooks.getAnimatedGifSource(element)
      if (src !== null && src.length > 0) {
        try {
          const image = await loadImageElement(src)
          const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('image')
          const raster = shouldRasterizeImageForPdf(src, borderRadius, opacity)
            ? rasterizeImageForPdf(image, element.width, element.height, borderRadius, opacity)
            : null
          withPdfOpacity(pdf, GStateCtor, raster === null ? opacity : 1, () => {
            pdf.addImage(raster ?? image, x, y, width, height, undefined, 'FAST')
          })
          return
        } catch {
          // fall through to placeholder
        }
      }
      const [fillR, fillG, fillB] = cssColorToPdfRgb('#fce7f3', '#fce7f3')
      withPdfOpacity(pdf, GStateCtor, opacity, () => {
        pdf.setFillColor(fillR, fillG, fillB)
        pdf.rect(x, y, width, height, 'F')
        drawPdfCenteredLabel(pdf, '[Animated visual]', x, y, width, height, {
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSizePx: 12,
          color: '#831843',
        })
      })
      return
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      if (tableData === null) return
      const visitedCells = new Set<string>()

      for (let rowIndex = 0; rowIndex < tableData.rows; rowIndex++) {
        for (let colIndex = 0; colIndex < tableData.cols; colIndex++) {
          const key = cellKey(rowIndex, colIndex)
          if (visitedCells.has(key)) continue
          const cell = getCell(tableData, rowIndex, colIndex)
          if (cell === null) continue
          if (cell.row !== rowIndex || cell.col !== colIndex) {
            visitedCells.add(key)
            continue
          }
          for (let dr = 0; dr < cell.rowspan; dr++) {
            for (let dc = 0; dc < cell.colspan; dc++) {
              visitedCells.add(cellKey(rowIndex + dr, colIndex + dc))
            }
          }

          const content = hooks.getResolvedTableCellContent(cell, tableData)
          const renderState = hooks.getTableCellRenderState(element, tableData, cell, rowIndex, content)
          const { rect: cellRect, bg, borderTop, borderRight, borderBottom, borderLeft, projection } = renderState
          const cx = pxToPdfPoints(cellRect.x) + x
          const cy = pxToPdfPoints(cellRect.y) + y
          const cw = pxToPdfPoints(cellRect.width)
          const ch = pxToPdfPoints(cellRect.height)

          withPdfOpacity(pdf, GStateCtor, opacity, () => {
            if (bg.length > 0) {
              const [bgR, bgG, bgB] = cssColorToPdfRgb(bg, bg)
              pdf.setFillColor(bgR, bgG, bgB)
              pdf.rect(cx, cy, cw, ch, 'F')
            }

            const drawBorder = (edge: 'top' | 'right' | 'bottom' | 'left') => {
              const border = edge === 'top'
                ? borderTop
                : edge === 'right'
                  ? borderRight
                  : edge === 'bottom'
                    ? borderBottom
                    : borderLeft
              if (border.style === 'none' || border.width <= 0) return
              const [borderR, borderG, borderB] = cssColorToPdfRgb(border.color, '#c0c8d0')
              pdf.setDrawColor(borderR, borderG, borderB)
              pdf.setLineWidth(Math.max(0.25, pxToPdfPoints(border.width)))
              switch (edge) {
                case 'top':
                  pdf.line(cx, cy, cx + cw, cy)
                  break
                case 'bottom':
                  pdf.line(cx, cy + ch, cx + cw, cy + ch)
                  break
                case 'left':
                  pdf.line(cx, cy, cx, cy + ch)
                  break
                case 'right':
                  pdf.line(cx + cw, cy, cx + cw, cy + ch)
                  break
              }
            }

            drawBorder('top')
            drawBorder('right')
            drawBorder('bottom')
            drawBorder('left')

            if (projection.lines.length > 0) {
              const [textR, textG, textB] = cssColorToPdfRgb(projection.color, '#354a5a')
              applyPdfFont(pdf, hooks.getTableCellFontFamily(cell), cell.styles.fontStyle ?? 'normal', hooks.getTableCellFontWeight(cell), hooks.getTableCellFontSize(cell))
              pdf.setTextColor(textR, textG, textB)
              for (const line of projection.lines) {
                pdf.text(line.text, x + pxToPdfPoints(cellRect.x + line.x), y + pxToPdfPoints(cellRect.y + line.y), {
                  baseline: 'top',
                })
              }
            }
          })
        }
      }
      return
    }
    default:
      return
  }
}
