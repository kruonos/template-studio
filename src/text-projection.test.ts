import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { createCacheManager } from './cache-manager.ts'
import { asElementId } from './schema.ts'
import { createTableData, getCell } from './table-engine.ts'
import {
  getObstacleBandInterval,
  getPreparedRich,
  getRoundedObstacleInsetForBand,
  projectTableCellText,
  projectTextElement,
} from './text-projection.ts'
import type { CanvasElement, TableCell, TableData, WrapMode } from './schema.ts'

function createElement(overrides: Partial<CanvasElement> & Pick<CanvasElement, 'id' | 'type'>): CanvasElement {
  const element: CanvasElement = {
    id: typeof overrides.id === 'string' ? asElementId(overrides.id) : overrides.id,
    type: overrides.type,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 240,
    height: overrides.height ?? 160,
    content: overrides.content ?? '',
    styles: overrides.styles ?? {},
  }
  if (overrides.locked !== undefined) element.locked = overrides.locked
  return element
}

function createTextHooks(options: { obstacles?: CanvasElement[]; wrapMode?: WrapMode } = {}) {
  const cacheManager = createCacheManager()
  const obstacles = options.obstacles ?? []
  return {
    preparedCache: cacheManager.preparedCache,
    wrapMode: options.wrapMode ?? 'normal',
    resolveVariables: (text: string) => text.replaceAll('{{firstName}}', 'Ava'),
    getElementFontShorthand: (element: CanvasElement) => `${element.styles.fontStyle ?? 'normal'} ${element.styles.fontWeight ?? 400} ${element.styles.fontSize ?? 16}px ${element.styles.fontFamily ?? 'Test Sans'}`,
    getElementLineHeight: (element: CanvasElement) => Math.round((element.styles.fontSize ?? 16) * (element.styles.lineHeightMultiplier ?? 1.4)),
    getElementTextColor: (element: CanvasElement) => element.styles.color ?? '#111111',
    getOverlappingObstaclesForTextBox: (x: number, y: number, width: number, height: number, excludeElementId: string) => {
      return obstacles.filter(obstacle => obstacle.id !== excludeElementId && obstacle.x < x + width && obstacle.x + obstacle.width > x && obstacle.y < y + height && obstacle.y + obstacle.height > y)
    },
    getMascotSilhouetteInterval: () => null,
    getGifSilhouetteInterval: () => null,
  }
}

function createTableHooks(obstacles: CanvasElement[] = []) {
  const hooks = createTextHooks({ obstacles })
  return {
    ...hooks,
    getTableCellFontShorthand: (cell: TableCell) => `${cell.styles.fontStyle ?? 'normal'} ${cell.styles.fontWeight ?? 400} ${cell.styles.fontSize ?? 14}px ${cell.styles.fontFamily ?? 'Test Sans'}`,
    getTableCellLineHeight: (cell: TableCell) => Math.round((cell.styles.fontSize ?? 14) * 1.4),
    getTableCellTextColor: (cell: TableCell) => cell.styles.color ?? '#111111',
  }
}

describe('text projection', () => {
  test('reuses prepared rich text entries for identical cache keys', () => {
    const cacheManager = createCacheManager()
    const alpha = getPreparedRich('Alpha Beta', '400 16px Test Sans', 'normal', 'normal', cacheManager.preparedCache)
    const beta = getPreparedRich('Alpha Beta', '400 16px Test Sans', 'normal', 'normal', cacheManager.preparedCache)
    const keepAll = getPreparedRich('Alpha Beta', '400 16px Test Sans', 'normal', 'keep-all', cacheManager.preparedCache)

    expect(alpha).toBe(beta)
    expect(keepAll).not.toBe(alpha)
  })

  test('projects ordinary text blocks with pre-wrap content on the fast path', () => {
    const element = createElement({
      id: asElementId('text-fast'),
      type: 'text',
      width: 240,
      height: 120,
      content: 'Hello\n{{firstName}}',
      styles: { fontSize: 16 },
    })

    const projection = projectTextElement(element, createTextHooks())

    expect(projection.lines.map(line => line.text)).toEqual(['Hello', 'Ava'])
    expect(projection.truncated).toBe(false)
  })

  test('strict wrapping skips obstacle bands that are too narrow', () => {
    const obstacle = createElement({ id: asElementId('obstacle'), type: 'image', x: 60, y: 0, width: 120, height: 60, content: '' })
    const text = createElement({
      id: asElementId('text-obstacle'),
      type: 'text',
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      content: 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta',
      styles: { fontSize: 16 },
    })

    const projection = projectTextElement(text, createTextHooks({ obstacles: [obstacle], wrapMode: 'strict' }))

    expect(projection.lines[0]?.y).toBeGreaterThanOrEqual(60)
  })

  test('rounded obstacles expose a tighter band interval than rectangles', () => {
    const text = createElement({ id: asElementId('text-rounded'), type: 'text', x: 0, y: 0, width: 240, height: 180, content: 'Alpha' })
    const obstacle = createElement({
      id: asElementId('image-rounded'),
      type: 'image',
      x: 60,
      y: 20,
      width: 80,
      height: 80,
      content: '',
      styles: { borderRadius: 40 },
    })

    const inset = getRoundedObstacleInsetForBand(obstacle, 20, 34)
    const interval = getObstacleBandInterval(text, obstacle, 20, 34, text.width - 24, 12)

    expect(inset).toBeGreaterThan(0)
    expect(interval?.left).toBeGreaterThan(60)
    expect(interval?.right).toBeLessThan(140)
  })

  test('keeps bidi and mixed-script content contiguous across wrapped lines', () => {
    const element = createElement({
      id: asElementId('text-bidi'),
      type: 'text',
      width: 160,
      height: 180,
      content: 'Alpha مرحبا 123 Beta',
      styles: { fontSize: 16 },
    })

    const projection = projectTextElement(element, createTextHooks())
    const stitched = projection.lines.map(line => line.text).join(' ').replace(/\s+/g, ' ').trim()

    expect(stitched).toContain('مرحبا')
    expect(stitched).toContain('Alpha')
    expect(stitched).toContain('Beta')
  })

  test('projects table cell text with bottom alignment', () => {
    const data: TableData = createTableData(1, 1, 180, 80)
    const cell = getCell(data, 0, 0)!
    cell.content = 'Bottom aligned text'
    cell.styles.vAlign = 'bottom'
    cell.styles.fontSize = 14
    const projection = projectTableCellText(cell.content, cell, 0, 0, 180, 100, 8, 'table-1', createTableHooks())

    expect(projection.lines.length).toBeGreaterThan(0)
    expect(projection.lines[0]!.y).toBeGreaterThan(8)
  })
})
