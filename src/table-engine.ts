/**
 * table-engine.ts — Table layout engine for Template Studio.
 *
 * Manages table data structures, cell geometry, merge/split, column/row
 * resize, formula evaluation, and export helpers. Each cell's text content
 * is laid out by Pretext independently within its computed bounds.
 */

import type {
  CellBorderStyle,
  CellStyles,
  TableCell,
  TableData,
} from './schema.ts'

// ── Constants ────────────────────────────────────────────────────

/** Minimum column width in CSS pixels */
const MIN_COL_WIDTH = 30
/** Minimum row height in CSS pixels */
const MIN_ROW_HEIGHT = 24
/** Default cell padding in CSS pixels */
export const DEFAULT_CELL_PADDING = 6
/** Default border style */
export const DEFAULT_BORDER: CellBorderStyle = { width: 1, color: '#c0c8d0', style: 'solid' }
/** No-border sentinel */
export const NO_BORDER: CellBorderStyle = { width: 0, color: 'transparent', style: 'none' }

// ── Table creation ───────────────────────────────────────────────

/** Create a fresh table data structure with uniform columns/rows. */
export function createTableData(
  rows: number,
  cols: number,
  _tableWidth: number,
  defaultRowHeight: number = 32,
): TableData {
  const safeRows = Math.max(1, Math.min(rows, 100))
  const safeCols = Math.max(1, Math.min(cols, 26))
  const colFraction = 1 / safeCols
  const colWidths = Array.from({ length: safeCols }, () => colFraction)
  const rowHeights = Array.from({ length: safeRows }, () => defaultRowHeight)
  const cells: TableCell[] = []
  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      cells.push(createCell(r, c))
    }
  }
  return {
    rows: safeRows,
    cols: safeCols,
    colWidths,
    rowHeights,
    cells,
    headerRows: 0,
    defaultBorder: { ...DEFAULT_BORDER },
  }
}

/** Create a single empty cell. */
export function createCell(row: number, col: number): TableCell {
  return {
    row,
    col,
    rowspan: 1,
    colspan: 1,
    content: '',
    styles: {},
  }
}

// ── Serialization ────────────────────────────────────────────────

/** Serialize table data to JSON string for storage in CanvasElement.content. */
export function serializeTableData(data: TableData): string {
  return JSON.stringify(data)
}

/** Parse table data from CanvasElement.content JSON string. Returns null on invalid data. */
export function parseTableData(content: string): TableData | null {
  if (content.trim().length === 0) return null
  try {
    const raw = JSON.parse(content) as Partial<TableData>
    if (
      typeof raw.rows !== 'number' ||
      typeof raw.cols !== 'number' ||
      !Array.isArray(raw.colWidths) ||
      !Array.isArray(raw.rowHeights) ||
      !Array.isArray(raw.cells)
    ) return null
    return normalizeTableData(raw as TableData)
  } catch {
    return null
  }
}

/** Normalize table data to ensure consistency. */
export function normalizeTableData(data: TableData): TableData {
  const rows = Math.max(1, Math.min(data.rows, 200))
  const cols = Math.max(1, Math.min(data.cols, 26))

  // Normalize column widths to sum to 1
  let colWidths = data.colWidths.slice(0, cols)
  while (colWidths.length < cols) colWidths.push(1 / cols)
  const total = colWidths.reduce((s, w) => s + w, 0)
  if (total > 0) colWidths = colWidths.map(w => w / total)
  else colWidths = Array.from({ length: cols }, () => 1 / cols)

  // Normalize row heights
  let rowHeights = data.rowHeights.slice(0, rows)
  while (rowHeights.length < rows) rowHeights.push(32)
  rowHeights = rowHeights.map(h => Math.max(MIN_ROW_HEIGHT, h))

  // Normalize cells
  const cellMap = new Map<string, TableCell>()
  for (const cell of data.cells) {
    if (cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols) {
      cellMap.set(cellKey(cell.row, cell.col), normalizeCell(cell, rows, cols))
    }
  }
  // Fill missing cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = cellKey(r, c)
      if (!cellMap.has(key) && !isCoveredByMerge(r, c, cellMap)) {
        cellMap.set(key, createCell(r, c))
      }
    }
  }

  return {
    rows,
    cols,
    colWidths,
    rowHeights,
    cells: Array.from(cellMap.values()),
    headerRows: Math.min(data.headerRows ?? 0, rows),
    defaultBorder: normalizeBorder(data.defaultBorder),
  }
}

