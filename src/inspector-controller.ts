import type {
  AnimatedGifBehavior,
  CanvasElement,
  InlineEditorState,
  MascotBehavior,
  MascotPreset,
  StudioState,
} from './schema.ts'
import type { TableCellSelectionState } from './table-ui.ts'
import { getCell, getSelectionRange } from './table-engine.ts'
import { clamp, isInlineEditableType, isTextBlock, parseNumber } from './utils.ts'

type InspectorControllerHooks = {
  state: StudioState
  getSelectedElement: () => CanvasElement | null
  maybeRecordHistoryFor: (target: EventTarget) => void
  canvasWidth: () => number
  getTableSelection: () => TableCellSelectionState | null
  getTableData: (element: CanvasElement) => import('./schema.ts').TableData | null
  serializeTableData: (data: import('./schema.ts').TableData) => string
  autoFitTableHeight: (element: CanvasElement) => void
  getElementFontSize: (element: CanvasElement) => number
  getDefaultBorderRadius: (type: CanvasElement['type']) => number
  resetMascotBasePositions: () => void
  syncMascotAnimation: () => void
  resetGifBasePositions: () => void
  syncGifAnimation: () => void
  maybeExtendPages: (requiredBottom: number) => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionFor: (elementId: string) => void
  clearAllTextProjection: () => void
  scheduleRender: () => void
  removeSelectedElement: () => void
  duplicateSelectedElement: () => void
  getInlineEditorState: () => InlineEditorState | null
  setInlineEditorState: (state: InlineEditorState | null) => void
  fitTextElementHeight: (element: CanvasElement) => void
  fitElementWidthToContent: (element: CanvasElement) => void
  setSelectedTextAlign: (alignment: 'left' | 'center' | 'right') => void
  toggleLockSelected: () => void
  alignSelectedElements: (edge: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') => void
  distributeSelectedElements: (axis: 'horizontal' | 'vertical') => void
  setImageUploadTargetId: (id: string | null) => void
  clickGifUploadInput: () => void
  clickImageUploadInput: () => void
  insertVariableToken: (variableName: string) => void
  parseMascotPath: (element: CanvasElement) => Array<{ x: number; y: number }>
  resetGifAnimState: (elementId: string) => void
  startPathTrace: (elementId: string) => void
  showToast: (message: string) => void
  handleTableAction: (action: string) => void
  mascotAnimStates: Map<string, unknown>
  recordState: () => void
}

export function handleInspectorInput(event: Event, hooks: InspectorControllerHooks): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return

  const templateProp = target.dataset['templateProp']
  if (templateProp !== undefined) {
    hooks.maybeRecordHistoryFor(target)
    switch (templateProp) {
      case 'emailFormat':
        if (target.value === 'legacy' || target.value === 'mjml') hooks.state.emailFormat = target.value
        break
      case 'emailBreakpoint':
        return
      default:
        return
    }
    hooks.markDirty(false)
    hooks.scheduleRender()
    return
  }

  const element = hooks.getSelectedElement()
  if (element === null) return
  const prop = target.dataset['prop']
  if (prop === undefined) return
  hooks.maybeRecordHistoryFor(target)

  switch (prop) {
    case 'x':
      element.x = clamp(parseNumber(target.value, element.x), 0, Math.max(0, hooks.canvasWidth() - element.width))
      break
    case 'y':
      element.y = clamp(parseNumber(target.value, element.y), 0, Math.max(0, hooks.state.canvasHeight - element.height))
      break
    case 'width':
      element.width = clamp(parseNumber(target.value, element.width), 36, hooks.canvasWidth() - element.x)
      break
    case 'height':
      element.height = Math.max(12, parseNumber(target.value, element.height))
      break
    case 'content':
      element.content = target.value
      break
    case 'fontSize':
      element.styles.fontSize = Math.max(8, parseNumber(target.value, hooks.getElementFontSize(element)))
      break
    case 'fontFamily':
      element.styles.fontFamily = target.value
      break
    case 'wordBreak':
      if (target.value === 'normal' || target.value === 'keep-all') {
        element.styles.wordBreak = target.value
      }
      break
    case 'color':
      element.styles.color = target.value
      break
    case 'background':
      element.styles.background = target.value
      break
    case 'borderRadius':
      element.styles.borderRadius = Math.max(0, parseNumber(target.value, element.styles.borderRadius ?? hooks.getDefaultBorderRadius(element.type)))
      break
    case 'href':
      element.styles.href = target.value
      break
    case 'opacity':
      element.styles.opacity = clamp(parseNumber(target.value, 1), 0, 1)
      break
    case 'letterSpacing':
      element.styles.letterSpacing = parseNumber(target.value, 0)
      break
    case 'lineHeightMultiplier':
      element.styles.lineHeightMultiplier = clamp(parseNumber(target.value, 1.3), 0.5, 5)
      break
    case 'mascotBehavior':
      element.styles.mascotBehavior = target.value as MascotBehavior
      hooks.resetMascotBasePositions()
      hooks.syncMascotAnimation()
      break
    case 'mascotSpeed':
      element.styles.mascotSpeed = clamp(parseNumber(target.value, 1), 0.1, 5)
      break
    case 'mascotPreset':
      element.styles.mascotPreset = target.value as MascotPreset
      if (target.value !== 'custom') element.content = ''
      break
    case 'mascotSpeech':
      element.styles.mascotSpeech = target.value
      break
    case 'mascotHullMode':
      element.styles.mascotHullMode = target.value as 'rect' | 'silhouette'
      break
    case 'gifBehavior':
      element.styles.gifBehavior = target.value as AnimatedGifBehavior
      hooks.resetGifBasePositions()
      hooks.syncGifAnimation()
      break
    case 'gifSpeed':
      element.styles.gifSpeed = clamp(parseNumber(target.value, 1), 0.1, 5)
      break
    case 'gifHullMode':
      element.styles.gifHullMode = target.value as 'rect' | 'silhouette'
      break
    case 'source':
      element.content = target.value
      if (element.type === 'mascot') element.styles.mascotPreset = 'custom'
      break
    case 'table-cell-content': {
      if (element.type !== 'table') return
      const sel = hooks.getTableSelection()?.elementId === element.id ? hooks.getTableSelection()!.selection : null
      if (sel === null || sel.anchorRow !== sel.focusRow || sel.anchorCol !== sel.focusCol) return
      const tableData = hooks.getTableData(element)
      if (tableData === null) return
      const cell = getCell(tableData, sel.anchorRow, sel.anchorCol)
      if (cell === null) return
      cell.content = target.value
      element.content = hooks.serializeTableData(tableData)
      break
    }
    case 'table-row-height': {
      if (element.type !== 'table') return
      const sel = hooks.getTableSelection()?.elementId === element.id ? hooks.getTableSelection()!.selection : null
      if (sel === null) return
      const tableData = hooks.getTableData(element)
      if (tableData === null) return
      const newHeight = Math.max(20, parseNumber(target.value, 32))
      const range = getSelectionRange(sel)
      for (let row = range.r1; row <= range.r2; row += 1) {
        if (row < tableData.rowHeights.length) tableData.rowHeights[row] = newHeight
      }
      element.content = hooks.serializeTableData(tableData)
      hooks.autoFitTableHeight(element)
      break
    }
    case 'table-border-width': {
      if (element.type !== 'table') return
      const tableData = hooks.getTableData(element)
      if (tableData === null) return
      tableData.defaultBorder.width = Math.max(0, parseNumber(target.value, 1))
      element.content = hooks.serializeTableData(tableData)
      break
    }
    case 'table-border-color': {
      if (element.type !== 'table') return
      const tableData = hooks.getTableData(element)
      if (tableData === null) return
      tableData.defaultBorder.color = target.value
      element.content = hooks.serializeTableData(tableData)
      break
    }
    case 'table-border-style': {
      if (element.type !== 'table') return
      const tableData = hooks.getTableData(element)
      if (tableData === null) return
      const nextStyle = target.value
      if (nextStyle === 'solid' || nextStyle === 'dashed' || nextStyle === 'dotted' || nextStyle === 'none') {
        tableData.defaultBorder.style = nextStyle
      }
      element.content = hooks.serializeTableData(tableData)
      break
    }
    default:
      return
  }

  hooks.maybeExtendPages(element.y + element.height)
  if (element.type === 'mascot') {
    if (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height' || prop === 'source' || prop === 'mascotPreset') {
      hooks.resetMascotBasePositions()
    }
    hooks.syncMascotAnimation()
  }
  if (element.type === 'animated-gif') {
    if (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height') {
      hooks.resetGifBasePositions()
    }
    hooks.syncGifAnimation()
  }
  hooks.markDirty(false)
  if (element.type === 'text' || element.type === 'heading' || element.type === 'button' || element.type === 'table') {
    hooks.clearTextProjectionFor(element.id)
  }
  if (
    element.type === 'image' ||
    element.type === 'mascot' ||
    element.type === 'animated-gif' ||
    element.type === 'video' ||
    element.type === 'divider' ||
    element.type === 'spacer' ||
    element.type === 'html' ||
    prop === 'x' ||
    prop === 'y' ||
    prop === 'width' ||
    prop === 'height'
  ) {
    hooks.clearAllTextProjection()
  }
  hooks.scheduleRender()
}

