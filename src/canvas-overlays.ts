import { SMART_GUIDE_THRESHOLD, type CanvasElement, type ElementType, type MarqueeState } from './schema.ts'
import { clamp } from './utils.ts'

export type SmartGuideLine = { axis: 'h' | 'v'; position: number }
export type SmartGuideResult = { lines: SmartGuideLine[]; snapX: number | null; snapY: number | null }

type CanvasPointOptions = {
  canvasViewport: HTMLDivElement
  canvasScale: number
  canvasWidth: number
  canvasHeight: number
}

type SmartGuideOptions = {
  showGrid: boolean
  elements: CanvasElement[]
  selectedIds: ReadonlySet<string>
  canvasWidth: number
  pageHeight: number
  pageMargin: number
}

type DropIndicatorOptions = {
  dropIndicator: HTMLDivElement
  paletteDragType: ElementType | null
  maybeCanvasPoint: (event: MouseEvent) => { x: number; y: number } | null
  createElement: (type: ElementType, x: number, y: number) => CanvasElement
}

export function renderGridOverlay(canvasSurface: HTMLDivElement, showGrid: boolean): void {
  let grid = document.getElementById('grid-overlay')
  if (!showGrid) {
    if (grid !== null) grid.remove()
    return
  }
  if (grid === null) {
    grid = document.createElement('div')
    grid.id = 'grid-overlay'
    canvasSurface.prepend(grid)
  }
  grid.style.position = 'absolute'
  grid.style.inset = '0'
  grid.style.pointerEvents = 'none'
  grid.style.zIndex = '5'
  grid.style.backgroundImage =
    'linear-gradient(to right, rgba(200,200,200,0.18) 1px, transparent 1px),' +
    'linear-gradient(to bottom, rgba(200,200,200,0.18) 1px, transparent 1px)'
  grid.style.backgroundSize = '20px 20px'
}

export function computeSmartGuides(
  dragged: CanvasElement,
  candidateX: number,
  candidateY: number,
  options: SmartGuideOptions,
): SmartGuideResult {
  if (options.showGrid) return { lines: [], snapX: null, snapY: null }

  const others = options.elements.filter(element => element.id !== dragged.id && !options.selectedIds.has(element.id))
  const lines: SmartGuideLine[] = []
  let snapX: number | null = null
  let snapY: number | null = null
  const centerX = candidateX + dragged.width / 2
  const centerY = candidateY + dragged.height / 2
  const right = candidateX + dragged.width
  const bottom = candidateY + dragged.height

  const referenceEdges: Array<{ left: number; right: number; top: number; bottom: number; centerX: number; centerY: number }> = [
    {
      left: options.pageMargin,
      right: options.canvasWidth - options.pageMargin,
      top: options.pageMargin,
      bottom: options.pageHeight - options.pageMargin,
      centerX: options.canvasWidth / 2,
      centerY: options.pageHeight / 2,
    },
  ]

  for (const other of others) {
    referenceEdges.push({
      left: other.x,
      right: other.x + other.width,
      top: other.y,
      bottom: other.y + other.height,
      centerX: other.x + other.width / 2,
      centerY: other.y + other.height / 2,
    })
  }

  for (const reference of referenceEdges) {
    if (snapY === null && Math.abs(candidateY - reference.top) < SMART_GUIDE_THRESHOLD) {
      snapY = reference.top
      lines.push({ axis: 'h', position: reference.top })
    }
    if (snapY === null && Math.abs(bottom - reference.bottom) < SMART_GUIDE_THRESHOLD) {
      snapY = reference.bottom - dragged.height
      lines.push({ axis: 'h', position: reference.bottom })
    }
    if (snapY === null && Math.abs(centerY - reference.centerY) < SMART_GUIDE_THRESHOLD) {
      snapY = reference.centerY - dragged.height / 2
      lines.push({ axis: 'h', position: reference.centerY })
    }
    if (snapY === null && Math.abs(candidateY - reference.bottom) < SMART_GUIDE_THRESHOLD) {
      snapY = reference.bottom
      lines.push({ axis: 'h', position: reference.bottom })
    }
    if (snapY === null && Math.abs(bottom - reference.top) < SMART_GUIDE_THRESHOLD) {
      snapY = reference.top - dragged.height
      lines.push({ axis: 'h', position: reference.top })
    }
    if (snapX === null && Math.abs(candidateX - reference.left) < SMART_GUIDE_THRESHOLD) {
      snapX = reference.left
      lines.push({ axis: 'v', position: reference.left })
    }
    if (snapX === null && Math.abs(right - reference.right) < SMART_GUIDE_THRESHOLD) {
      snapX = reference.right - dragged.width
      lines.push({ axis: 'v', position: reference.right })
    }
    if (snapX === null && Math.abs(centerX - reference.centerX) < SMART_GUIDE_THRESHOLD) {
      snapX = reference.centerX - dragged.width / 2
      lines.push({ axis: 'v', position: reference.centerX })
    }
    if (snapX === null && Math.abs(candidateX - reference.right) < SMART_GUIDE_THRESHOLD) {
      snapX = reference.right
      lines.push({ axis: 'v', position: reference.right })
    }
    if (snapX === null && Math.abs(right - reference.left) < SMART_GUIDE_THRESHOLD) {
      snapX = reference.left - dragged.width
      lines.push({ axis: 'v', position: reference.left })
    }
  }

  return { lines, snapX, snapY }
}