function normalizeCell(cell: TableCell, maxRows: number, maxCols: number): TableCell {
  return {
    row: cell.row,
    col: cell.col,
    rowspan: Math.max(1, Math.min(cell.rowspan, maxRows - cell.row)),
    colspan: Math.max(1, Math.min(cell.colspan, maxCols - cell.col)),
    content: typeof cell.content === 'string' ? cell.content : '',
    styles: normalizeCellStyles(cell.styles),
  }
}

function normalizeBorder(border: CellBorderStyle | undefined): CellBorderStyle {
  if (border === undefined || border === null) return { ...DEFAULT_BORDER }
  return {
    width: typeof border.width === 'number' && Number.isFinite(border.width) ? Math.max(0, border.width) : 1,
    color: typeof border.color === 'string' ? border.color : '#c0c8d0',
    style: border.style === 'solid' || border.style === 'dashed' || border.style === 'dotted' || border.style === 'none' ? border.style : 'solid',
  }
}

function normalizeCellStyles(styles: CellStyles | undefined): CellStyles {
  if (styles === undefined || styles === null) return {}
  const next: CellStyles = {}
  if (styles.borderTop !== undefined) next.borderTop = normalizeBorder(styles.borderTop)
  if (styles.borderRight !== undefined) next.borderRight = normalizeBorder(styles.borderRight)
  if (styles.borderBottom !== undefined) next.borderBottom = normalizeBorder(styles.borderBottom)
  if (styles.borderLeft !== undefined) next.borderLeft = normalizeBorder(styles.borderLeft)
  if (typeof styles.background === 'string') next.background = styles.background
  if (typeof styles.padding === 'number' && Number.isFinite(styles.padding)) next.padding = Math.max(0, styles.padding)
  if (styles.hAlign === 'left' || styles.hAlign === 'center' || styles.hAlign === 'right') next.hAlign = styles.hAlign
  if (styles.vAlign === 'top' || styles.vAlign === 'middle' || styles.vAlign === 'bottom') next.vAlign = styles.vAlign
  if (typeof styles.fontFamily === 'string') next.fontFamily = styles.fontFamily
  if (typeof styles.fontSize === 'number' && Number.isFinite(styles.fontSize)) next.fontSize = styles.fontSize
  if (typeof styles.fontWeight === 'number' && Number.isFinite(styles.fontWeight)) next.fontWeight = styles.fontWeight
  if (styles.fontStyle === 'normal' || styles.fontStyle === 'italic') next.fontStyle = styles.fontStyle
  if (typeof styles.color === 'string') next.color = styles.color
  return next
}

// ── Cell lookup ──────────────────────────────────────────────────

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

/** Get the cell at (row, col). If the position is covered by a merged cell, returns the anchor cell. */
export function getCell(data: TableData, row: number, col: number): TableCell | null {
  const direct = data.cells.find(c => c.row === row && c.col === col)
  if (direct !== undefined) return direct
  // Check if covered by a merged cell
  for (const cell of data.cells) {
    if (cell.rowspan > 1 || cell.colspan > 1) {
      if (
        row >= cell.row && row < cell.row + cell.rowspan &&
        col >= cell.col && col < cell.col + cell.colspan
      ) return cell
    }
  }
  return null
}

/** Check if (row, col) is covered by a merged cell (not the anchor itself). */
function isCoveredByMerge(row: number, col: number, cellMap: Map<string, TableCell>): boolean {
  for (const cell of cellMap.values()) {
    if (cell.rowspan <= 1 && cell.colspan <= 1) continue
    if (
      row >= cell.row && row < cell.row + cell.rowspan &&
      col >= cell.col && col < cell.col + cell.colspan &&
      !(row === cell.row && col === cell.col)
    ) return true
  }
  return false
}

/** Get the anchor cell for a position (resolves merged cells). */
export function getAnchorCell(data: TableData, row: number, col: number): TableCell | null {
  return getCell(data, row, col)
}

// ── Cell geometry ────────────────────────────────────────────────

