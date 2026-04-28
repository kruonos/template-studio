import type {
  CanvasElement,
  DragState,
  ElementType,
  InlineEditorState,
  MarqueeState,
  ResizeState,
  StudioState,
} from './schema.ts'
import { computeTableHeight, parseTableData, resizeColumn, resizeRow, serializeTableData } from './table-engine.ts'
import { capitalize, clamp, isInlineEditableType, isResizeHandle } from './utils.ts'

type Point = { x: number; y: number }

type PathTraceStateLike = {
  rawPoints: Point[]
  drawing: boolean
}

type SmartGuideLine = { axis: 'h' | 'v'; position: number }
type SmartGuideResult = { lines: SmartGuideLine[]; snapX: number | null; snapY: number | null }
type TableColResizeState = { elementId: string; colIndex: number; startX: number }
type TableRowResizeState = { elementId: string; rowIndex: number; startY: number }
type PendingTableClickState = { elementId: string; localX: number; localY: number; shiftKey: boolean }

type CanvasInteractionHooks = {
  state: StudioState
  getPathTraceMode: () => boolean
  getPathTraceState: () => PathTraceStateLike | null
  setPathTraceDrawing: (drawing: boolean) => void
  appendPathTracePoint: (point: Point) => void
  renderPathOverlay: () => void
  commitPathTrace: () => void
  closeContextMenu: () => void
  getInlineEditorState: () => InlineEditorState | null
  setInlineEditorState: (state: InlineEditorState | null) => void
  getPaletteDragType: () => ElementType | null
  setPaletteDragType: (type: ElementType | null) => void
  updateDropIndicator: (event: MouseEvent) => void
  getDragState: () => DragState | null
  setDragState: (state: DragState | null) => void
  getResizeState: () => ResizeState | null
  setResizeState: (state: ResizeState | null) => void
  getMarqueeState: () => MarqueeState | null
  setMarqueeState: (state: MarqueeState | null) => void
  clearMarqueeNode: () => void
  updateMarqueeSelection: () => void
  renderMarquee: () => void
  getTableColResize: () => TableColResizeState | null
  setTableColResize: (state: TableColResizeState | null) => void
  getTableRowResize: () => TableRowResizeState | null
  setTableRowResize: (state: TableRowResizeState | null) => void
  getTablePendingClick: () => PendingTableClickState | null
  setTablePendingClick: (state: PendingTableClickState | null) => void
  getTableSelectionElementId: () => string | null
  clearTableInteractionState: () => void
  handleTableCellClick: (element: CanvasElement, localX: number, localY: number, shiftKey: boolean) => void
  handleTableDoubleClick: (element: CanvasElement, localX: number, localY: number) => void
  getCanvasPoint: (event: MouseEvent) => Point
  maybeCanvasPoint: (event: MouseEvent) => Point | null
  getElementById: (id: string) => CanvasElement | null
  recordState: () => void
  maybeExtendPages: (requiredBottom: number) => void
  showMeasurement: (element: CanvasElement) => void
  hideMeasurement: () => void
  computeSmartGuides: (dragged: CanvasElement, candidateX: number, candidateY: number) => SmartGuideResult
  renderSmartGuides: (lines: SmartGuideLine[]) => void
  clearSmartGuides: () => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionCache: () => void
  resetMascotBasePositions: () => void
  resetGifBasePositions: () => void
  syncMascotAnimation: () => void
  syncGifAnimation: () => void
  scheduleRender: () => void
  createElement: (type: ElementType, x: number, y: number) => CanvasElement
  showToast: (message: string) => void
  discardLastHistoryEntry: () => void
  canvasWidth: () => number
}

