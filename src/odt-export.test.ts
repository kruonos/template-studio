import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { buildOdtBlob } from './odt-export.ts'
import { asElementId, ODT_MIME, type CanvasElement, type ExportSnapshot, type TableData } from './schema.ts'

function createElement(overrides: Partial<CanvasElement> & Pick<CanvasElement, 'id' | 'type'>): CanvasElement {
  return {
    id: typeof overrides.id === 'string' ? asElementId(overrides.id) : overrides.id,
    type: overrides.type,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    styles: overrides.styles ?? {},
  }
}

describe('odt export', () => {
  test('packages editable Word-compatible ODT content with text frames and real tables', async () => {
    const tableData: TableData = {
      rows: 2,
      cols: 2,
      colWidths: [0.5, 0.5],
      rowHeights: [32, 32],
      headerRows: 1,
      defaultBorder: { width: 1, style: 'solid', color: '#c9d3dc' },
      cells: [
        { row: 0, col: 0, rowspan: 1, colspan: 1, content: 'Metric', styles: { background: '#dbecea', color: '#17384f', fontWeight: 700 } },
        { row: 0, col: 1, rowspan: 1, colspan: 1, content: 'Value', styles: { background: '#dbecea', color: '#17384f', fontWeight: 700 } },
        { row: 1, col: 0, rowspan: 1, colspan: 1, content: 'Exports', styles: { background: '#0f1f2b', color: '#cad9e5' } },
        { row: 1, col: 1, rowspan: 1, colspan: 1, content: 'Ready', styles: { background: '#0f1f2b', color: '#cad9e5' } },
      ],
    }
    const tableElement = createElement({
      id: asElementId('table-1'),
      type: 'table',
      x: 40,
      y: 120,
      width: 320,
      height: 80,
      content: JSON.stringify(tableData),
    })
    const snapshot: ExportSnapshot = {
      templateName: 'ODT Layout',
      description: '',
      canvasWidth: 420,
      pageHeight: 540,
      pageMargin: 24,
      canvasHeight: 540,
      pageCount: 1,
      surfaceTheme: 'dark',
      wrapMode: 'normal',
      paperSizeId: 'letter-portrait',
      pages: [{
        pageIndex: 0,
        items: [{
          kind: 'text-line',
          elementId: asElementId('text-1'),
          elementType: 'text',
          pageIndex: 0,
          x: 40,
          y: 42,
          width: 92,
          slotWidth: 240,
          height: 22,
          text: 'Editable text',
          font: '400 16px Arial, sans-serif',
          fontFamily: 'Arial, sans-serif',
          fontSize: 16,
          fontWeight: 400,
          fontStyle: 'normal',
          lineHeight: 22,
          color: '#cad9e5',
          textDecoration: 'none',
          letterSpacing: 0,
          opacity: 1,
        }, {
          kind: 'block',
          element: tableElement,
          pageIndex: 0,
          y: tableElement.y,
        }],
      }],
    }

    const blob = await buildOdtBlob(snapshot, {
      resolveVariables: text => text,
      getElementFontFamily: element => element.styles.fontFamily ?? 'Arial, sans-serif',
      getElementFontSize: element => element.styles.fontSize ?? 16,
      getButtonHref: () => null,
      getImageSource: () => null,
      getAnimatedGifSource: () => null,
      getMascotSource: () => '',
      getVideoHref: () => null,
    }, ODT_MIME)

    const bytes = new TextDecoder().decode(await blob.arrayBuffer())
    expect(blob.type).toBe(ODT_MIME)
    expect(bytes).toContain('mimetype')
    expect(bytes).toContain(ODT_MIME)
    expect(bytes).toContain('content.xml')
    expect(bytes).toContain('<office:document-content')
    expect(bytes).toContain('<draw:frame')
    expect(bytes).toContain('<table:table')
    expect(bytes).toContain('Editable text')
    expect(bytes).toContain('Exports')
    expect(bytes).not.toContain('page-1.png')
  })
})
