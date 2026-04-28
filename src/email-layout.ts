import type {
  CanvasElement,
  ElementType,
  ExportSnapshotBlockItem,
  ExportSnapshotPage,
  ExportSnapshotTextItem,
} from './schema.ts'

export type EmailLayoutEntry = {
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

export type EmailLayoutRow = {
  top: number
  bottom: number
  entries: EmailLayoutEntry[]
}

export function buildEmailLayoutRows(
  page: ExportSnapshotPage,
  options: {
    elementById?: ReadonlyMap<string, CanvasElement>
    pageHeight?: number
  } = {},
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
      continue
    }

    let entry = entryMap.get(item.elementId)
    if (entry === undefined) {
      const element = options.elementById?.get(item.elementId) ?? null
      const pageY = element !== null && options.pageHeight !== undefined
        ? element.y - page.pageIndex * options.pageHeight
        : item.y
      entry = {
        id: item.elementId,
        type: item.elementType,
        x: element?.x ?? item.x,
        y: pageY,
        width: element?.width ?? item.slotWidth,
        height: element?.height ?? item.lineHeight,
        blockItem: null,
        textLines: [],
        element,
      }
      entryMap.set(item.elementId, entry)
    }
    entry.textLines.push(item)
  }

  for (const entry of entryMap.values()) {
    if (entry.textLines.length === 0) continue
    const bounds = getEmailTextEntryBounds(entry.textLines)
    if (bounds === null) continue
    entry.x = bounds.x
    entry.y = bounds.y
    entry.width = bounds.width
    entry.height = bounds.height
  }

  const entries = Array.from(entryMap.values()).flatMap(entry =>
    entry.textLines.length > 0 ? splitEmailTextEntryIntoBands(entry) : [entry],
  )

  entries.sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: EmailLayoutRow[] = []

  for (const entry of entries) {
    const entryTop = entry.y
    const entryBottom = entry.y + entry.height
    const entryHeight = entryBottom - entryTop

    if (entry.type === 'heading') {
      rows.push({ top: entryTop, bottom: entryBottom, entries: [entry] })
      continue
    }

    let merged = false
    for (const row of rows) {
      if (row.entries.some(existing => existing.type === 'heading')) continue

      let fitsAll = true
      for (const existing of row.entries) {
        const overlapTop = Math.max(entryTop, existing.y)
        const overlapBottom = Math.min(entryBottom, existing.y + existing.height)
        const overlapAmount = overlapBottom - overlapTop
        if (overlapAmount <= 0) {
          fitsAll = false
          break
        }

        const boxOverlap = Math.min(entry.x + entry.width, existing.x + existing.width) - Math.max(entry.x, existing.x)
        if (boxOverlap > 8 && !isTextLike(entry.type) && !isTextLike(existing.type)) {
          fitsAll = false
          break
        }

        if (overlapAmount < Math.min(entryHeight, existing.height) * 0.2) {
          fitsAll = false
          break
        }

        if (boxOverlap > 12) {
          fitsAll = false
          break
        }
      }

      if (!fitsAll) continue
      row.entries.push(entry)
      row.top = Math.min(row.top, entryTop)
      row.bottom = Math.max(row.bottom, entryBottom)
      merged = true
      break
    }

    if (!merged) {
      rows.push({ top: entryTop, bottom: entryBottom, entries: [entry] })
    }
  }

  rows.sort((a, b) => a.top - b.top)
  return rows
}

export function getEmailTextEntryBounds(lines: ExportSnapshotTextItem[]): { x: number; y: number; width: number; height: number } | null {
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

export function splitEmailTextEntryIntoBands(entry: EmailLayoutEntry): EmailLayoutEntry[] {
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
      continue
    }

    bands.push(currentBand)
    currentBand = [line]
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

export function adjustOverlappingWidths(entries: EmailLayoutEntry[]): Array<{ entry: EmailLayoutEntry; effectiveX: number; effectiveWidth: number }> {
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
    return {
      entry,
      effectiveX: Math.round(effectiveX),
      effectiveWidth: Math.max(1, Math.round(effectiveWidth)),
    }
  })
}

export function isTextLike(type: ElementType): boolean {
  return type === 'text' || type === 'heading'
}