export function handlePointerMove(event: MouseEvent, hooks: CanvasInteractionHooks): void {
  const pathTraceState = hooks.getPathTraceState()
  if (hooks.getPathTraceMode() && pathTraceState !== null && pathTraceState.drawing) {
    hooks.appendPathTracePoint(hooks.getCanvasPoint(event))
    hooks.renderPathOverlay()
    return
  }

  const marqueeState = hooks.getMarqueeState()
  if (marqueeState !== null) {
    const point = hooks.getCanvasPoint(event)
    marqueeState.currentX = point.x
    marqueeState.currentY = point.y
    hooks.updateMarqueeSelection()
    hooks.renderMarquee()
    return
  }

  if (hooks.getPaletteDragType() !== null) {
    hooks.updateDropIndicator(event)
    return
  }

  const dragState = hooks.getDragState()
  if (dragState !== null) {
    hooks.setTablePendingClick(null)
    const element = hooks.getElementById(dragState.id)
    if (element === null) return
    const point = hooks.getCanvasPoint(event)
    let nextDragX = point.x - dragState.offsetX
    let nextDragY = point.y - dragState.offsetY

    if (event.shiftKey) {
      const dx = Math.abs(point.x - dragState.offsetX - element.x)
      const dy = Math.abs(point.y - dragState.offsetY - element.y)
      if (dx > dy) {
        nextDragY = element.y
      } else {
        nextDragX = element.x
      }
    }

    if (hooks.state.showGrid) {
      nextDragX = Math.round(nextDragX / 20) * 20
      nextDragY = Math.round(nextDragY / 20) * 20
    }

    const guides = hooks.computeSmartGuides(element, nextDragX, nextDragY)
    if (guides.snapX !== null) nextDragX = guides.snapX
    if (guides.snapY !== null) nextDragY = guides.snapY
    hooks.renderSmartGuides(guides.lines)

    const oldX = element.x
    const oldY = element.y
    element.x = clamp(nextDragX, 0, Math.max(0, hooks.canvasWidth() - element.width))
    element.y = clamp(nextDragY, 0, Math.max(0, hooks.state.canvasHeight - element.height))
    const deltaX = element.x - oldX
    const deltaY = element.y - oldY

    for (const id of hooks.state.selectedIds) {
      if (id === dragState.id) continue
      const other = hooks.getElementById(id)
      if (other === null || other.locked) continue
      other.x = clamp(other.x + deltaX, 0, Math.max(0, hooks.canvasWidth() - other.width))
      other.y = clamp(other.y + deltaY, 0, Math.max(0, hooks.state.canvasHeight - other.height))
      hooks.maybeExtendPages(other.y + other.height)
    }

    hooks.maybeExtendPages(element.y + element.height)
    hooks.showMeasurement(element)
    hooks.markDirty(false)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
    return
  }

  const resizeState = hooks.getResizeState()
  if (resizeState !== null) {
    const element = hooks.getElementById(resizeState.id)
    if (element === null) return
    const point = hooks.getCanvasPoint(event)
    const deltaX = point.x - resizeState.startX
    const deltaY = point.y - resizeState.startY
    let nextX = resizeState.startRect.x
    let nextY = resizeState.startRect.y
    let nextWidth = resizeState.startRect.width
    let nextHeight = resizeState.startRect.height

    if (resizeState.handle.includes('e')) nextWidth = Math.max(36, resizeState.startRect.width + deltaX)
    if (resizeState.handle.includes('s')) nextHeight = Math.max(12, resizeState.startRect.height + deltaY)
    if (resizeState.handle.includes('w')) {
      nextWidth = Math.max(36, resizeState.startRect.width - deltaX)
      nextX = resizeState.startRect.x + resizeState.startRect.width - nextWidth
    }
    if (resizeState.handle.includes('n')) {
      nextHeight = Math.max(12, resizeState.startRect.height - deltaY)
      nextY = resizeState.startRect.y + resizeState.startRect.height - nextHeight
    }

    if (event.shiftKey) {
      const aspect = resizeState.startRect.height / resizeState.startRect.width
      if (resizeState.handle === 'e' || resizeState.handle === 'w') {
        nextHeight = Math.max(12, Math.round(nextWidth * aspect))
      } else if (resizeState.handle === 'n' || resizeState.handle === 's') {
        nextWidth = Math.max(36, Math.round(nextHeight / aspect))
      } else {
        nextHeight = Math.max(12, Math.round(nextWidth * aspect))
      }
    }

    if (hooks.state.showGrid) {
      nextX = Math.round(nextX / 20) * 20
      nextY = Math.round(nextY / 20) * 20
      nextWidth = Math.max(20, Math.round(nextWidth / 20) * 20)
      nextHeight = Math.max(20, Math.round(nextHeight / 20) * 20)
    }

    element.x = clamp(nextX, 0, Math.max(0, hooks.canvasWidth() - nextWidth))
    element.y = clamp(nextY, 0, Math.max(0, hooks.state.canvasHeight - nextHeight))
    element.width = Math.min(hooks.canvasWidth() - element.x, nextWidth)
    element.height = nextHeight
    hooks.maybeExtendPages(element.y + element.height)
    hooks.showMeasurement(element)
    hooks.markDirty(false)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
    return
  }

  const tableColResize = hooks.getTableColResize()
  if (tableColResize !== null) {
    const element = hooks.getElementById(tableColResize.elementId)
    if (element === null || element.type !== 'table') return
    const point = hooks.getCanvasPoint(event)
    const deltaX = point.x - tableColResize.startX
    const data = parseTableData(element.content)
    if (data === null) return
    resizeColumn(data, tableColResize.colIndex, deltaX, element.width)
    tableColResize.startX = point.x
    element.content = serializeTableData(data)
    hooks.markDirty(false)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
    return
  }

  const tableRowResize = hooks.getTableRowResize()
  if (tableRowResize !== null) {
    const element = hooks.getElementById(tableRowResize.elementId)
    if (element === null || element.type !== 'table') return
    const point = hooks.getCanvasPoint(event)
    const deltaY = point.y - tableRowResize.startY
    const data = parseTableData(element.content)
    if (data === null) return
    const targetRow = tableRowResize.rowIndex - 1
    const currentHeight = data.rowHeights[targetRow] ?? 32
    resizeRow(data, targetRow, currentHeight + deltaY)
    tableRowResize.startY = point.y
    element.content = serializeTableData(data)
    element.height = computeTableHeight(data)
    hooks.markDirty(false)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
  }
}

