import type {
  CanvasElement,
  CellBorderStyle,
  TableCell,
  TableData,
  TextProjection,
} from './schema.ts'
import {
  DEFAULT_CELL_PADDING,
  computeTableHeight,
  getAnchorCell,
  getCell,
  getCellRect,
  getColumnLefts,
  getRowTops,
  getSelectionRange,
  hitTestCell,
  insertColumn,
  insertRow,
  isCellSelected,
  mergeCells,
  nextCellTab,
  parseTableData,
  prevCellTab,
  removeColumn,
  removeRow,
  serializeTableData,
  splitCell,
  type CellSelection,
} from './table-engine.ts'
import { roundTo } from './utils.ts'

export type TableCellSelectionState = {
  elementId: string
  selection: CellSelection
}

export type TableCellEditingState = {
  elementId: string
  row: number
  col: number
  draft: string
}

type TableCellRenderState = {
  rect: { x: number; y: number; width: number; height: number }
  padding: number
  bg: string
  borderTop: CellBorderStyle
  borderRight: CellBorderStyle
  borderBottom: CellBorderStyle
  borderLeft: CellBorderStyle
  projection: TextProjection
}

type TableUiHooks = {
  selectedId: string | null
  getSelection: () => TableCellSelectionState | null
  setSelection: (selection: TableCellSelectionState | null) => void
  getEditing: () => TableCellEditingState | null
  setEditing: (editing: TableCellEditingState | null) => void
  inlineEditorLayer: HTMLDivElement
  scheduleRender: () => void
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  getSelectedElement: () => CanvasElement | null
  getElementById: (id: string) => CanvasElement | null
  getResolvedTableCellContent: (cell: TableCell, data: TableData) => string
  getTableCellRenderState: (
    element: CanvasElement,
    data: TableData,
    cell: TableCell,
    rowIndex: number,
    content: string,
  ) => TableCellRenderState
  createPlaceholder: (title: string, detail: string) => HTMLDivElement
}

function getTableData(element: CanvasElement): TableData | null {
  return parseTableData(element.content)
}

export function renderTableElement(frame: HTMLDivElement, element: CanvasElement, hooks: TableUiHooks): void {
  const data = getTableData(element)
  if (data === null) {
    frame.append(hooks.createPlaceholder('Table', 'Invalid table data - delete and recreate.'))
    return
  }

  const tableWidth = element.width
  const colLefts = getColumnLefts(data, tableWidth)
  const rowTops = getRowTops(data)
  const visitedCells = new Set<string>()
  const isSelected = hooks.selectedId === element.id
  const selection = hooks.getSelection()
  const editingState = hooks.getEditing()
  const sel = isSelected && selection?.elementId === element.id ? selection.selection : null
  const editing = isSelected && editingState?.elementId === element.id ? editingState : null

  for (let r = 0; r < data.rows; r += 1) {
    for (let c = 0; c < data.cols; c += 1) {
      const key = `${r}:${c}`
      if (visitedCells.has(key)) continue
      const cell = getCell(data, r, c)
      if (cell === null) continue
      if (cell.row !== r || cell.col !== c) {
        visitedCells.add(key)
        continue
      }
      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) {
          visitedCells.add(`${r + dr}:${c + dc}`)
        }
      }

      const displayContent = editing !== null && editing.row === r && editing.col === c
        ? editing.draft
        : hooks.getResolvedTableCellContent(cell, data)
      const renderState = hooks.getTableCellRenderState(element, data, cell, r, displayContent)
      const { rect, padding, bg, borderTop, borderRight, borderBottom, borderLeft, projection } = renderState
      const border = (edge: 'top' | 'right' | 'bottom' | 'left') => {
        const current = edge === 'top'
          ? borderTop
          : edge === 'right'
            ? borderRight
            : edge === 'bottom'
              ? borderBottom
              : borderLeft
        return current.style === 'none' ? 'none' : `${current.width}px ${current.style} ${current.color}`
      }

      const cellDiv = document.createElement('div')
      cellDiv.className = 'canvas-element__table-cell'
      if (isCellSelected(sel, r, c)) cellDiv.classList.add('canvas-element__table-cell--selected')
      if (editing !== null && editing.row === r && editing.col === c) cellDiv.classList.add('canvas-element__table-cell--editing')
      cellDiv.style.left = `${roundTo(rect.x, 1)}px`
      cellDiv.style.top = `${roundTo(rect.y, 1)}px`
      cellDiv.style.width = `${roundTo(rect.width, 1)}px`
      cellDiv.style.height = `${roundTo(rect.height, 1)}px`
      cellDiv.style.padding = `${padding}px`
      cellDiv.style.borderTop = border('top')
      cellDiv.style.borderRight = border('right')
      cellDiv.style.borderBottom = border('bottom')
      cellDiv.style.borderLeft = border('left')
      if (bg.length > 0) cellDiv.style.background = bg
      if (cell.styles.hAlign !== undefined) cellDiv.style.textAlign = cell.styles.hAlign
      if (cell.styles.fontSize !== undefined) cellDiv.style.fontSize = `${cell.styles.fontSize}px`
      if (cell.styles.fontWeight !== undefined) cellDiv.style.fontWeight = String(cell.styles.fontWeight)
      if (cell.styles.fontFamily !== undefined) cellDiv.style.fontFamily = cell.styles.fontFamily
      if (cell.styles.fontStyle !== undefined) cellDiv.style.fontStyle = cell.styles.fontStyle
      if (cell.styles.color !== undefined) cellDiv.style.color = cell.styles.color

      for (const line of projection.lines) {
        const lineNode = document.createElement('span')
        lineNode.className = 'canvas-element__table-cell-text'
        lineNode.style.left = `${roundTo(line.x, 2)}px`
        lineNode.style.top = `${roundTo(line.y, 2)}px`
        lineNode.style.font = projection.font
        lineNode.style.color = projection.color
        lineNode.style.textDecoration = projection.textDecoration
        lineNode.style.lineHeight = `${projection.lineHeight}px`
        lineNode.textContent = line.text
        cellDiv.append(lineNode)
      }

      cellDiv.dataset['cellRow'] = String(r)
      cellDiv.dataset['cellCol'] = String(c)
      frame.append(cellDiv)
    }
  }

  if (isSelected) {
    const totalHeight = rowTops[rowTops.length - 1] ?? element.height
    for (let c = 1; c < colLefts.length - 1; c += 1) {
      const handle = document.createElement('div')
      handle.className = 'table-col-resize-handle'
      handle.style.left = `${roundTo(colLefts[c]! - 3, 1)}px`
      handle.style.height = `${totalHeight}px`
      handle.dataset['tableColResize'] = String(c)
      frame.append(handle)
    }
    const totalWidth = colLefts[colLefts.length - 1] ?? element.width
    for (let r = 1; r < rowTops.length - 1; r += 1) {
      const handle = document.createElement('div')
      handle.className = 'table-row-resize-handle'
      handle.style.top = `${roundTo(rowTops[r]! - 3, 1)}px`
      handle.style.width = `${totalWidth}px`
      handle.dataset['tableRowResize'] = String(r)
      frame.append(handle)
    }
  }

  if (editing !== null) {
    renderTableCellEditor(element, data, editing, hooks)
  }
}

