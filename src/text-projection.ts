import {
  layout,
  layoutWithLines,
  layoutNextLine,
  measureNaturalWidth,
  prepare,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedText,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { carveTextLineSlots, type Interval } from './wrap-geometry.ts'
import { createElementDependency, type PreparedCacheEntry } from './cache-manager.ts'
import { asElementId, type CanvasElement, type TableData, type TextAlign, type TextProjection, type WrapMode } from './schema.ts'
import { isTextBlock } from './utils.ts'

type ProjectionBaseHooks = {
  preparedCache: PreparedCacheEntry
  wrapMode: WrapMode
  getOverlappingObstaclesForTextBox: (x: number, y: number, width: number, height: number, excludeElementId: string) => CanvasElement[]
  getMascotSilhouetteInterval: (textElement: CanvasElement, mascot: CanvasElement, bandTop: number, bandBottom: number, padding: number) => Interval | null
  getGifSilhouetteInterval: (textElement: CanvasElement, gif: CanvasElement, bandTop: number, bandBottom: number, padding: number) => Interval | null
}

type TextProjectionHooks = ProjectionBaseHooks & {
  resolveVariables: (text: string) => string
  getElementFontShorthand: (element: CanvasElement) => string
  getElementLineHeight: (element: CanvasElement) => number
  getElementTextColor: (element: CanvasElement) => string
}

type TableCellProjectionHooks = ProjectionBaseHooks & {
  getTableCellFontShorthand: (cell: TableData['cells'][number]) => string
  getTableCellLineHeight: (cell: TableData['cells'][number]) => number
  getTableCellTextColor: (cell: TableData['cells'][number]) => string
}

function cacheKey(text: string, font: string, whiteSpace: 'normal' | 'pre-wrap'): string {
  return `${font}\u0000${whiteSpace}\u0000${text}`
}

function getWordBreak(textStyle: { wordBreak?: 'normal' | 'keep-all' }): 'normal' | 'keep-all' {
  return textStyle.wordBreak === 'keep-all' ? 'keep-all' : 'normal'
}

export function clearPreparedCaches(preparedCache: PreparedCacheEntry): void {
  preparedCache.fast.clear()
  preparedCache.rich.clear()
}

export function getPrepared(
  text: string,
  font: string,
  whiteSpace: 'normal' | 'pre-wrap',
  wordBreak: 'normal' | 'keep-all',
  preparedCache: PreparedCacheEntry,
  ownerDependency?: string,
): PreparedText {
  const key = `${cacheKey(text, font, whiteSpace)}\u0000${wordBreak}`
  return preparedCache.fast.register(key, ownerDependency === undefined ? [] : [ownerDependency], () => prepare(text, font, { whiteSpace, wordBreak }))
}

export function getPreparedRich(
  text: string,
  font: string,
  whiteSpace: 'normal' | 'pre-wrap',
  wordBreak: 'normal' | 'keep-all',
  preparedCache: PreparedCacheEntry,
  ownerDependency?: string,
): PreparedTextWithSegments {
  const key = `${cacheKey(text, font, whiteSpace)}\u0000${wordBreak}`
  return preparedCache.rich.register(key, ownerDependency === undefined ? [] : [ownerDependency], () => prepareWithSegments(text, font, { whiteSpace, wordBreak }))
}

function isCursorComplete(prepared: PreparedTextWithSegments, cursor: LayoutCursor): boolean {
  return cursor.segmentIndex >= prepared.segments.length && cursor.graphemeIndex === 0
}

function getWidestSlot(slots: Interval[]): Interval {
  let widest = slots[0]!
  for (let index = 1; index < slots.length; index += 1) {
    const candidate = slots[index]!
    if ((candidate.right - candidate.left) > (widest.right - widest.left)) widest = candidate
  }
  return widest
}

function alignTextWithinSlot(slotLeft: number, slotWidth: number, lineWidth: number, alignment: TextAlign | undefined): number {
  if (alignment === 'center') return slotLeft + Math.max(0, (slotWidth - lineWidth) / 2)
  if (alignment === 'right') return slotLeft + Math.max(0, slotWidth - lineWidth)
  return slotLeft
}

function getRoundedInsetAtY(localY: number, height: number, radius: number): number {
  if (radius <= 0) return 0
  const clampedY = Math.max(0, Math.min(height, localY))
  if (clampedY < radius) {
    const dy = radius - clampedY
    return radius - Math.sqrt(Math.max(0, radius * radius - dy * dy))
  }
  const bottomStart = height - radius
  if (clampedY > bottomStart) {
    const dy = clampedY - bottomStart
    return radius - Math.sqrt(Math.max(0, radius * radius - dy * dy))
  }
  return 0
}

export function getRoundedObstacleInsetForBand(obstacle: CanvasElement, bandTop: number, bandBottom: number): number {
  const radius = Math.min(obstacle.styles.borderRadius ?? 0, obstacle.width / 2, obstacle.height / 2)
  if (radius <= 0) return 0
  const localTop = Math.max(0, bandTop - obstacle.y)
  const localBottom = Math.min(obstacle.height, bandBottom - obstacle.y)
  if (localBottom <= localTop) return 0
  let minInset = Number.POSITIVE_INFINITY
  const sampleCount = 5
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1)
    const sampleY = localTop + (localBottom - localTop) * t
    minInset = Math.min(minInset, getRoundedInsetAtY(sampleY, obstacle.height, radius))
  }
  return Number.isFinite(minInset) ? minInset : 0
}

