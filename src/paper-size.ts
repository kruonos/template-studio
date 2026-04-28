import type {
  PaperSize,
  StoredDocument,
} from './schema.ts'
import { clamp, cloneData } from './utils.ts'

type PositionedElement = {
  x: number
  y: number
  width: number
  height: number
}

export function remapElementsToPaperSize<T extends PositionedElement>(elements: T[], source: PaperSize, target: PaperSize): void {
  if (source.width === target.width && source.height === target.height && source.margin === target.margin) return

  for (const element of elements) {
    const oldPageIndex = Math.max(0, Math.floor(element.y / source.height))
    const pageOffsetY = element.y - oldPageIndex * source.height
    const maxOffsetY = Math.max(0, target.height - element.height - target.margin)
    element.y = oldPageIndex * target.height + clamp(pageOffsetY, 0, maxOffsetY)

    const wasFullWidth = Math.abs(element.x - source.margin) <= 2 && Math.abs(element.width - (source.width - source.margin * 2)) <= 4
    if (wasFullWidth) {
      element.x = target.margin
      element.width = Math.max(36, target.width - target.margin * 2)
    }

    if (element.x + element.width > target.width) {
      if (element.width > target.width) {
        element.width = Math.max(36, target.width - target.margin * 2)
      }
      element.x = clamp(element.x, 0, Math.max(0, target.width - element.width))
    }
  }
}

export function remapDocumentToPaperSize(document: StoredDocument, source: PaperSize, target: PaperSize): StoredDocument {
  const next: StoredDocument = {
    ...document,
    elements: cloneData(document.elements),
    variables: cloneData(document.variables),
    paperSize: { ...target },
  }
  remapElementsToPaperSize(next.elements, source, target)
  return next
}