export type CellRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Compute the pixel bounds of a cell relative to the table origin. */
export function getCellRect(
  data: TableData,
  cell: TableCell,
  tableWidth: number,
): CellRect {
  const colPixelWidths = data.colWidths.map(f => f * tableWidth)
  let x = 0
  for (let c = 0; c < cell.col; c++) x += colPixelWidths[c]!
  let width = 0
  for (let c = cell.col; c < cell.col + cell.colspan && c < data.cols; c++) width += colPixelWidths[c]!
  let y = 0
  for (let r = 0; r < cell.row; r++) y += data.rowHeights[r]!
  let height = 0
  for (let r = cell.row; r < cell.row + cell.rowspan && r < data.rows; r++) height += data.rowHeights[r]!
  return { x, y, width, height }
}

/** Get column left-edge positions (pixel offsets from table left). */
export function getColumnLefts(data: TableData, tableWidth: number): number[] {
  const colPixelWidths = data.colWidths.map(f => f * tableWidth)
  const lefts: number[] = [0]
  for (let c = 0; c < data.cols; c++) lefts.push(lefts[c]! + colPixelWidths[c]!)
  return lefts
}

/** Get row top-edge positions (pixel offsets from table top). */
export function getRowTops(data: TableData): number[] {
  const tops: number[] = [0]
  for (let r = 0; r < data.rows; r++) tops.push(tops[r]! + data.rowHeights[r]!)
  return tops
}

/** Compute total table height from row heights. */
export function computeTableHeight(data: TableData): number {
  return data.rowHeights.reduce((s, h) => s + h, 0)
}

// ── Column/row resize ────────────────────────────────────────────

/** Resize a column border. `colIndex` is the right edge being dragged (0-based, between col colIndex-1 and colIndex). */
export function resizeColumn(
  data: TableData,
  colIndex: number,
  deltaPixels: number,
  tableWidth: number,
): void {
  if (colIndex <= 0 || colIndex >= data.cols) return
  const colPixelWidths = data.colWidths.map(f => f * tableWidth)
  const leftCol = colIndex - 1
  const rightCol = colIndex
  const newLeftWidth = colPixelWidths[leftCol]! + deltaPixels
  const newRightWidth = colPixelWidths[rightCol]! - deltaPixels
  if (newLeftWidth < MIN_COL_WIDTH || newRightWidth < MIN_COL_WIDTH) return
  colPixelWidths[leftCol] = newLeftWidth
  colPixelWidths[rightCol] = newRightWidth
  const totalPx = colPixelWidths.reduce((s, w) => s + w, 0)
  data.colWidths = colPixelWidths.map(w => w / totalPx)
}

/** Resize a row height. */
export function resizeRow(
  data: TableData,
  rowIndex: number,
  newHeight: number,
): void {
  if (rowIndex < 0 || rowIndex >= data.rows) return
  data.rowHeights[rowIndex] = Math.max(MIN_ROW_HEIGHT, newHeight)
}

// ── Add/remove rows and columns ──────────────────────────────────

/** Insert a row at the given index. */
export function insertRow(data: TableData, atIndex: number): void {
  const idx = Math.max(0, Math.min(atIndex, data.rows))
  data.rows++
  data.rowHeights.splice(idx, 0, 32)
  // Shift cells below the insertion point
  for (const cell of data.cells) {
    if (cell.row >= idx) cell.row++
  }
  // Add new cells for the inserted row
  for (let c = 0; c < data.cols; c++) {
    data.cells.push(createCell(idx, c))
  }
  if (data.headerRows > idx) data.headerRows++
}

/** Insert a column at the given index. */
export function insertColumn(data: TableData, atIndex: number): void {
  const idx = Math.max(0, Math.min(atIndex, data.cols))
  data.cols++
  // Redistribute column widths
  const newFraction = 1 / data.cols
  data.colWidths.splice(idx, 0, newFraction)
  const total = data.colWidths.reduce((s, w) => s + w, 0)
  data.colWidths = data.colWidths.map(w => w / total)
  // Shift cells right of the insertion point
  for (const cell of data.cells) {
    if (cell.col >= idx) cell.col++
  }
  // Add new cells for the inserted column
  for (let r = 0; r < data.rows; r++) {
    data.cells.push(createCell(r, idx))
  }
}

