import './test-setup.ts'
import { describe, expect, test } from 'vitest'

import {
  bandToTableRow,
  buildLegacyEmailHtml,
  buildLegacyEmailHtmlDetailed,
  buildEmailTableGrid,
  elementToCell,
  sliceToBands,
  type EmailExportHooks,
  type EmailRenderableElement,
} from './email-export.ts'
import type {
  CanvasElement,
  ElementId,
  ExportSnapshot,
  ExportSnapshotBlockItem,
  ExportSnapshotTextItem,
} from './schema.ts'
import { asElementId } from './schema.ts'

function createElement(overrides: Partial<CanvasElement> & Pick<CanvasElement, 'id' | 'type'>): CanvasElement {
  const element: CanvasElement = {
    id: typeof overrides.id === 'string' ? asElementId(overrides.id) : overrides.id,
    type: overrides.type,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    styles: overrides.styles ?? {},
  }
  if (overrides.locked !== undefined) element.locked = overrides.locked
  return element
}

function createBlockItem(element: CanvasElement): ExportSnapshotBlockItem {
  return {
    kind: 'block',
    element,
    pageIndex: 0,
    y: element.y,
  }
}

function createTextLine(
  elementId: ElementId,
  text: string,
  x: number,
  y: number,
  width: number,
  slotWidth: number,
): ExportSnapshotTextItem {
  return {
    kind: 'text-line',
    elementId,
    elementType: 'text',
    pageIndex: 0,
    x,
    y,
    width,
    slotWidth,
    height: 24,
    text,
    font: '400 16px Arial, sans-serif',
    fontFamily: 'Arial, sans-serif',
    fontSize: 16,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: 24,
    color: '#111111',
    textDecoration: 'none',
    letterSpacing: 0,
    opacity: 1,
  }
}

function createRenderableElement(overrides: Partial<EmailRenderableElement> & Pick<EmailRenderableElement, 'id' | 'sourceId' | 'type'>): EmailRenderableElement {
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    type: overrides.type,
    pageIndex: overrides.pageIndex ?? 0,
    order: overrides.order ?? 0,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    colStart: overrides.colStart ?? 0,
    colSpan: overrides.colSpan ?? 1,
    startBand: overrides.startBand ?? 0,
    rowSpan: overrides.rowSpan ?? 1,
    topOffset: overrides.topOffset ?? 0,
    blockItem: overrides.blockItem ?? null,
    textLines: overrides.textLines ?? [],
    element: overrides.element ?? null,
  }
}

function createHooks(
  elements: CanvasElement[],
  overrides: Partial<Pick<EmailExportHooks, 'getResolvedTableCellContent' | 'getTableCellRenderState'>> = {},
): EmailExportHooks {
  const hooks: EmailExportHooks = {
    resolveVariables: text => text,
    getElementFontFamily: element => element.styles.fontFamily ?? 'Arial, sans-serif',
    getElementFontSize: element => element.styles.fontSize ?? 16,
    getElementFontWeight: element => element.styles.fontWeight ?? 400,
    getButtonHref: element => element.styles.href ?? null,
    getVideoHref: element => element.styles.href ?? null,
    getImageSource: element => element.content || null,
    getAnimatedGifSource: element => element.content || null,
    getMascotSource: element => element.content,
    buildFlowBlocksOptions: {
      elements,
      pageHeight: 200,
      pageCount: 1,
      resolveVariables: text => text,
      getButtonHref: element => element.styles.href ?? null,
      getImageSource: element => element.content || null,
      getAnimatedGifSource: element => element.content || null,
      getMascotSource: element => element.content,
      getVideoHref: element => element.styles.href ?? null,
    },
  }
  if (overrides.getResolvedTableCellContent !== undefined) hooks.getResolvedTableCellContent = overrides.getResolvedTableCellContent
  if (overrides.getTableCellRenderState !== undefined) hooks.getTableCellRenderState = overrides.getTableCellRenderState
  return hooks
}