export function handlePointerUp(event: MouseEvent, hooks: CanvasInteractionHooks): void {
  const pathTraceState = hooks.getPathTraceState()
  if (hooks.getPathTraceMode() && pathTraceState !== null && pathTraceState.drawing) {
    hooks.setPathTraceDrawing(false)
    if (pathTraceState.rawPoints.length >= 2) {
      hooks.commitPathTrace()
    }
    return
  }

  if (hooks.getMarqueeState() !== null) {
    hooks.setMarqueeState(null)
    hooks.clearMarqueeNode()
    hooks.scheduleRender()
    return
  }

  const paletteDragType = hooks.getPaletteDragType()
  if (paletteDragType !== null) {
    const point = hooks.maybeCanvasPoint(event)
    if (point !== null) {
      hooks.recordState()
      const element = hooks.createElement(paletteDragType, point.x - 80, point.y - 24)
      hooks.state.elements.push(element)
      hooks.state.selectedId = element.id
      hooks.state.selectedIds = new Set([element.id])
      hooks.maybeExtendPages(element.y + element.height)
      hooks.markDirty()
      hooks.syncMascotAnimation()
      hooks.syncGifAnimation()
      hooks.scheduleRender()
      hooks.showToast(`${capitalize(paletteDragType)} added`)
    }
    hooks.setPaletteDragType(null)
    hooks.updateDropIndicator(event)
    return
  }

  if (hooks.getDragState() !== null) {
    const pendingClick = hooks.getTablePendingClick()
    if (pendingClick !== null) {
      hooks.setTablePendingClick(null)
      const element = hooks.getElementById(pendingClick.elementId)
      if (element !== null && element.type === 'table') {
        hooks.handleTableCellClick(element, pendingClick.localX, pendingClick.localY, pendingClick.shiftKey)
      }
      hooks.discardLastHistoryEntry()
    }
    hooks.resetMascotBasePositions()
    hooks.resetGifBasePositions()
    hooks.setDragState(null)
    hooks.clearSmartGuides()
    hooks.hideMeasurement()
    hooks.scheduleRender()
  }

  if (hooks.getResizeState() !== null) {
    hooks.resetMascotBasePositions()
    hooks.resetGifBasePositions()
    hooks.setResizeState(null)
    hooks.hideMeasurement()
    hooks.scheduleRender()
  }

  if (hooks.getTableColResize() !== null) {
    hooks.setTableColResize(null)
    hooks.scheduleRender()
  }

  if (hooks.getTableRowResize() !== null) {
    hooks.setTableRowResize(null)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
  }
}

