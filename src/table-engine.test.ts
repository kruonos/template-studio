import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { createTableData, evaluateFormulas, getCell, getCellRect, mergeCells } from './table-engine.ts'

describe('table engine', () => {
  test('evaluates range and explicit-reference formulas', () => {
    const data = createTableData(3, 3, 300, 32)
    getCell(data, 0, 0)!.content = '2'
    getCell(data, 1, 0)!.content = '4'
    getCell(data, 2, 0)!.content = '6'

    expect(evaluateFormulas('{{=SUM(A1:A3)}}', data)).toBe('12')
    expect(evaluateFormulas('{{=AVG(A1,A2,A3)}}', data)).toBe('4')
    expect(evaluateFormulas('{{=COUNT(A1:A3)}}', data)).toBe('3')
  })

  test('merged cell geometry resolves through anchor cells', () => {
    const data = createTableData(3, 3, 300, 32)
    expect(mergeCells(data, 0, 0, 1, 1)).toBe(true)

    const anchor = getCell(data, 1, 1)
    const rect = getCellRect(data, anchor!, 300)

    expect(anchor?.row).toBe(0)
    expect(anchor?.col).toBe(0)
    expect(anchor?.rowspan).toBe(2)
    expect(anchor?.colspan).toBe(2)
    expect(rect.width).toBeCloseTo(200)
    expect(rect.height).toBe(64)
  })
})