export function getObstacleBandInterval(
  textElement: CanvasElement,
  obstacle: CanvasElement,
  bandTop: number,
  bandBottom: number,
  availableWidth: number,
  padding: number,
): Interval | null {
  const roundedInset = getRoundedObstacleInsetForBand(obstacle, bandTop, bandBottom)
  const left = Math.max(padding, obstacle.x - textElement.x + roundedInset)
  const right = Math.min(availableWidth + padding, obstacle.x + obstacle.width - textElement.x - roundedInset)
  if (left >= right) return null
  return { left, right }
}

function projectObstacleAwareText(
  prepared: PreparedTextWithSegments,
  textBox: CanvasElement,
  availableWidth: number,
  lineHeight: number,
  padding: number,
  alignment: TextAlign | undefined,
  hooks: ProjectionBaseHooks,
): { lines: TextProjection['lines']; truncated: boolean } {
  const lines: TextProjection['lines'] = []
  const obstacles = hooks.getOverlappingObstaclesForTextBox(textBox.x, textBox.y, textBox.width, textBox.height, textBox.id)
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = padding

  while (lineTop + lineHeight <= textBox.height - padding) {
    const bandTop = textBox.y + lineTop
    const bandBottom = bandTop + lineHeight
    const blocked: Interval[] = []
    let lowestBlockerBottom = lineTop + lineHeight

    for (const obstacle of obstacles) {
      if (obstacle.y + obstacle.height <= bandTop || obstacle.y >= bandBottom) continue
      if (obstacle.type === 'mascot') {
        const mascotInterval = hooks.getMascotSilhouetteInterval(textBox, obstacle, bandTop, bandBottom, padding)
        if (mascotInterval !== null) {
          blocked.push(mascotInterval)
          lowestBlockerBottom = Math.max(lowestBlockerBottom, obstacle.y + obstacle.height - textBox.y)
          continue
        }
      }
      if (obstacle.type === 'animated-gif') {
        const gifInterval = hooks.getGifSilhouetteInterval(textBox, obstacle, bandTop, bandBottom, padding)
        if (gifInterval !== null) {
          blocked.push(gifInterval)
          lowestBlockerBottom = Math.max(lowestBlockerBottom, obstacle.y + obstacle.height - textBox.y)
          continue
        }
      }
      const interval = getObstacleBandInterval(textBox, obstacle, bandTop, bandBottom, availableWidth, padding)
      if (interval === null) continue
      blocked.push(interval)
      lowestBlockerBottom = Math.max(lowestBlockerBottom, obstacle.y + obstacle.height - textBox.y)
    }

    const slots = carveTextLineSlots({ left: padding, right: availableWidth + padding }, blocked)
    if (slots.length === 0) {
      lineTop = hooks.wrapMode === 'strict' ? lowestBlockerBottom : lineTop + lineHeight
      continue
    }

    if (hooks.wrapMode === 'freedom') {
      let consumedAny = false
      const sortedSlots = slots.slice().sort((a, b) => (b.right - b.left) - (a.right - a.left))
      for (const slot of sortedSlots) {
        const slotWidth = slot.right - slot.left
        if (slotWidth < 30) continue
        const line = layoutNextLine(prepared, cursor, slotWidth)
        if (line === null) break
        lines.push({
          x: alignTextWithinSlot(slot.left, slotWidth, line.width, alignment),
          y: lineTop,
          text: line.text,
          width: line.width,
          slotWidth,
        })
        cursor = line.end
        consumedAny = true
      }
      if (!consumedAny) {
        lineTop += lineHeight
        continue
      }
      lineTop += lineHeight
      if (isCursorComplete(prepared, cursor)) break
      continue
    }

    const widestSlot = getWidestSlot(slots)
    const slotWidth = widestSlot.right - widestSlot.left
    if (hooks.wrapMode === 'strict' && slotWidth < 72) {
      lineTop = Math.max(lowestBlockerBottom, lineTop + lineHeight)
      continue
    }
    const line = layoutNextLine(prepared, cursor, slotWidth)
    if (line === null) break
    lines.push({
      x: alignTextWithinSlot(widestSlot.left, slotWidth, line.width, alignment),
      y: lineTop,
      text: line.text,
      width: line.width,
      slotWidth,
    })
    cursor = line.end
    lineTop += lineHeight
    if (isCursorComplete(prepared, cursor)) break
  }

  return { lines, truncated: !isCursorComplete(prepared, cursor) }
}