export function renderSmartGuides(layer: HTMLDivElement, lines: SmartGuideLine[]): void {
  layer.replaceChildren()
  for (const line of lines) {
    const guide = document.createElement('div')
    guide.className = `smart-guide smart-guide--${line.axis}`
    if (line.axis === 'h') {
      guide.style.top = `${line.position}px`
    } else {
      guide.style.left = `${line.position}px`
    }
    layer.append(guide)
  }
}

export function clearSmartGuides(layer: HTMLDivElement): void {
  layer.replaceChildren()
}

export function updateMarqueeSelection(elements: CanvasElement[], marqueeState: MarqueeState): {
  selectedIds: Set<string>
  selectedId: string | null
} {
  const x1 = Math.min(marqueeState.startX, marqueeState.currentX)
  const y1 = Math.min(marqueeState.startY, marqueeState.currentY)
  const x2 = Math.max(marqueeState.startX, marqueeState.currentX)
  const y2 = Math.max(marqueeState.startY, marqueeState.currentY)
  const selectedIds = new Set<string>()

  for (const element of elements) {
    if (element.x + element.width >= x1 && element.x <= x2 && element.y + element.height >= y1 && element.y <= y2) {
      selectedIds.add(element.id)
    }
  }

  return {
    selectedIds,
    selectedId: selectedIds.size > 0 ? [...selectedIds][0]! : null,
  }
}

export function renderMarquee(
  canvasSurface: HTMLDivElement,
  marqueeState: MarqueeState | null,
  marqueeNode: HTMLDivElement | null,
): HTMLDivElement | null {
  if (marqueeState === null) return marqueeNode
  let nextNode = marqueeNode
  if (nextNode === null) {
    nextNode = document.createElement('div')
    nextNode.className = 'selection-marquee'
    canvasSurface.append(nextNode)
  }
  const x = Math.min(marqueeState.startX, marqueeState.currentX)
  const y = Math.min(marqueeState.startY, marqueeState.currentY)
  const width = Math.abs(marqueeState.currentX - marqueeState.startX)
  const height = Math.abs(marqueeState.currentY - marqueeState.startY)
  nextNode.style.left = `${x}px`
  nextNode.style.top = `${y}px`
  nextNode.style.width = `${width}px`
  nextNode.style.height = `${height}px`
  return nextNode
}

export function clearMarqueeNode(marqueeNode: HTMLDivElement | null): HTMLDivElement | null {
  if (marqueeNode !== null) marqueeNode.remove()
  return null
}

export function showMeasurement(
  canvasSurface: HTMLDivElement,
  measurementNode: HTMLDivElement | null,
  element: CanvasElement,
): HTMLDivElement {
  let nextNode = measurementNode
  if (nextNode === null) {
    nextNode = document.createElement('div')
    nextNode.className = 'measurement-tooltip'
    canvasSurface.append(nextNode)
  }
  nextNode.textContent = `${Math.round(element.width)} × ${Math.round(element.height)}  ·  ${Math.round(element.x)}, ${Math.round(element.y)}`
  nextNode.style.left = `${Math.round(element.x)}px`
  nextNode.style.top = `${Math.max(0, Math.round(element.y) - 22)}px`
  return nextNode
}

export function hideMeasurement(measurementNode: HTMLDivElement | null): HTMLDivElement | null {
  if (measurementNode !== null) measurementNode.remove()
  return null
}

export function getCanvasPoint(event: MouseEvent, options: CanvasPointOptions): { x: number; y: number } {
  const rect = options.canvasViewport.getBoundingClientRect()
  return {
    x: clamp((event.clientX - rect.left) / options.canvasScale, 0, options.canvasWidth),
    y: clamp((event.clientY - rect.top) / options.canvasScale, 0, options.canvasHeight),
  }
}

export function maybeCanvasPoint(event: MouseEvent, options: CanvasPointOptions): { x: number; y: number } | null {
  const rect = options.canvasViewport.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null
  return getCanvasPoint(event, options)
}

export function updateDropIndicator(event: MouseEvent, options: DropIndicatorOptions): void {
  const point = options.maybeCanvasPoint(event)
  if (options.paletteDragType === null || point === null) {
    options.dropIndicator.style.display = 'none'
    return
  }
  const preview = options.createElement(options.paletteDragType, point.x - 80, point.y - 24)
  options.dropIndicator.style.display = 'block'
  options.dropIndicator.style.left = `${preview.x}px`
  options.dropIndicator.style.top = `${preview.y}px`
  options.dropIndicator.style.width = `${preview.width}px`
  options.dropIndicator.style.height = `${Math.min(preview.height, 140)}px`
}
