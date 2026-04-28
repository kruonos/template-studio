import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { buildEmailHtmlWithFallback, buildMjmlWrapperSource, extractBodyHtml } from './export-controller.ts'
import type { ExportSnapshot } from './schema.ts'

const snapshot: ExportSnapshot = {
  templateName: 'Consistency Check',
  description: '',
  canvasWidth: 720,
  pageHeight: 980,
  pageMargin: 40,
  canvasHeight: 980,
  pageCount: 1,
  surfaceTheme: 'light',
  wrapMode: 'normal',
  paperSizeId: 'email',
  pages: [{ pageIndex: 0, items: [] }],
}

describe('export controller', () => {
  test('extracts body markup from a full legacy email document', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><table><tr><td>Alpha</td></tr></table></body></html>'
    const body = extractBodyHtml(html)
    expect(body).toContain('<table')
    expect(body).toContain('Alpha')
  })

  test('builds an mjml wrapper around legacy email markup', () => {
    const source = buildMjmlWrapperSource(snapshot, 480, '<table><tr><td>Alpha</td></tr></table>')
    expect(source).toContain('<mj-breakpoint width="480px" />')
    expect(source).toContain('<mj-raw><table><tr><td>Alpha</td></tr></table></mj-raw>')
  })

  test('compiles consistent email html from the legacy body when mjml succeeds', async () => {
    const result = await buildEmailHtmlWithFallback({
      snapshot,
      breakpoint: 480,
      resolveVariables: text => text,
      getElementFontFamily: () => 'Arial, sans-serif',
      getElementFontSize: () => 16,
      getElementFontWeight: () => 400,
      buildLegacyHtml: () => '<!doctype html><html><body><table><tr><td>Alpha</td></tr></table></body></html>',
    })

    expect(result.format).toBe('mjml')
    expect(result.html).toContain('Alpha')
  })
})