export function projectTextElement(element: CanvasElement, hooks: TextProjectionHooks): TextProjection {
  const resolved = hooks.resolveVariables(element.content)
  const font = hooks.getElementFontShorthand(element)
  const lineHeight = hooks.getElementLineHeight(element)
  const color = hooks.getElementTextColor(element)
  const textDecoration = element.styles.textDecoration ?? 'none'
  const padding = element.type === 'heading' ? 10 : 12
  const projection: TextProjection = {
    lines: [],
    font,
    lineHeight,
    color,
    textDecoration,
    truncated: false,
  }

  if (resolved.trim().length === 0) return projection

  const availableWidth = element.width - padding * 2
  const availableHeight = element.height - padding * 2
  if (availableWidth <= 12 || availableHeight <= 12) {
    projection.truncated = resolved.trim().length > 0
    return projection
  }

  const whiteSpace = /\n|\t| {2,}/.test(resolved) ? 'pre-wrap' : 'normal'
  const wordBreak = getWordBreak(element.styles)
  const elementDependency = createElementDependency(element.id)
  const obstacles = hooks.getOverlappingObstaclesForTextBox(element.x, element.y, element.width, element.height, element.id)
  if (obstacles.length === 0) {
    const prepared = getPreparedRich(resolved, font, whiteSpace, wordBreak, hooks.preparedCache, elementDependency)
    const layoutResult = layoutWithLines(prepared, availableWidth, lineHeight)
    const maxVisibleLines = Math.max(1, Math.floor(availableHeight / lineHeight))
    const visibleLines = layoutResult.lines.slice(0, maxVisibleLines)
    projection.lines = visibleLines.map((line, index) => ({
      x: alignTextWithinSlot(padding, availableWidth, line.width, element.styles.textAlign),
      y: padding + index * lineHeight,
      text: line.text,
      width: line.width,
      slotWidth: availableWidth,
    }))
    projection.truncated = visibleLines.length < layoutResult.lines.length
    return projection
  }

  const prepared = getPreparedRich(resolved, font, whiteSpace, wordBreak, hooks.preparedCache, elementDependency)
  const obstacleProjection = projectObstacleAwareText(prepared, element, availableWidth, lineHeight, padding, element.styles.textAlign, hooks)
  projection.lines = obstacleProjection.lines
  projection.truncated = obstacleProjection.truncated
  return projection
}