function renderTableCellEditor(
  element: CanvasElement,
  data: TableData,
  editing: TableCellEditingState,
  hooks: TableUiHooks,
): void {
  const cell = getCell(data, editing.row, editing.col)
  if (cell === null) return
  const rect = getCellRect(data, cell, element.width)
  const padding = cell.styles.padding ?? DEFAULT_CELL_PADDING

  const existing = hooks.inlineEditorLayer.querySelector('.table-cell-editor') as HTMLTextAreaElement | null
  if (existing !== null) {
    return
  }

  const textarea = document.createElement('textarea')
  textarea.className = 'table-cell-editor'
  textarea.style.left = `${Math.round(element.x + rect.x)}px`
  textarea.style.top = `${Math.round(element.y + rect.y)}px`
  textarea.style.width = `${Math.round(rect.width)}px`
  textarea.style.height = `${Math.round(rect.height)}px`
  textarea.style.padding = `${padding}px`
  if (cell.styles.fontSize !== undefined) textarea.style.fontSize = `${cell.styles.fontSize}px`
  if (cell.styles.fontWeight !== undefined) textarea.style.fontWeight = String(cell.styles.fontWeight)
  if (cell.styles.fontFamily !== undefined) textarea.style.fontFamily = cell.styles.fontFamily
  if (cell.styles.fontStyle !== undefined) textarea.style.fontStyle = cell.styles.fontStyle
  if (cell.styles.color !== undefined) textarea.style.color = cell.styles.color
  if (cell.styles.hAlign !== undefined) textarea.style.textAlign = cell.styles.hAlign
  textarea.value = editing.draft

  const autoResize = () => {
    textarea.style.height = 'auto'
    const minHeight = Math.round(rect.height)
    textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`
  }

  textarea.addEventListener('input', () => {
    const currentEditing = hooks.getEditing()
    if (currentEditing !== null) currentEditing.draft = textarea.value
    autoResize()
  })
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      hooks.setEditing(null)
      hooks.scheduleRender()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commitTableCellEdit(hooks)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      commitTableCellEdit(hooks)
      const targetElement = hooks.getElementById(editing.elementId)
      if (targetElement === null) return
      const tableData = getTableData(targetElement)
      if (tableData === null) return
      const next = event.shiftKey
        ? prevCellTab(tableData, editing.row, editing.col)
        : nextCellTab(tableData, editing.row, editing.col)
      startTableCellEdit(editing.elementId, next.row, next.col, hooks)
    }
  })
  textarea.addEventListener('blur', () => {
    const currentEditing = hooks.getEditing()
    if (currentEditing !== null && currentEditing.elementId === editing.elementId) {
      commitTableCellEdit(hooks)
    }
  })

  hooks.inlineEditorLayer.append(textarea)
  requestAnimationFrame(() => textarea.focus())
}

export function startTableCellEdit(elementId: string, row: number, col: number, hooks: TableUiHooks): void {
  const element = hooks.getElementById(elementId)
  if (element === null || element.type !== 'table') return
  const data = getTableData(element)
  if (data === null) return
  const cell = getAnchorCell(data, row, col)
  if (cell === null) return
  hooks.setEditing({ elementId, row: cell.row, col: cell.col, draft: cell.content })
  hooks.setSelection({
    elementId,
    selection: { anchorRow: cell.row, anchorCol: cell.col, focusRow: cell.row, focusCol: cell.col },
  })
  hooks.scheduleRender()
}

export function commitTableCellEdit(hooks: TableUiHooks): void {
  const editing = hooks.getEditing()
  if (editing === null) return
  const { elementId, row, col, draft } = editing
  hooks.setEditing(null)
  const element = hooks.getElementById(elementId)
  if (element === null || element.type !== 'table') return
  const data = getTableData(element)
  if (data === null) return
  const cell = getCell(data, row, col)
  if (cell === null) return
  if (cell.content !== draft) {
    hooks.recordState()
    cell.content = draft
    element.content = serializeTableData(data)
    hooks.markDirty()
  }
  const editor = hooks.inlineEditorLayer.querySelector('.table-cell-editor')
  if (editor !== null) editor.remove()
  hooks.scheduleRender()
}

export function handleTableCellClick(
  element: CanvasElement,
  localX: number,
  localY: number,
  shiftKey: boolean,
  hooks: TableUiHooks,
): void {
  const data = getTableData(element)
  if (data === null) return
  const hit = hitTestCell(data, localX, localY, element.width)
  if (hit === null) return
  const anchor = getAnchorCell(data, hit.row, hit.col)
  if (anchor === null) return

  const selection = hooks.getSelection()
  if (shiftKey && selection?.elementId === element.id) {
    selection.selection.focusRow = anchor.row
    selection.selection.focusCol = anchor.col
  } else {
    hooks.setSelection({
      elementId: element.id,
      selection: { anchorRow: anchor.row, anchorCol: anchor.col, focusRow: anchor.row, focusCol: anchor.col },
    })
  }
  hooks.scheduleRender()
}

export function handleTableDoubleClick(
  element: CanvasElement,
  localX: number,
  localY: number,
  hooks: TableUiHooks,
): void {
  const data = getTableData(element)
  if (data === null) return
  const hit = hitTestCell(data, localX, localY, element.width)
  if (hit === null) return
  startTableCellEdit(element.id, hit.row, hit.col, hooks)
}

export function handleTableAction(action: string, hooks: TableUiHooks): void {
  const element = hooks.getSelectedElement()
  if (element === null || element.type !== 'table') return
  const data = getTableData(element)
  if (data === null) return

  hooks.recordState()
  const selection = hooks.getSelection()
  switch (action) {
    case 'table-add-row-after': {
      const rowIndex = selection?.elementId === element.id
        ? getSelectionRange(selection.selection).r2 + 1
        : data.rows
      insertRow(data, rowIndex)
      break
    }
    case 'table-add-row-before': {
      const rowIndex = selection?.elementId === element.id
        ? getSelectionRange(selection.selection).r1
        : 0
      insertRow(data, rowIndex)
      break
    }
    case 'table-add-col-after': {
      const colIndex = selection?.elementId === element.id
        ? getSelectionRange(selection.selection).c2 + 1
        : data.cols
      insertColumn(data, colIndex)
      break
    }
    case 'table-add-col-before': {
      const colIndex = selection?.elementId === element.id
        ? getSelectionRange(selection.selection).c1
        : 0
      insertColumn(data, colIndex)
      break
    }
    case 'table-remove-row': {
      if (selection?.elementId === element.id) {
        const { r1, r2 } = getSelectionRange(selection.selection)
        for (let row = r2; row >= r1; row -= 1) removeRow(data, row)
      }
      break
    }
    case 'table-remove-col': {
      if (selection?.elementId === element.id) {
        const { c1, c2 } = getSelectionRange(selection.selection)
        for (let col = c2; col >= c1; col -= 1) removeColumn(data, col)
      }
      break
    }
    case 'table-merge-cells': {
      if (selection?.elementId === element.id) {
        const { r1, c1, r2, c2 } = getSelectionRange(selection.selection)
        mergeCells(data, r1, c1, r2, c2)
      }
      break
    }
    case 'table-split-cell': {
      if (selection?.elementId === element.id) {
        splitCell(data, selection.selection.anchorRow, selection.selection.anchorCol)
      }
      break
    }
    case 'table-toggle-header': {
      const current = element.styles.tableHeaderRows ?? 0
      element.styles.tableHeaderRows = current > 0 ? 0 : 1
      data.headerRows = element.styles.tableHeaderRows
      break
    }
    case 'table-toggle-striped': {
      if (element.styles.tableStriped === true) {
        delete (element.styles as Record<string, unknown>)['tableStriped']
      } else {
        element.styles.tableStriped = true
      }
      break
    }
    case 'table-fit-height': {
      break
    }
    default:
      return
  }
  element.content = serializeTableData(data)
  element.height = computeTableHeight(data)
  hooks.markDirty()
  hooks.scheduleRender()
}
