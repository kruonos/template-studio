import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { buildDocxBlob } from './docx-export.ts'
import { asElementId, DOCX_MIME, type CanvasElement, type ExportSnapshot } from './schema.ts'

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

describe('docx export', () => {
  test('uses positioned Word shapes instead of full-page screenshots', async () => {
    const textElement = createElement({
      id: asElementId('text-1'),
      type: 'text',
      x: 40,
      y: 40,
      width: 240,
      height: 80,
      content: 'Editable text',
      styles: {},
    })
    const snapshot: ExportSnapshot = {
      templateName: 'DOCX Layout',
      description: '',
      canvasWidth: 420,
      pageHeight: 540,
      pageMargin: 24,
      canvasHeight: 540,
      pageCount: 1,
      surfaceTheme: 'light',
      wrapMode: 'normal',
      paperSizeId: 'letter-portrait',
      pages: [{
        pageIndex: 0,
        items: [{
          kind: 'text-line',
          elementId: textElement.id,
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
          color: '#111111',
          textDecoration: 'none',
          letterSpacing: 0,
          opacity: 1,
        }],
      }],
    }

    const blob = await buildDocxBlob(snapshot, {
      resolveVariables: text => text,
      escapeXml: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
      getElementFontFamily: element => element.styles.fontFamily ?? 'Arial, sans-serif',
      getElementFontSize: element => element.styles.fontSize ?? 16,
      getButtonHref: () => null,
      getImageSource: () => null,
      getAnimatedGifSource: () => null,
      getMascotSource: () => '',
      getVideoHref: () => null,
      buildFlowBlocksOptions: {
        elements: [textElement],
        pageHeight: snapshot.pageHeight,
        pageCount: snapshot.pageCount,
        resolveVariables: text => text,
        getButtonHref: () => null,
        getImageSource: () => null,
        getAnimatedGifSource: () => null,
        getMascotSource: () => '',
        getVideoHref: () => null,
      },
    }, DOCX_MIME)

    const bytes = new TextDecoder().decode(await blob.arrayBuffer())
    expect(bytes).toContain('<v:shape')
    expect(bytes).toContain('Editable text')
    expect(bytes).not.toContain('page-1.png')
  })
})
