import type {
  CanvasElement,
  FlowBlock,
} from './schema.ts'
import {
  getCell,
  parseTableData,
  evaluateFormulas,
} from './table-engine.ts'
import {
  sanitizeHtml,
  stripHtmlToText,
} from './content.ts'
import { clamp } from './utils.ts'

export type BuildFlowBlocksOptions = {
  elements: CanvasElement[]
  pageHeight: number
  pageCount: number
  resolveVariables: (text: string) => string
  getButtonHref: (element: CanvasElement) => string | null
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotSource: (element: CanvasElement) => string
  getVideoHref: (element: CanvasElement) => string | null
}

export function buildFlowBlocks(options: BuildFlowBlocksOptions): FlowBlock[] {
  return options.elements
    .slice()
    .sort((a, b) => {
      const pageDelta = Math.floor(a.y / options.pageHeight) - Math.floor(b.y / options.pageHeight)
      return pageDelta !== 0 ? pageDelta : (a.y - b.y || a.x - b.x)
    })
    .map(element => ({
      id: element.id,
      type: element.type,
      text: element.type === 'html'
        ? sanitizeHtml(options.resolveVariables(element.content))
        : element.type === 'table'
          ? element.content
          : options.resolveVariables(element.content),
      href: element.type === 'button'
        ? options.getButtonHref(element)
        : element.type === 'video'
          ? options.getVideoHref(element)
          : null,
      src: element.type === 'image'
        ? options.getImageSource(element)
        : element.type === 'animated-gif'
          ? options.getAnimatedGifSource(element)
          : element.type === 'mascot'
            ? (options.getMascotSource(element).trim().length > 0 ? options.getMascotSource(element) : null)
            : null,
      styles: structuredClone(element.styles),
      height: element.height,
      width: element.width,
      x: element.x,
      y: element.y,
      pageIndex: clamp(Math.floor(element.y / options.pageHeight), 0, options.pageCount - 1),
    }))
}

export function buildEmailText(options: BuildFlowBlocksOptions): string {
  return buildFlowBlocks(options)
    .map(block => {
      switch (block.type) {
        case 'divider':
          return '------------------------------------------------------------'
        case 'button':
          return block.href === null ? block.text : `${block.text}\n${block.href}`
        case 'image':
          return block.src === null ? '' : `[Image] ${block.src}`
        case 'video':
          return block.href === null ? '' : `[Video] ${block.href}`
        case 'mascot':
          return block.src === null ? '[Mascot]' : `[Mascot] ${block.src}`
        case 'animated-gif':
          return block.src === null ? '[Animated visual]' : `[Animated visual] ${block.src}`
        case 'table': {
          const tableData = parseTableData(block.text)
          if (tableData === null) return '[Table]'
          const rows: string[] = []
          for (let row = 0; row < tableData.rows; row += 1) {
            const columns: string[] = []
            for (let col = 0; col < tableData.cols; col += 1) {
              const cell = getCell(tableData, row, col)
              if (cell === null || cell.row !== row || cell.col !== col) continue
              const content = options.resolveVariables(evaluateFormulas(cell.content, tableData))
              columns.push(content || ' ')
            }
            rows.push(columns.join(' | '))
          }
          return rows.join('\n')
        }
        default:
          return stripHtmlToText(block.text)
      }
    })
    .filter(Boolean)
    .join('\n\n')
}