/** Remove a row. Returns false if only 1 row remains. */
export function removeRow(data: TableData, rowIndex: number): boolean {
  if (data.rows <= 1 || rowIndex < 0 || rowIndex >= data.rows) return false
  data.rows--
  data.rowHeights.splice(rowIndex, 1)
  // Remove cells in this row and shift cells below
  data.cells = data.cells.filter(c => c.row !== rowIndex)
  for (const cell of data.cells) {
    if (cell.row > rowIndex) cell.row--
  }
  // Clamp merged cells that spanned across the removed row
  for (const cell of data.cells) {
    if (cell.row + cell.rowspan > data.rows) {
      cell.rowspan = data.rows - cell.row
    }
  }
  if (data.headerRows > data.rows) data.headerRows = data.rows
  return true
}

/** Remove a column. Returns false if only 1 column remains. */
export function removeColumn(data: TableData, colIndex: number): boolean {
  if (data.cols <= 1 || colIndex < 0 || colIndex >= data.cols) return false
  data.cols--
  // Remove cells in this column and shift cells right
  data.cells = data.cells.filter(c => c.col !== colIndex)
  for (const cell of data.cells) {
    if (cell.col > colIndex) cell.col--
  }
  // Redistribute column widths
  data.colWidths.splice(colIndex, 1)
  const total = data.colWidths.reduce((s, w) => s + w, 0)
  if (total > 0) data.colWidths = data.colWidths.map(w => w / total)
  else data.colWidths = Array.from({ length: data.cols }, () => 1 / data.cols)
  // Clamp merged cells
  for (const cell of data.cells) {
    if (cell.col + cell.colspan > data.cols) {
      cell.colspan = data.cols - cell.col
    }
  }
  return true
}

// ── Merge / split ────────────────────────────────────────────────

/** Merge a rectangular range of cells. Returns false if the range is invalid or already merged. */
export function mergeCells(
  data: TableData,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): boolean {
  const r1 = Math.min(startRow, endRow)
  const r2 = Math.max(startRow, endRow)
  const c1 = Math.min(startCol, endCol)
  const c2 = Math.max(startCol, endCol)
  if (r1 === r2 && c1 === c2) return false
  if (r1 < 0 || c1 < 0 || r2 >= data.rows || c2 >= data.cols) return false

  // Check for existing merges that partially overlap — disallow
  for (const cell of data.cells) {
    if (cell.rowspan <= 1 && cell.colspan <= 1) continue
    const cr1 = cell.row
    const cr2 = cell.row + cell.rowspan - 1
    const cc1 = cell.col
    const cc2 = cell.col + cell.colspan - 1
    const overlaps = cr1 <= r2 && cr2 >= r1 && cc1 <= c2 && cc2 >= c1
    const fullyInside = cr1 >= r1 && cr2 <= r2 && cc1 >= c1 && cc2 <= c2
    if (overlaps && !fullyInside) return false
  }

  // Collect content from all cells in range (take first non-empty)
  let mergedContent = ''
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = getCell(data, r, c)
      if (cell !== null && cell.content.trim().length > 0 && mergedContent.length === 0) {
        mergedContent = cell.content
      }
    }
  }

  // Remove all cells in the range
  data.cells = data.cells.filter(cell => {
    if (cell.row >= r1 && cell.row <= r2 && cell.col >= c1 && cell.col <= c2) return false
    return true
  })

  // Create the merged anchor cell
  const anchor: TableCell = {
    row: r1,
    col: c1,
    rowspan: r2 - r1 + 1,
    colspan: c2 - c1 + 1,
    content: mergedContent,
    styles: {},
  }
  data.cells.push(anchor)
  return true
}

/** Split a merged cell back into individual cells. */
export function splitCell(data: TableData, row: number, col: number): boolean {
  const anchor = getAnchorCell(data, row, col)
  if (anchor === null || (anchor.rowspan <= 1 && anchor.colspan <= 1)) return false
  const { rowspan, colspan, content, styles } = anchor
  // Remove the anchor
  data.cells = data.cells.filter(c => !(c.row === anchor.row && c.col === anchor.col))
  // Create individual cells
  for (let r = anchor.row; r < anchor.row + rowspan; r++) {
    for (let c = anchor.col; c < anchor.col + colspan; c++) {
      const cell = createCell(r, c)
      if (r === anchor.row && c === anchor.col) {
        cell.content = content
        cell.styles = { ...styles }
      }
      data.cells.push(cell)
    }
  }
  return true
}

// ── Cell selection helpers ───────────────────────────────────────

export type CellSelection = {
  anchorRow: number
  anchorCol: number
  focusRow: number
  focusCol: number
}

