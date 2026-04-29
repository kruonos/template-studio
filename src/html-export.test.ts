import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { buildAbsoluteHtmlDocument } from './html-export.ts'
import { asElementId } from './schema.ts'
import type { CanvasElement, ExportSnapshot } from './schema.ts'

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

describe('html export', () => {
  test('keeps button typography and rounded media aligned with canvas defaults', () => {
    const image = createElement({ id: asElementId('image-1'), type: 'image', x: 20, y: 20, width: 120, height: 80, content: 'https://example.com/image.png', styles: { borderRadius: 24 } })
    const gif = createElement({ id: asElementId('gif-1'), type: 'animated-gif', x: 160, y: 20, width: 120, height: 80, content: 'https://example.com/anim.gif', styles: { borderRadius: 18 } })
    const button = createElement({ id: asElementId('button-1'), type: 'button', x: 20, y: 120, width: 180, height: 56, content: 'Book now', styles: { fontSize: 20, fontWeight: 700, fontStyle: 'italic', borderRadius: 999, href: 'https://example.com' } })

    const snapshot: ExportSnapshot = {
      templateName: 'HTML Consistency',
      description: '',
      canvasWidth: 320,
      pageHeight: 240,
      pageMargin: 20,
      canvasHeight: 240,
      pageCount: 1,
      surfaceTheme: 'light',
      wrapMode: 'normal',
      paperSizeId: 'email',
      pages: [{
        pageIndex: 0,
        items: [
          { kind: 'block', element: image, pageIndex: 0, y: image.y },
          { kind: 'block', element: gif, pageIndex: 0, y: gif.y },
          { kind: 'block', element: button, pageIndex: 0, y: button.y },
        ],
      }],
    }

    const html = buildAbsoluteHtmlDocument(snapshot, { paged: true, autoPrint: false }, {
      resolveVariables: text => text,
      renderAbsoluteHtmlTableExport: () => '',
      getButtonHref: element => element.styles.href ?? null,
      getElementFontFamily: () => 'Arial, sans-serif',
      getElementFontSize: element => element.styles.fontSize ?? 16,
      getElementFontWeight: element => element.styles.fontWeight ?? 400,
      getImageSource: element => element.content || null,
      getAnimatedGifSource: element => element.content || null,
      getMascotSource: element => element.content,
      getVideoHref: element => element.styles.href ?? null,
      sanitizeHtml: htmlContent => htmlContent,
    })

    expect(html).toContain('font-size:18px')
    expect(html).toContain('font-style:italic')
    expect(html).toContain('border-radius:24px')
    expect(html).toContain('border-radius:18px')
  })

  test('renders paged table blocks with page-local coordinates', () => {
    const table = createElement({
      id: asElementId('table-1'),
      type: 'table',
      x: 40,
      y: 620,
      width: 200,
      height: 80,
      content: JSON.stringify({
        rows: 1,
        cols: 1,
        colWidths: [1],
        rowHeights: [40],
        cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, content: 'Visible', styles: {} }],
        headerRows: 0,
        defaultBorder: { width: 1, color: '#c0c8d0', style: 'solid' },
      }),
    })

    const snapshot: ExportSnapshot = {
      templateName: 'Paged Table',
      description: '',
      canvasWidth: 320,
      pageHeight: 500,
      pageMargin: 20,
      canvasHeight: 1000,
      pageCount: 2,
      surfaceTheme: 'light',
      wrapMode: 'normal',
      paperSizeId: 'letter-portrait',
      pages: [
        { pageIndex: 0, items: [] },
        { pageIndex: 1, items: [{ kind: 'block', element: table, pageIndex: 1, y: 120 }] },
      ],
    }

    const html = buildAbsoluteHtmlDocument(snapshot, { paged: true, autoPrint: false }, {
      resolveVariables: text => text,
      renderAbsoluteHtmlTableExport: (_element, _tableData, pageTop) => `<div data-table-y="${pageTop}"></div>`,
      getButtonHref: element => element.styles.href ?? null,
      getElementFontFamily: () => 'Arial, sans-serif',
      getElementFontSize: element => element.styles.fontSize ?? 16,
      getElementFontWeight: element => element.styles.fontWeight ?? 400,
      getImageSource: element => element.content || null,
      getAnimatedGifSource: element => element.content || null,
      getMascotSource: element => element.content,
      getVideoHref: element => element.styles.href ?? null,
      sanitizeHtml: htmlContent => htmlContent,
    })

    expect(html).toContain('data-table-y="120"')
    expect(html).not.toContain('data-table-y="620"')
  })
})