export function fitTextElementHeight(element: CanvasElement, hooks: TextProjectionHooks): number {
  const resolved = hooks.resolveVariables(element.content)
  if (resolved.trim().length === 0) return Math.max(element.height, 80)

  const padding = element.type === 'heading' ? 10 : 12
  const availableWidth = element.width - padding * 2
  const obstacles = hooks.getOverlappingObstaclesForTextBox(element.x, element.y, element.width, element.height, element.id)
  if (availableWidth > 12 && obstacles.length === 0) {
    const font = hooks.getElementFontShorthand(element)
    const whiteSpace = /\n|\t| {2,}/.test(resolved) ? 'pre-wrap' : 'normal'
    const prepared = getPrepared(resolved, font, whiteSpace, getWordBreak(element.styles), hooks.preparedCache, createElementDependency(element.id))
    const result = layout(prepared, availableWidth, hooks.getElementLineHeight(element))
    return Math.max(60, Math.ceil(result.height + padding * 2))
  }

  const projection = projectTextElement(element, hooks)
  if (projection.lines.length === 0) return Math.max(element.height, 80)
  const bottom = projection.lines[projection.lines.length - 1]!.y + projection.lineHeight + padding
  return Math.max(60, Math.ceil(bottom))
}

export function fitElementWidthToContent(
  element: CanvasElement,
  hooks: Pick<TextProjectionHooks, 'resolveVariables' | 'getElementFontShorthand'> & {
    preparedCache: PreparedCacheEntry
    getElementFontFamily: (element: CanvasElement) => string
    getElementFontSize: (element: CanvasElement) => number
    getElementFontWeight: (element: CanvasElement) => number
  },
): number {
  if (element.type === 'button') {
    const font = `${element.styles.fontStyle ?? 'normal'} ${hooks.getElementFontWeight(element)} ${Math.round(hooks.getElementFontSize(element) * 0.9)}px ${hooks.getElementFontFamily(element)}`
    const prepared = getPreparedRich(hooks.resolveVariables(element.content), font, 'normal', getWordBreak(element.styles), hooks.preparedCache, createElementDependency(element.id))
    return Math.max(120, Math.ceil(measureNaturalWidth(prepared) + 36))
  }

  if (isTextBlock(element.type)) {
    const font = hooks.getElementFontShorthand(element)
    const resolved = hooks.resolveVariables(element.content)
    const whiteSpace = /\n|\t| {2,}/.test(resolved) ? 'pre-wrap' : 'normal'
    const prepared = getPreparedRich(resolved, font, whiteSpace, getWordBreak(element.styles), hooks.preparedCache, createElementDependency(element.id))
    const padding = element.type === 'heading' ? 10 : 12
    return Math.max(120, Math.ceil(measureNaturalWidth(prepared) + padding * 2))
  }

  return element.width
}

export function getTableCellRenderState(
  element: CanvasElement,
  data: TableData,
  cell: TableData['cells'][number],
  rowIndex: number,
  content: string,
  hooks: TableCellProjectionHooks & {
    getCellRect: (data: TableData, cell: TableData['cells'][number], elementWidth: number) => { x: number; y: number; width: number; height: number }
    getEffectiveBorder: (cell: TableData['cells'][number], edge: 'top' | 'right' | 'bottom' | 'left', defaultBorder: TableData['defaultBorder']) => TableData['defaultBorder']
    getRenderedBorderWidth: (border: TableData['defaultBorder']) => number
  },
): {
  rect: ReturnType<typeof hooks.getCellRect>
  padding: number
  bg: string
  borderTop: TableData['defaultBorder']
  borderRight: TableData['defaultBorder']
  borderBottom: TableData['defaultBorder']
  borderLeft: TableData['defaultBorder']
  projection: TextProjection
} {
  const rect = hooks.getCellRect(data, cell, element.width)
  const borderTop = hooks.getEffectiveBorder(cell, 'top', data.defaultBorder)
  const borderRight = hooks.getEffectiveBorder(cell, 'right', data.defaultBorder)
  const borderBottom = hooks.getEffectiveBorder(cell, 'bottom', data.defaultBorder)
  const borderLeft = hooks.getEffectiveBorder(cell, 'left', data.defaultBorder)
  const padding = cell.styles.padding ?? 8
  const bg = cell.styles.background ?? ((element.styles.tableStriped ?? false) && rowIndex % 2 === 1 ? (element.styles.tableStripeColor ?? '#f5f7f9') : '')
  const innerX = element.x + rect.x + hooks.getRenderedBorderWidth(borderLeft)
  const innerY = element.y + rect.y + hooks.getRenderedBorderWidth(borderTop)
  const innerWidth = Math.max(0, rect.width - hooks.getRenderedBorderWidth(borderLeft) - hooks.getRenderedBorderWidth(borderRight))
  const innerHeight = Math.max(0, rect.height - hooks.getRenderedBorderWidth(borderTop) - hooks.getRenderedBorderWidth(borderBottom))

  return {
    rect,
    padding,
    bg,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
    projection: projectTableCellText(content, cell, innerX, innerY, innerWidth, innerHeight, padding, element.id, hooks),
  }
}