/** Get the normalized (top-left to bottom-right) selection range. */
export function getSelectionRange(sel: CellSelection): { r1: number; c1: number; r2: number; c2: number } {
  return {
    r1: Math.min(sel.anchorRow, sel.focusRow),
    c1: Math.min(sel.anchorCol, sel.focusCol),
    r2: Math.max(sel.anchorRow, sel.focusRow),
    c2: Math.max(sel.anchorCol, sel.focusCol),
  }
}

/** Check if a cell position is within the selection range. */
export function isCellSelected(sel: CellSelection | null, row: number, col: number): boolean {
  if (sel === null) return false
  const { r1, c1, r2, c2 } = getSelectionRange(sel)
  return row >= r1 && row <= r2 && col >= c1 && col <= c2
}

// ── Formula evaluation ───────────────────────────────────────────

/** Column letter from index (0 → A, 1 → B, ..., 25 → Z). */
export function colLetter(index: number): string {
  return String.fromCharCode(65 + Math.min(index, 25))
}

/** Parse cell reference like "A1" into {row, col}. Returns null if invalid. */
export function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.trim().toUpperCase().match(/^([A-Z])(\d+)$/)
  if (match === null) return null
  const col = match[1]!.charCodeAt(0) - 65
  const row = parseInt(match[2]!, 10) - 1
  if (row < 0 || col < 0 || col > 25) return null
  return { row, col }
}

/** Parse a range reference like "A1:A5". */
export function parseRangeRef(ref: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const parts = ref.split(':')
  if (parts.length !== 2) return null
  const start = parseCellRef(parts[0]!)
  const end = parseCellRef(parts[1]!)
  if (start === null || end === null) return null
  return {
    r1: Math.min(start.row, end.row),
    c1: Math.min(start.col, end.col),
    r2: Math.max(start.row, end.row),
    c2: Math.max(start.col, end.col),
  }
}

/** Evaluate formulas in cell content. Supports {{=SUM(A1:A5)}}, {{=AVG(...)}}, {{=MIN(...)}}, {{=MAX(...)}}, {{=COUNT(...)}}. */
export function evaluateFormulas(content: string, data: TableData): string {
  return content.replace(/\{\{=(\w+)\(([^)]+)\)\}\}/g, (_match, fnName: string, argStr: string) => {
    const fn = fnName.toUpperCase()
    const values = collectFormulaValues(argStr, data)
    if (values === null) return _match // invalid reference, leave unchanged
    switch (fn) {
      case 'SUM': return String(values.reduce((s, v) => s + v, 0))
      case 'AVG': return values.length > 0 ? String(values.reduce((s, v) => s + v, 0) / values.length) : '0'
      case 'MIN': return values.length > 0 ? String(Math.min(...values)) : '0'
      case 'MAX': return values.length > 0 ? String(Math.max(...values)) : '0'
      case 'COUNT': return String(values.filter(v => v !== 0).length)
      default: return _match
    }
  })
}

/** Collect numeric values from a formula argument (single ref or range). */
function collectFormulaValues(argStr: string, data: TableData): number[] | null {
  const trimmed = argStr.trim()
  // Try range first
  const range = parseRangeRef(trimmed)
  if (range !== null) {
    const values: number[] = []
    for (let r = range.r1; r <= range.r2; r++) {
      for (let c = range.c1; c <= range.c2; c++) {
        const cell = getCell(data, r, c)
        if (cell !== null) {
          const num = parseFloat(cell.content)
          values.push(Number.isFinite(num) ? num : 0)
        }
      }
    }
    return values
  }
  // Try comma-separated refs
  const refs = trimmed.split(',')
  const values: number[] = []
  for (const ref of refs) {
    const parsed = parseCellRef(ref.trim())
    if (parsed === null) return null
    const cell = getCell(data, parsed.row, parsed.col)
    if (cell !== null) {
      const num = parseFloat(cell.content)
      values.push(Number.isFinite(num) ? num : 0)
    }
  }
  return values
}

// ── Hit testing ──────────────────────────────────────────────────