export function handleInspectorClick(event: Event, hooks: InspectorControllerHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const swatchTarget = target.closest<HTMLElement>('[data-swatch-color]')
  const swatchColor = swatchTarget?.dataset['swatchColor']
  if (swatchColor !== undefined) {
    const element = hooks.getSelectedElement()
    if (element === null) return
    hooks.recordState()
    element.styles.color = swatchColor
    hooks.markDirty()
    hooks.clearTextProjectionFor(element.id)
    hooks.scheduleRender()
    return
  }

  const actionTarget = target.closest<HTMLElement>('[data-action]')
  const action = actionTarget?.dataset['action']
  if (action === undefined) return
  const element = hooks.getSelectedElement()

  switch (action) {
    case 'delete-element':
      hooks.removeSelectedElement()
      break
    case 'duplicate-element':
      hooks.duplicateSelectedElement()
      break
    case 'open-inline-editor':
      if (element !== null && isInlineEditableType(element.type)) {
        hooks.setInlineEditorState({ elementId: element.id, draft: element.content })
        hooks.scheduleRender()
      }
      break
    case 'fit-height':
      if (element !== null && isTextBlock(element.type)) {
        hooks.recordState()
        hooks.fitTextElementHeight(element)
        hooks.markDirty()
        hooks.scheduleRender()
      }
      break
    case 'fit-width':
      if (element !== null && (isTextBlock(element.type) || element.type === 'button')) {
        hooks.recordState()
        hooks.fitElementWidthToContent(element)
        if (isTextBlock(element.type)) hooks.fitTextElementHeight(element)
        hooks.markDirty()
        hooks.scheduleRender()
      }
      break
    case 'upload-image':
      if (element !== null && (element.type === 'image' || element.type === 'mascot' || element.type === 'animated-gif')) {
        hooks.setImageUploadTargetId(element.id)
        if (element.type === 'animated-gif') {
          hooks.clickGifUploadInput()
        } else {
          hooks.clickImageUploadInput()
        }
      }
      break
    case 'insert-variable':
      if (element !== null && isInlineEditableType(element.type)) {
        const variableName = actionTarget?.dataset['variableName']
        if (variableName !== undefined) hooks.insertVariableToken(variableName)
      }
      break
    case 'set-align-left':
      hooks.setSelectedTextAlign('left')
      break
    case 'set-align-center':
      hooks.setSelectedTextAlign('center')
      break
    case 'set-align-right':
      hooks.setSelectedTextAlign('right')
      break
    case 'toggle-lock':
      hooks.toggleLockSelected()
      break
    case 'align-left': hooks.alignSelectedElements('left'); break
    case 'align-right': hooks.alignSelectedElements('right'); break
    case 'align-top': hooks.alignSelectedElements('top'); break
    case 'align-bottom': hooks.alignSelectedElements('bottom'); break
    case 'align-center-h': hooks.alignSelectedElements('center-h'); break
    case 'align-center-v': hooks.alignSelectedElements('center-v'); break
    case 'distribute-h': hooks.distributeSelectedElements('horizontal'); break
    case 'distribute-v': hooks.distributeSelectedElements('vertical'); break
    case 'remove-html':
      if (element !== null && element.type === 'html') {
        hooks.maybeRecordHistoryFor(target)
        element.content = ''
        hooks.markDirty(false)
        hooks.scheduleRender()
      }
      break
    case 'reset-mascot-path':
      if (element !== null && element.type === 'mascot') {
        hooks.recordState()
        element.styles.mascotPath = JSON.stringify([
          { x: element.x, y: element.y },
          { x: Math.min(element.x + 200, hooks.canvasWidth() - element.width), y: element.y },
        ])
        hooks.mascotAnimStates.delete(element.id)
        hooks.resetMascotBasePositions()
        hooks.markDirty()
        hooks.clearAllTextProjection()
        hooks.scheduleRender()
      }
      break
    case 'add-mascot-waypoint':
      if (element !== null && element.type === 'mascot') {
        hooks.recordState()
        const path = hooks.parseMascotPath(element)
        const lastWaypoint = path.length > 0 ? path[path.length - 1]! : { x: element.x, y: element.y }
        path.push({
          x: clamp(lastWaypoint.x + 100, 0, hooks.canvasWidth() - element.width),
          y: Math.max(0, lastWaypoint.y + 50),
        })
        element.styles.mascotPath = JSON.stringify(path)
        hooks.markDirty()
        hooks.clearAllTextProjection()
        hooks.scheduleRender()
      }
      break
    case 'trace-mascot-path':
      if (element !== null && element.type === 'mascot') {
        hooks.startPathTrace(element.id)
      }
      break
    case 'clear-mascot-path':
      if (element !== null && element.type === 'mascot') {
        hooks.recordState()
        delete element.styles.mascotPath
        hooks.mascotAnimStates.delete(element.id)
        hooks.resetMascotBasePositions()
        hooks.markDirty()
        hooks.clearAllTextProjection()
        hooks.syncMascotAnimation()
        hooks.scheduleRender()
        hooks.showToast('Mascot path cleared')
      }
      break
    case 'upload-gif':
      if (element !== null && element.type === 'animated-gif') {
        hooks.setImageUploadTargetId(element.id)
        hooks.clickGifUploadInput()
      }
      break
    case 'trace-gif-path':
      if (element !== null && (element.type === 'animated-gif' || element.type === 'mascot')) {
        hooks.startPathTrace(element.id)
      }
      break
    case 'clear-gif-path':
      if (element !== null && element.type === 'animated-gif') {
        hooks.recordState()
        delete element.styles.gifPath
        hooks.resetGifAnimState(element.id)
        hooks.resetGifBasePositions()
        hooks.markDirty()
        hooks.clearAllTextProjection()
        hooks.syncGifAnimation()
        hooks.scheduleRender()
        hooks.showToast('Path cleared')
      }
      break
    case 'table-add-row-after':
    case 'table-add-row-before':
    case 'table-add-col-after':
    case 'table-add-col-before':
    case 'table-remove-row':
    case 'table-remove-col':
    case 'table-merge-cells':
    case 'table-split-cell':
    case 'table-toggle-header':
    case 'table-toggle-striped':
    case 'table-fit-height':
      hooks.handleTableAction(action)
      break
    default:
      break
  }
}