export function handleCanvasPointerDown(event: MouseEvent, hooks: CanvasInteractionHooks): void {
  if (event.button !== 0) return
  hooks.closeContextMenu()

  if (hooks.getPathTraceMode() && hooks.getPathTraceState() !== null) {
    const point = hooks.getCanvasPoint(event)
    hooks.appendPathTracePoint(point)
    hooks.setPathTraceDrawing(true)
    hooks.renderPathOverlay()
    event.preventDefault()
    return
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.inline-editor') !== null) return

  const resizeHandle = target.closest<HTMLElement>('.resize-handle')
  if (resizeHandle !== null) {
    const elementNode = resizeHandle.closest<HTMLElement>('.canvas-element')
    const elementId = elementNode?.dataset['elementId']
    const handleValue = resizeHandle.dataset['handle']
    if (elementId === undefined || !isResizeHandle(handleValue)) return
    const element = hooks.getElementById(elementId)
    if (element === null || element.locked) return
    hooks.recordState()
    const point = hooks.getCanvasPoint(event)
    hooks.setResizeState({
      id: element.id,
      handle: handleValue,
      startX: point.x,
      startY: point.y,
      startRect: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
    })
    hooks.state.selectedId = element.id
    if (!hooks.state.selectedIds.has(element.id)) {
      hooks.state.selectedIds = new Set([element.id])
    }
    hooks.scheduleRender()
    event.preventDefault()
    return
  }

  const colResizeHandle = target.closest<HTMLElement>('.table-col-resize-handle')
  if (colResizeHandle !== null) {
    const elementNode = colResizeHandle.closest<HTMLElement>('.canvas-element')
    const elementId = elementNode?.dataset['elementId']
    if (elementId !== undefined) {
      const element = hooks.getElementById(elementId)
      if (element !== null && element.type === 'table') {
        const colIndex = Number.parseInt(colResizeHandle.dataset['tableColResize'] ?? '-1', 10)
        if (colIndex >= 0) {
          hooks.setTableColResize({ elementId: element.id, colIndex, startX: hooks.getCanvasPoint(event).x })
          event.preventDefault()
          return
        }
      }
    }
  }

  const rowResizeHandle = target.closest<HTMLElement>('.table-row-resize-handle')
  if (rowResizeHandle !== null) {
    const elementNode = rowResizeHandle.closest<HTMLElement>('.canvas-element')
    const elementId = elementNode?.dataset['elementId']
    if (elementId !== undefined) {
      const element = hooks.getElementById(elementId)
      if (element !== null && element.type === 'table') {
        const rowIndex = Number.parseInt(rowResizeHandle.dataset['tableRowResize'] ?? '-1', 10)
        if (rowIndex >= 0) {
          hooks.setTableRowResize({ elementId: element.id, rowIndex, startY: hooks.getCanvasPoint(event).y })
          event.preventDefault()
          return
        }
      }
    }
  }

  const elementNode = target.closest<HTMLElement>('.canvas-element')
  if (elementNode !== null) {
    const elementId = elementNode.dataset['elementId']
    if (elementId === undefined) return
    const element = hooks.getElementById(elementId)
    if (element === null) return

    if (element.type === 'table') {
      if (hooks.getTableSelectionElementId() !== null && hooks.getTableSelectionElementId() !== element.id) {
        hooks.clearTableInteractionState()
      }

      const wasAlreadySelected = hooks.state.selectedId === element.id
      hooks.state.selectedId = element.id
      if (!hooks.state.selectedIds.has(element.id)) {
        hooks.state.selectedIds = new Set([element.id])
      }

      if (!element.locked) {
        const point = hooks.getCanvasPoint(event)
        hooks.recordState()
        hooks.setDragState({
          id: element.id,
          offsetX: point.x - element.x,
          offsetY: point.y - element.y,
        })

        if (wasAlreadySelected) {
          hooks.setTablePendingClick({
            elementId: element.id,
            localX: point.x - element.x,
            localY: point.y - element.y,
            shiftKey: event.shiftKey,
          })
        }
      }
      hooks.scheduleRender()
      event.preventDefault()
      return
    }

    hooks.clearTableInteractionState()

    if (event.shiftKey) {
      if (hooks.state.selectedIds.has(element.id)) {
        hooks.state.selectedIds.delete(element.id)
        if (hooks.state.selectedId === element.id) {
          hooks.state.selectedId = hooks.state.selectedIds.size > 0 ? [...hooks.state.selectedIds][0]! : null
        }
      } else {
        hooks.state.selectedIds.add(element.id)
        hooks.state.selectedId = element.id
      }
      hooks.scheduleRender()
      event.preventDefault()
      return
    }

    hooks.state.selectedId = element.id
    if (!hooks.state.selectedIds.has(element.id)) {
      hooks.state.selectedIds = new Set([element.id])
    }
    if (element.locked) {
      hooks.scheduleRender()
      event.preventDefault()
      return
    }
    const point = hooks.getCanvasPoint(event)
    hooks.recordState()
    hooks.setDragState({
      id: element.id,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    })
    hooks.scheduleRender()
    event.preventDefault()
    return
  }

  if (!event.shiftKey) {
    hooks.state.selectedId = null
    hooks.state.selectedIds = new Set()
  }
  hooks.setInlineEditorState(null)
  hooks.clearTableInteractionState()
  const point = hooks.getCanvasPoint(event)
  hooks.setMarqueeState({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
  hooks.scheduleRender()
}

export function handleCanvasDoubleClick(event: MouseEvent, hooks: CanvasInteractionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const elementNode = target.closest<HTMLElement>('.canvas-element')
  if (elementNode === null) return
  const elementId = elementNode.dataset['elementId']
  if (elementId === undefined) return
  const element = hooks.getElementById(elementId)
  if (element === null) return

  if (element.type === 'table') {
    hooks.setDragState(null)
    const point = hooks.getCanvasPoint(event)
    hooks.handleTableDoubleClick(element, point.x - element.x, point.y - element.y)
    return
  }

  if (!isInlineEditableType(element.type)) return
  hooks.setInlineEditorState({ elementId: element.id, draft: element.content })
  hooks.state.selectedId = element.id
  hooks.scheduleRender()
}