/** Find which cell is at a local (relative to table origin) coordinate. */
export function hitTestCell(
  data: TableData,
  localX: number,
  localY: number,
  tableWidth: number,
): { row: number; col: number } | null {
  const colLefts = getColumnLefts(data, tableWidth)
  const rowTops = getRowTops(data)
  let col = -1
  for (let c = 0; c < data.cols; c++) {
    if (localX >= colLefts[c]! && localX < colLefts[c + 1]!) {
      col = c
      break
    }
  }
  let row = -1
  for (let r = 0; r < data.rows; r++) {
    if (localY >= rowTops[r]! && localY < rowTops[r + 1]!) {
      row = r
      break
    }
  }
  if (row < 0 || col < 0) return null
  return { row, col }
}

/** Hit test column border for resize. Returns the column index of the border (right edge of column colIndex-1). */
export function hitTestColumnBorder(
  data: TableData,
  localX: number,
  tableWidth: number,
  tolerance: number = 4,
): number | null {
  const colLefts = getColumnLefts(data, tableWidth)
  for (let c = 1; c < colLefts.length - 1; c++) {
    if (Math.abs(localX - colLefts[c]!) <= tolerance) return c
  }
  return null
}

/** Hit test row border for resize. Returns the row index of the border (bottom edge of row rowIndex-1). */
export function hitTestRowBorder(
  data: TableData,
  localY: number,
  tolerance: number = 4,
): number | null {
  const rowTops = getRowTops(data)
  for (let r = 1; r < rowTops.length - 1; r++) {
    if (Math.abs(localY - rowTops[r]!) <= tolerance) return r
  }
  return null
}

// ── Cell address helpers ─────────────────────────────────────────

/** Convert (row, col) to cell reference string like "A1". */
export function cellAddress(row: number, col: number): string {
  return `${colLetter(col)}${row + 1}`
}

// ── Effective border resolution ──────────────────────────────────

/** Get the effective border for a cell edge, considering per-cell overrides and default. */
export function getEffectiveBorder(
  cell: TableCell,
  edge: 'top' | 'right' | 'bottom' | 'left',
  defaultBorder: CellBorderStyle,
): CellBorderStyle {
  switch (edge) {
    case 'top': return cell.styles.borderTop ?? defaultBorder
    case 'right': return cell.styles.borderRight ?? defaultBorder
    case 'bottom': return cell.styles.borderBottom ?? defaultBorder
    case 'left': return cell.styles.borderLeft ?? defaultBorder
  }
}

// ── Table-level style helpers ────────────────────────────────────

/** Apply a background color to all cells in a row. */
export function setRowBackground(data: TableData, rowIndex: number, color: string): void {
  for (const cell of data.cells) {
    if (cell.row === rowIndex) {
      cell.styles.background = color
    }
  }
}

/** Apply a background color to all cells in a column. */
export function setColumnBackground(data: TableData, colIndex: number, color: string): void {
  for (const cell of data.cells) {
    if (cell.col === colIndex) {
      cell.styles.background = color
    }
  }
}

/** Apply alternating row shading. */
export function applyStriping(data: TableData, evenColor: string, oddColor: string): void {
  for (const cell of data.cells) {
    cell.styles.background = cell.row % 2 === 0 ? evenColor : oddColor
  }
}

// ── Navigation helpers ───────────────────────────────────────────

/** Get the next cell position when pressing Tab. */
export function nextCellTab(data: TableData, row: number, col: number): { row: number; col: number } {
  let c = col + 1
  let r = row
  if (c >= data.cols) {
    c = 0
    r++
  }
  if (r >= data.rows) {
    // Wrap to start
    r = 0
    c = 0
  }
  // Skip covered cells
  const anchor = getAnchorCell(data, r, c)
  if (anchor !== null && (anchor.row !== r || anchor.col !== c)) {
    return nextCellTab(data, anchor.row, anchor.col)
  }
  return { row: r, col: c }
}

/** Get the previous cell position when pressing Shift+Tab. */
export function prevCellTab(data: TableData, row: number, col: number): { row: number; col: number } {
  let c = col - 1
  let r = row
  if (c < 0) {
    c = data.cols - 1
    r--
  }
  if (r < 0) {
    r = data.rows - 1
    c = data.cols - 1
  }
  const anchor = getAnchorCell(data, r, c)
  if (anchor !== null && (anchor.row !== r || anchor.col !== c)) {
    return { row: anchor.row, col: anchor.col }
  }
  return { row: r, col: c }
}

// ── Export helpers ────────────────────────────────────────────────