describe('email export slicing', () => {
  test('sliceToBands assigns rowSpan for tall elements', () => {
    const image = createElement({ id: asElementId('hero'), type: 'image', x: 100, y: 20, width: 160, height: 120, content: 'https://example.com/hero.png' })
    const grid = buildEmailTableGrid([{ x: 100, width: 160 }], 400)
    const renderable = createRenderableElement({
      id: image.id,
      sourceId: image.id,
      type: image.type,
      x: 100,
      y: 20,
      width: 160,
      height: 120,
      colStart: 1,
      colSpan: 1,
      startBand: 0,
      rowSpan: 3,
      topOffset: 20,
      blockItem: createBlockItem(image),
      element: image,
    })

    const bands = sliceToBands([renderable], 200, 50)

    expect(bands).toHaveLength(4)
    expect(bands[0]?.cells).toHaveLength(1)
    expect(bands[0]?.cells[0]?.rowSpan).toBe(3)
    expect(bands[0]?.cells[0]?.topOffset).toBe(20)
    expect(grid.boundaries).toEqual([0, 100, 260, 400])
  })

  test('bandToTableRow emits spacer cells and rowspan', () => {
    const button = createElement({ id: asElementId('cta'), type: 'button', x: 120, y: 0, width: 140, height: 80, content: 'Click', styles: { href: 'https://example.com' } })
    const renderable = createRenderableElement({
      id: button.id,
      sourceId: button.id,
      type: button.type,
      x: 120,
      y: 0,
      width: 140,
      height: 80,
      colStart: 1,
      colSpan: 1,
      startBand: 0,
      rowSpan: 2,
      topOffset: 0,
      blockItem: createBlockItem(button),
      element: button,
    })
    const grid = buildEmailTableGrid([{ x: 120, width: 140 }], 400)
    const bands = sliceToBands([renderable], 200, 50)
    const occupancy = [
      [null, 'cta', null],
      [null, 'cta', null],
      [null, null, null],
      [null, null, null],
    ]

    const html = bandToTableRow(bands[0]!, {
      grid,
      occupancy,
      palette: {
        pageBackground: '#fffdf8',
        workbenchBackground: '#ece7df',
        heading: '#1a2b3a',
        body: '#354a5a',
        divider: 'rgba(13, 33, 48, 0.2)',
        buttonBackground: '#17384f',
        buttonText: '#f8fffd',
        exportFrame: '#f2f2ef',
      },
      surfaceTheme: 'light',
      warningSink: { warnings: [], seen: new Set() },
      hooks: createHooks([button]),
    })

    expect(html).toContain('rowspan="2"')
    expect(html).toContain('width="120"')
    expect(html).toContain('width="140"')
    expect(html).toContain('v:roundrect')
  })

  test('buildLegacyEmailHtml renders sliced rows with pretext lines and ignores mascots', () => {
    const textElement = createElement({ id: asElementId('text-1'), type: 'text', x: 80, y: 30, width: 220, height: 80, content: 'Alpha Beta' })
    const imageElement = createElement({ id: asElementId('image-1'), type: 'image', x: 340, y: 50, width: 120, height: 100, content: 'https://example.com/image.png' })
    const mascotElement = createElement({ id: asElementId('mascot-1'), type: 'mascot', x: 20, y: 20, width: 40, height: 40, content: 'ignored' })

    const snapshot: ExportSnapshot = {
      templateName: 'Sliced Email',
      description: '',
      canvasWidth: 500,
      pageHeight: 200,
      pageMargin: 20,
      canvasHeight: 200,
      pageCount: 1,
      surfaceTheme: 'light',
      wrapMode: 'freedom',
      paperSizeId: 'email',
      pages: [{
        pageIndex: 0,
        items: [
          createBlockItem(imageElement),
          createBlockItem(mascotElement),
          createTextLine(asElementId('text-1'), 'Alpha', 80, 30, 60, 220),
          createTextLine(asElementId('text-1'), 'Beta', 80, 54, 52, 220),
        ],
      }],
    }

    const html = buildLegacyEmailHtml(snapshot, createHooks([textElement, imageElement, mascotElement]))

    expect(html).toContain('<colgroup>')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
    expect(html).toContain('https://example.com/image.png')
    expect(html).not.toContain('src="ignored"')
    expect(html).toContain('rowspan="2"')
  })

  test('buildLegacyEmailHtml keeps same-row text fragments side by side', () => {
    const textElement = createElement({ id: asElementId('text-2'), type: 'text', x: 40, y: 20, width: 260, height: 80, content: 'Left Right' })
    const snapshot: ExportSnapshot = {
      templateName: 'Fragments',
      description: '',
      canvasWidth: 320,
      pageHeight: 140,
      pageMargin: 20,
      canvasHeight: 140,
      pageCount: 1,
      surfaceTheme: 'light',
      wrapMode: 'freedom',
      paperSizeId: 'email',
      pages: [{
        pageIndex: 0,
        items: [
          createTextLine(asElementId('text-2'), 'Left', 40, 20, 30, 80),
          createTextLine(asElementId('text-2'), 'Right', 160, 20, 42, 100),
        ],
      }],
    }

    const html = buildLegacyEmailHtml(snapshot, createHooks([textElement]))

    expect(html).toContain('Left</td><td width="40"')
    expect(html).toContain('Right')
  })

  test('button export uses the same reduced label size as canvas rendering', () => {
    const button = createElement({
      id: asElementId('cta-size'),
      type: 'button',
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      content: 'Click',
      styles: { href: 'https://example.com', fontSize: 20, fontWeight: 700 },
    })
    const html = elementToCell({
      element: createRenderableElement({
        id: button.id,
        sourceId: button.id,
        type: button.type,
        width: button.width,
        height: button.height,
        blockItem: createBlockItem(button),
        element: button,
      }),
      startColumn: 0,
      colSpan: 1,
      rowSpan: 1,
      x: 0,
      width: button.width,
      topOffset: 0,
    }, button.width, {
      palette: {
        pageBackground: '#fffdf8',
        workbenchBackground: '#ece7df',
        heading: '#1a2b3a',
        body: '#354a5a',
        divider: 'rgba(13, 33, 48, 0.2)',
        buttonBackground: '#17384f',
        buttonText: '#f8fffd',
        exportFrame: '#f2f2ef',
      },
      surfaceTheme: 'light',
      warningSink: { warnings: [], seen: new Set() },
      hooks: createHooks([button]),
    })

    expect(html).toContain('font-size:18px')
  })

  test('table export uses projected Pretext cell lines when available', () => {
    const tableElement = createElement({
      id: asElementId('table-1'),
      type: 'table',
      x: 0,
      y: 0,
      width: 160,
      height: 60,
      content: JSON.stringify({
        rows: 1,
        cols: 1,
        colWidths: [1],
        rowHeights: [40],
        cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, content: 'ignored', styles: {} }],
        headerRows: 0,
        defaultBorder: { width: 1, color: '#c0c8d0', style: 'solid' },
      }),
    })

    const html = elementToCell({
      element: createRenderableElement({
        id: tableElement.id,
        sourceId: tableElement.id,
        type: tableElement.type,
        width: tableElement.width,
        height: tableElement.height,
        blockItem: createBlockItem(tableElement),
        element: tableElement,
      }),
      startColumn: 0,
      colSpan: 1,
      rowSpan: 1,
      x: 0,
      width: tableElement.width,
      topOffset: 0,
    }, tableElement.width, {
      palette: {
        pageBackground: '#fffdf8',
        workbenchBackground: '#ece7df',
        heading: '#1a2b3a',
        body: '#354a5a',
        divider: 'rgba(13, 33, 48, 0.2)',
        buttonBackground: '#17384f',
        buttonText: '#f8fffd',
        exportFrame: '#f2f2ef',
      },
      surfaceTheme: 'light',
      warningSink: { warnings: [], seen: new Set() },
      hooks: createHooks([tableElement], {
        getResolvedTableCellContent: () => 'ignored',
        getTableCellRenderState: () => ({
          rect: { x: 0, y: 0, width: 160, height: 40 },
          padding: 8,
          bg: '#f5f7f9',
          borderTop: { width: 1, color: '#c0c8d0', style: 'solid' },
          borderRight: { width: 1, color: '#c0c8d0', style: 'solid' },
          borderBottom: { width: 1, color: '#c0c8d0', style: 'solid' },
          borderLeft: { width: 1, color: '#c0c8d0', style: 'solid' },
          projection: {
            lines: [
              { x: 8, y: 8, text: 'Cell A', width: 34, slotWidth: 48 },
              { x: 84, y: 8, text: 'Cell B', width: 34, slotWidth: 48 },
            ],
            font: '400 13px Arial, sans-serif',
            lineHeight: 18,
            color: '#354a5a',
            textDecoration: 'none',
            truncated: false,
          },
        }),
      }),
    })

    expect(html).toContain('Cell A')
    expect(html).toContain('Cell B')
    expect(html).toContain('background-color:#f5f7f9')
  })

  test('detailed export surfaces overlap and malformed table warnings', () => {
    const imageElement = createElement({ id: asElementId('image-overlap'), type: 'image', x: 60, y: 20, width: 120, height: 80, content: 'https://example.com/a.png' })
    const buttonElement = createElement({ id: asElementId('button-overlap'), type: 'button', x: 80, y: 30, width: 120, height: 40, content: 'Go', styles: { href: 'https://example.com' } })
    const brokenTable = createElement({ id: asElementId('table-bad'), type: 'table', x: 20, y: 120, width: 160, height: 60, content: '{broken json' })

    const snapshot: ExportSnapshot = {
      templateName: 'Warnings',
      description: '',
      canvasWidth: 320,
      pageHeight: 220,
      pageMargin: 20,
      canvasHeight: 220,
      pageCount: 1,
      surfaceTheme: 'light',
      wrapMode: 'freedom',
      paperSizeId: 'email',
      pages: [{
        pageIndex: 0,
        items: [createBlockItem(imageElement), createBlockItem(buttonElement), createBlockItem(brokenTable)],
      }],
    }

    const result = buildLegacyEmailHtmlDetailed(snapshot, createHooks([imageElement, buttonElement, brokenTable]))

    expect(result.warnings.some(warning => warning.code === 'overlap-dropped')).toBe(true)
    expect(result.warnings.some(warning => warning.code === 'invalid-table-data')).toBe(true)
    expect(result.html).toContain('Pretext email export warnings')
  })
})
