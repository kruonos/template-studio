import type {
  CanvasElement,
  ExportSnapshot,
  ExportSnapshotItem,
  ExportSnapshotTextItem,
  SurfaceTheme,
} from './schema.ts'
import type { TableData } from './schema.ts'
import { getButtonLabelFontSize } from './element-typography.ts'
import { escapeAttribute, escapeHtml, roundTo } from './utils.ts'
import { getSurfacePalette, getDefaultBorderRadius } from './theme.ts'
import { parseTableData } from './table-engine.ts'

type HtmlExportHooks = {
  resolveVariables: (text: string) => string
  renderAbsoluteHtmlTableExport: (element: CanvasElement, tableData: TableData, pageTop: number) => string
  getButtonHref: (element: CanvasElement) => string | null
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getVideoHref: (element: CanvasElement) => string | null
  sanitizeHtml: (html: string) => string
}

export function buildAbsoluteHtmlDocument(
  snapshot: ExportSnapshot,
  options: { paged: boolean; autoPrint: boolean },
  hooks: HtmlExportHooks,
): string {
  const pages = getRenderablePages(snapshot)
  const palette = getSurfacePalette(snapshot.surfaceTheme)

  const pageHtml = options.paged
    ? pages.map((page, index) => `
      <section class="export-page" data-page="${index + 1}">
        ${page.items.map(item => renderSnapshotItemHtmlForExport(item, snapshot.surfaceTheme, hooks)).join('\n')}
      </section>
    `).join('\n')
    : `
      <section class="export-page export-page--single" data-page="1" style="height:${snapshot.canvasHeight}px;">
        ${pages.flatMap(page => page.items).map(item => renderSnapshotItemHtmlForExport(item, snapshot.surfaceTheme, hooks)).join('\n')}
      </section>
    `

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(snapshot.templateName)}</title>
<style>
  :root { color-scheme: ${snapshot.surfaceTheme}; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: ${palette.exportFrame};
    font-family: "Avenir Next", "Segoe UI", sans-serif;
  }
  .export-page {
    position: relative;
    width: ${snapshot.canvasWidth}px;
    height: ${snapshot.pageHeight}px;
    margin: 0 auto 24px;
    background: ${palette.pageBackground};
    box-shadow: ${snapshot.surfaceTheme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.42)' : '0 20px 60px rgba(0, 0, 0, 0.12)'};
    border: 1px solid ${snapshot.surfaceTheme === 'dark' ? 'rgba(235, 244, 252, 0.08)' : 'rgba(13, 33, 48, 0.08)'};
    overflow: hidden;
  }
  .export-page--single {
    height: ${snapshot.canvasHeight}px;
  }
  @media print {
    body { margin: 0; padding: 0; background: #fff; }
    .export-page {
      margin: 0;
      box-shadow: none;
      break-after: page;
      page-break-after: always;
    }
  }
</style>
</head>
<body>
${pageHtml}
${options.autoPrint ? '<script>window.addEventListener("load", () => { setTimeout(() => window.print(), 120); });<\/script>' : ''}
</body>
</html>`
}

function getRenderablePages(snapshot: ExportSnapshot) {
  let lastNonEmptyIndex = snapshot.pages.length - 1
  while (lastNonEmptyIndex > 0 && snapshot.pages[lastNonEmptyIndex]?.items.length === 0) {
    lastNonEmptyIndex -= 1
  }
  return snapshot.pages.slice(0, lastNonEmptyIndex + 1)
}

function renderSnapshotItemHtmlForExport(item: ExportSnapshotItem, surfaceTheme: SurfaceTheme, hooks: HtmlExportHooks): string {
  if (item.kind === 'block') {
    return renderElementHtmlForExport(item.element, item.y, surfaceTheme, hooks)
  }
  return renderSnapshotTextLineHtmlForExport(item)
}

function renderElementHtmlForExport(
  element: CanvasElement,
  top: number,
  surfaceTheme: SurfaceTheme,
  hooks: HtmlExportHooks,
): string {
  const palette = getSurfacePalette(surfaceTheme)
  const opacityCss = element.styles.opacity !== undefined && element.styles.opacity < 1 ? `opacity:${element.styles.opacity};` : ''
  const style = `position:absolute;left:${roundTo(element.x, 2)}px;top:${roundTo(top, 2)}px;width:${roundTo(element.width, 2)}px;height:${roundTo(element.height, 2)}px;${opacityCss}`

  switch (element.type) {
    case 'image': {
      const src = hooks.getImageSource(element)
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius(element.type)
      return src !== null && src.length > 0
        ? `<div style="${style}overflow:hidden;${borderRadius > 0 ? `border-radius:${borderRadius}px;` : ''}"><img src="${escapeAttribute(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
        : `<div style="${style}background:#e8eef3;color:#607585;display:grid;place-items:center;font:600 13px/1.4 \"Avenir Next\",\"Segoe UI\",sans-serif;">Image placeholder</div>`
    }
    case 'button': {
      const href = hooks.getButtonHref(element) ?? '#'
      const fontFamily = hooks.getElementFontFamily(element)
      const fontSize = getButtonLabelFontSize(element)
      const fontWeight = hooks.getElementFontWeight(element)
      const fontStyle = element.styles.fontStyle ?? 'normal'
      const textDecoration = element.styles.textDecoration ?? 'none'
      const letterSpacing = element.styles.letterSpacing !== undefined && element.styles.letterSpacing !== 0 ? `letter-spacing:${element.styles.letterSpacing}px;` : ''
      return `<a href="${escapeAttribute(href)}" style="${style}display:flex;align-items:center;justify-content:center;padding:0 18px;font-family:${escapeAttribute(fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};text-decoration:${textDecoration};${letterSpacing}background:${escapeAttribute(element.styles.background ?? '#17384f')};border-radius:${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px;color:${escapeAttribute(element.styles.color ?? '#f8fffd')};">${escapeHtml(hooks.resolveVariables(element.content))}</a>`
    }
    case 'divider':
      return `<div style="${style}display:flex;align-items:center;"><div style="width:100%;height:1px;background:${escapeAttribute(element.styles.color ?? palette.divider)}"></div></div>`
    case 'spacer':
      return `<div style="${style}"></div>`
    case 'html':
      return `<div style="${style}overflow:hidden;padding:14px;background:${escapeAttribute(element.styles.background ?? '#edf8f6')};border-radius:${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px;color:${escapeAttribute(palette.body)};line-height:1.5;">${hooks.sanitizeHtml(hooks.resolveVariables(element.content))}</div>`
    case 'video': {
      const href = hooks.getVideoHref(element) ?? '#'
      return `<a href="${escapeAttribute(href)}" style="${style}display:grid;place-items:center;background:${surfaceTheme === 'dark' ? '#111a23' : '#091019'};color:${surfaceTheme === 'dark' ? '#eef5fb' : '#f2f6f9'};text-align:center;padding:16px;text-decoration:none;border-radius:${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px;overflow:hidden;">Open video</a>`
    }
    case 'mascot': {
      const mascotVisual = hooks.getMascotSource(element)
      const speech = element.styles.mascotSpeech ?? ''
      const speechBubble = speech.trim().length > 0
        ? `<div style="position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#fff;color:#1a2b3a;font-size:12px;line-height:1.4;padding:6px 12px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(hooks.resolveVariables(speech))}</div>`
        : ''
      const visual = mascotVisual.length > 0
        ? `<img src="${escapeAttribute(mascotVisual)}" alt="Mascot" style="width:100%;height:100%;object-fit:contain;">`
        : ''
      return `<div style="${style}overflow:visible;">${visual}${speechBubble}</div>`
    }
    case 'animated-gif': {
      const src = hooks.getAnimatedGifSource(element)
      const borderRadius = element.styles.borderRadius ?? getDefaultBorderRadius('image')
      return src !== null && src.length > 0
        ? `<div style="${style}overflow:hidden;${borderRadius > 0 ? `border-radius:${borderRadius}px;` : ''}"><img src="${escapeAttribute(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
        : `<div style="${style}background:#e8eef3;color:#607585;display:grid;place-items:center;font:600 13px/1.4 &quot;Avenir Next&quot;,&quot;Segoe UI&quot;,sans-serif;">Animated visual</div>`
    }
    case 'table': {
      const tableData = parseTableData(element.content)
      if (tableData === null) return `<div style="${style}background:#f8e8e8;display:grid;place-items:center;font:600 13px/1.4 sans-serif;color:#a03030;">Invalid table</div>`
      return hooks.renderAbsoluteHtmlTableExport(element, tableData, top)
    }
    default:
      return ''
  }
}

function renderSnapshotTextLineHtmlForExport(item: ExportSnapshotTextItem): string {
  const letterSpacingCss = item.letterSpacing !== 0 ? `letter-spacing:${item.letterSpacing}px;` : ''
  const opacityCss = item.opacity < 1 ? `opacity:${item.opacity};` : ''
  return `<div style="position:absolute;white-space:pre;left:${roundTo(item.x, 2)}px;top:${roundTo(item.y, 2)}px;font:${escapeAttribute(item.font)};line-height:${item.lineHeight}px;color:${escapeAttribute(item.color)};text-decoration:${escapeAttribute(item.textDecoration)};${letterSpacingCss}${opacityCss}">${escapeHtml(item.text)}</div>`
}
