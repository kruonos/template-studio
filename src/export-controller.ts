import type { CanvasElement, ExportSnapshot } from './schema.ts'
import { compileMjml } from './mjml-compiler.ts'

type BuildMjmlEmailOptions = {
  snapshot: ExportSnapshot
  breakpoint: number
  resolveVariables: (text: string) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  buildLegacyHtml: () => string
}

export type EmailHtmlResult = {
  html: string
  format: 'mjml' | 'legacy'
  warnings: string[]
}

export function extractBodyHtml(documentHtml: string): string {
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(documentHtml, 'text/html')
    return parsed.body.innerHTML.trim()
  }
  const match = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return match?.[1]?.trim() ?? documentHtml
}

export function buildMjmlWrapperSource(snapshot: ExportSnapshot, breakpoint: number, bodyHtml: string): string {
  return `<!doctype html>
<mjml>
  <mj-head>
    <mj-breakpoint width="${Math.round(breakpoint)}px" />
    <mj-preview>${snapshot.templateName}</mj-preview>
  </mj-head>
  <mj-body width="${Math.round(snapshot.canvasWidth)}px" background-color="#ffffff">
    <mj-section padding="0">
      <mj-column padding="0">
        <mj-raw>${bodyHtml}</mj-raw>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}

export function buildEmailHtmlWithFallback(options: BuildMjmlEmailOptions): EmailHtmlResult {
  const legacyHtml = options.buildLegacyHtml()
  try {
    const mjmlSource = buildMjmlWrapperSource(options.snapshot, options.breakpoint, extractBodyHtml(legacyHtml))
    const result = compileMjml(mjmlSource)
    return {
      html: result.html,
      format: 'mjml',
      warnings: result.warnings.map(warning => warning.formattedMessage ?? warning.message),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      html: legacyHtml,
      format: 'legacy',
      warnings: [`MJML export failed; used legacy email HTML instead. ${message}`],
    }
  }
}