/** Build HTML <table> string for email/HTML export. */
export function buildTableHtml(
  data: TableData,
  tableWidth: number,
  defaultBorder: CellBorderStyle,
  resolveVars: (s: string) => string,
  options?: {
    striped?: boolean
    stripeColor?: string
    headerRows?: number
  },
): string {
  const colPixelWidths = data.colWidths.map(f => Math.round(f * tableWidth))
  const visitedCells = new Set<string>()
  const parts: string[] = []

  parts.push(`<table role="presentation" width="${Math.round(tableWidth)}" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:${Math.round(tableWidth)}px;">`)

  // Colgroup for widths
  parts.push('<colgroup>')
  for (const w of colPixelWidths) {
    parts.push(`<col width="${w}" style="width:${w}px;">`)
  }
  parts.push('</colgroup>')

  for (let r = 0; r < data.rows; r++) {
    const rowH = Math.round(data.rowHeights[r]!)
    parts.push(`<tr style="height:${rowH}px;">`)
    for (let c = 0; c < data.cols; c++) {
      const key = cellKey(r, c)
      if (visitedCells.has(key)) continue
      const cell = getCell(data, r, c)
      if (cell === null) continue
      // If this is a covered position, skip
      if (cell.row !== r || cell.col !== c) {
        visitedCells.add(key)
        continue
      }
      // Mark all positions this cell covers
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          visitedCells.add(cellKey(r + dr, c + dc))
        }
      }
      const border = (edge: 'top' | 'right' | 'bottom' | 'left') => {
        const b = getEffectiveBorder(cell, edge, defaultBorder)
        return b.style === 'none' ? 'none' : `${b.width}px ${b.style} ${b.color}`
      }
      const isStripeRow = (options?.striped ?? false) && r % 2 === 1
      const bg = cell.styles.background ?? (isStripeRow ? (options?.stripeColor ?? '#f5f7f9') : '')
      const bgCss = bg.length > 0 ? `background-color:${bg};` : ''
      const padding = cell.styles.padding ?? DEFAULT_CELL_PADDING
      const hAlign = cell.styles.hAlign ?? 'left'
      const vAlign = cell.styles.vAlign ?? 'top'
      const fontSize = cell.styles.fontSize ?? 14
      const fontWeight = cell.styles.fontWeight ?? 400
      const fontFamily = cell.styles.fontFamily ?? "'Avenir Next','Segoe UI',sans-serif"
      const color = cell.styles.color ?? '#354a5a'

      const content = resolveVars(evaluateFormulas(cell.content, data))
      const htmlContent = content.replace(/\n/g, '<br>').length > 0 ? content.replace(/\n/g, '<br>') : '&nbsp;'

      let cellWidth = 0
      for (let dc = 0; dc < cell.colspan; dc++) cellWidth += colPixelWidths[c + dc]!

      const tdAttrs = [
        cell.colspan > 1 ? `colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : '',
        `width="${cellWidth}"`,
        `style="width:${cellWidth}px;padding:${padding}px;border-top:${border('top')};border-right:${border('right')};border-bottom:${border('bottom')};border-left:${border('left')};${bgCss}text-align:${hAlign};vertical-align:${vAlign};font-family:${fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};color:${color};mso-line-height-rule:exactly;word-wrap:break-word;word-break:break-word;"`,
      ].filter(Boolean).join(' ')

      parts.push(`<td ${tdAttrs}>${htmlContent}</td>`)
    }
    parts.push('</tr>')
  }
  parts.push('</table>')
  return parts.join('')
}

/** Build DOCX <w:tbl> XML for table export. */
export function buildTableDocxXml(
  data: TableData,
  tableWidth: number,
  defaultBorder: CellBorderStyle,
  resolveVars: (s: string) => string,
  escapeXmlFn: (s: string) => string,
): string {
  const colPixelWidths = data.colWidths.map(f => Math.round(f * tableWidth))
  const visitedCells = new Set<string>()
  const parts: string[] = []

  // Table properties
  const borderXml = (b: CellBorderStyle, tag: string) => {
    if (b.style === 'none') return `<${tag} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`
    const sz = Math.round(b.width * 8) // OOXML border size in eighths of a point
    const color = b.color.replace('#', '').toUpperCase() || 'C0C8D0'
    const val = b.style === 'dashed' ? 'dashed' : b.style === 'dotted' ? 'dotted' : 'single'
    return `<${tag} w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/>`
  }

  const tblWidthTwips = Math.round(tableWidth * 15)
  parts.push(`<w:tbl>`)
  parts.push(`<w:tblPr>`)
  parts.push(`<w:tblW w:w="${tblWidthTwips}" w:type="dxa"/>`)
  parts.push(`<w:tblBorders>`)
  parts.push(borderXml(defaultBorder, 'w:top'))
  parts.push(borderXml(defaultBorder, 'w:left'))
  parts.push(borderXml(defaultBorder, 'w:bottom'))
  parts.push(borderXml(defaultBorder, 'w:right'))
  parts.push(borderXml(defaultBorder, 'w:insideH'))
  parts.push(borderXml(defaultBorder, 'w:insideV'))
  parts.push(`</w:tblBorders>`)
  parts.push(`<w:tblLayout w:type="fixed"/>`)
  parts.push(`</w:tblPr>`)

  // Grid columns
  parts.push(`<w:tblGrid>`)
  for (const w of colPixelWidths) {
    parts.push(`<w:gridCol w:w="${Math.round(w * 15)}"/>`)
  }
  parts.push(`</w:tblGrid>`)

  for (let r = 0; r < data.rows; r++) {
    const rowH = Math.round(data.rowHeights[r]! * 15) // twips
    parts.push(`<w:tr>`)
    parts.push(`<w:trPr><w:trHeight w:val="${rowH}" w:hRule="atLeast"/>`)
    if (r < data.headerRows) parts.push(`<w:tblHeader/>`)
    parts.push(`</w:trPr>`)

    for (let c = 0; c < data.cols; c++) {
      const key = cellKey(r, c)
      if (visitedCells.has(key)) continue
      const cell = getCell(data, r, c)
      if (cell === null) continue
      if (cell.row !== r || cell.col !== c) {
        // Covered cell — emit continuation marker
        visitedCells.add(key)
        // DOCX requires <w:tc> entries for merged cells
        let cellWidthTwips = Math.round(colPixelWidths[c]! * 15)
        parts.push(`<w:tc><w:tcPr><w:tcW w:w="${cellWidthTwips}" w:type="dxa"/>`)
        if (cell.colspan > 1) parts.push(`<w:hMerge w:val="continue"/>`)
        if (cell.rowspan > 1) parts.push(`<w:vMerge w:val="continue"/>`)
        parts.push(`</w:tcPr><w:p/></w:tc>`)
        continue
      }

      // Mark all positions this cell covers
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          visitedCells.add(cellKey(r + dr, c + dc))
        }
      }

      let cellWidthTwips = 0
      for (let dc = 0; dc < cell.colspan; dc++) cellWidthTwips += Math.round(colPixelWidths[c + dc]! * 15)

      const content = resolveVars(evaluateFormulas(cell.content, data))
      const bg = cell.styles.background
      const bgXml = bg !== undefined ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg.replace('#', '').toUpperCase()}"/>` : ''

      parts.push(`<w:tc>`)
      parts.push(`<w:tcPr>`)
      parts.push(`<w:tcW w:w="${cellWidthTwips}" w:type="dxa"/>`)
      if (cell.colspan > 1) parts.push(`<w:hMerge w:val="restart"/>`)
      if (cell.rowspan > 1 && r === cell.row) parts.push(`<w:vMerge w:val="restart"/>`)
      if (bgXml.length > 0) parts.push(bgXml)
      parts.push(`</w:tcPr>`)

      const fontSize = cell.styles.fontSize ?? 14
      const fontWeight = cell.styles.fontWeight ?? 400
      const color = cell.styles.color ?? '354A5A'
      const docxColor = color.replace('#', '').toUpperCase()
      const halfPoints = Math.round(fontSize * 2)

      parts.push(`<w:p><w:pPr><w:jc w:val="${cell.styles.hAlign === 'center' ? 'center' : cell.styles.hAlign === 'right' ? 'right' : 'left'}"/></w:pPr>`)
      parts.push(`<w:r><w:rPr><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`)
      if (fontWeight >= 700) parts.push(`<w:b/>`)
      parts.push(`<w:color w:val="${docxColor}"/>`)
      parts.push(`</w:rPr>`)
      parts.push(`<w:t xml:space="preserve">${escapeXmlFn(content)}</w:t>`)
      parts.push(`</w:r></w:p>`)
      parts.push(`</w:tc>`)
    }
    parts.push(`</w:tr>`)
  }
  parts.push(`</w:tbl>`)
  return parts.join('')
}