export function projectTableCellText(
  text: string,
  cell: TableData['cells'][number],
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
  padding: number,
  excludeElementId: string,
  hooks: TableCellProjectionHooks,
): TextProjection {
  const font = hooks.getTableCellFontShorthand(cell)
  const lineHeight = hooks.getTableCellLineHeight(cell)
  const projection: TextProjection = {
    lines: [],
    font,
    lineHeight,
    color: hooks.getTableCellTextColor(cell),
    textDecoration: 'none',
    truncated: false,
  }

  if (text.trim().length === 0) return projection

  const availableWidth = boxWidth - padding * 2
  const availableHeight = boxHeight - padding * 2
  if (availableWidth <= 12 || availableHeight < lineHeight) {
    projection.truncated = true
    return projection
  }

  const whiteSpace = /\n|\t| {2,}/.test(text) ? 'pre-wrap' : 'normal'
  const prepared = getPreparedRich(text, font, whiteSpace, 'normal', hooks.preparedCache, createElementDependency(excludeElementId))
  const obstacles = hooks.getOverlappingObstaclesForTextBox(boxX, boxY, boxWidth, boxHeight, excludeElementId)

  if (obstacles.length > 0) {
    const textBox: CanvasElement = {
      id: asElementId(excludeElementId),
      type: 'text',
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      content: '',
      styles: {},
    }
    const obstacleProjection = projectObstacleAwareText(prepared, textBox, availableWidth, lineHeight, padding, cell.styles.hAlign, hooks)
    projection.lines = obstacleProjection.lines
    projection.truncated = obstacleProjection.truncated
    return projection
  }

  const layoutResult = layoutWithLines(prepared, availableWidth, lineHeight)
  const maxVisibleLines = Math.max(1, Math.floor(availableHeight / lineHeight))
  const verticalAlign = cell.styles.vAlign ?? 'top'
  let startIndex = 0
  if (layoutResult.lines.length > maxVisibleLines) {
    if (verticalAlign === 'bottom') startIndex = layoutResult.lines.length - maxVisibleLines
    else if (verticalAlign === 'middle') startIndex = Math.floor((layoutResult.lines.length - maxVisibleLines) / 2)
  }
  const visibleLines = layoutResult.lines.slice(startIndex, startIndex + maxVisibleLines)
  const usedHeight = visibleLines.length * lineHeight
  let startY = padding
  if (verticalAlign === 'middle') startY = padding + Math.max(0, (availableHeight - usedHeight) / 2)
  else if (verticalAlign === 'bottom') startY = padding + Math.max(0, availableHeight - usedHeight)

  projection.lines = visibleLines.map((line, index) => ({
    x: alignTextWithinSlot(padding, availableWidth, line.width, cell.styles.hAlign),
    y: startY + index * lineHeight,
    text: line.text,
    width: line.width,
    slotWidth: availableWidth,
  }))
  projection.truncated = visibleLines.length < layoutResult.lines.length
  return projection
}
