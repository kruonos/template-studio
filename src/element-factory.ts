import type { CanvasElement, ElementId, ElementType, MascotPreset, PaperSize, SurfacePalette } from './schema.ts'
import { MASCOT_PRESETS } from './mascots.ts'
import { computeTableHeight, createTableData, serializeTableData } from './table-engine.ts'

type ElementFactoryHooks = {
  createId: (prefix: 'el') => ElementId
  paperSize: PaperSize
  surfacePalette: SurfacePalette
  clamp: (value: number, min: number, max: number) => number
}

export function createElement(type: ElementType, x: number, y: number, hooks: ElementFactoryHooks): CanvasElement {
  const canvasWidth = hooks.paperSize.width
  const pageMargin = hooks.paperSize.margin
  const baseX = hooks.clamp(Math.round(x), 0, canvasWidth - 36)
  const baseY = Math.max(0, Math.round(y))
  const palette = hooks.surfacePalette

  switch (type) {
    case 'heading':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: canvasWidth - pageMargin * 2,
        height: 120,
        content: 'Welcome back, {{firstName}}.',
        styles: { fontWeight: 700, fontSize: 36, color: palette.heading },
      }
    case 'text':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 320,
        height: 220,
        content: 'Use Pretext-powered text routing to keep copy readable while media, CTAs, and inserts move around the page.',
        styles: { fontSize: 18, color: palette.body },
      }
    case 'image':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 260,
        height: 220,
        content: '',
        styles: { borderRadius: 20 },
      }
    case 'button':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 220,
        height: 56,
        content: 'Book a walkthrough',
        styles: { background: palette.buttonBackground, color: palette.buttonText, borderRadius: 999, href: '{{ctaUrl}}', fontSize: 16, fontWeight: 700 },
      }
    case 'divider':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: canvasWidth - pageMargin * 2,
        height: 18,
        content: '',
        styles: { color: palette.divider },
      }
    case 'spacer':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: canvasWidth - pageMargin * 2,
        height: 64,
        content: '',
        styles: {},
      }
    case 'html':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 280,
        height: 120,
        content: '<div style="padding:18px;background:#edf8f6;border-radius:18px;border:1px solid rgba(23,56,79,0.12);"><strong>{{company}}</strong><br>Embedded highlight module with sanitized HTML.</div>',
        styles: { background: '#edf8f6', borderRadius: 18 },
      }
    case 'video':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 320,
        height: 220,
        content: '',
        styles: { borderRadius: 20 },
      }
    case 'mascot': {
      const preset: MascotPreset = 'dragon'
      const presetDef = MASCOT_PRESETS[preset]
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: presetDef.defaultWidth,
        height: presetDef.defaultHeight,
        content: '',
        styles: {
          mascotPreset: preset,
          mascotBehavior: 'patrol',
          mascotSpeed: 1,
          mascotPath: JSON.stringify([
            { x: baseX, y: baseY },
            { x: Math.min(baseX + 200, canvasWidth - presetDef.defaultWidth), y: baseY },
          ]),
          mascotHullMode: 'rect',
          mascotSpeech: '',
        },
      }
    }
    case 'animated-gif':
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: 200,
        height: 200,
        content: '',
        styles: {
          gifBehavior: 'static',
          gifSpeed: 1,
          gifHullMode: 'rect',
          borderRadius: 0,
        },
      }
    case 'table': {
      const tableWidth = Math.min(canvasWidth - pageMargin * 2, 480)
      const data = createTableData(3, 3, tableWidth, 32)
      return {
        id: hooks.createId('el'),
        type,
        x: baseX,
        y: baseY,
        width: tableWidth,
        height: computeTableHeight(data),
        content: serializeTableData(data),
        styles: {
          tableHeaderRows: 0,
          tableStriped: false,
        },
      }
    }
  }
}
