import type { CanvasElement, SurfaceTheme } from './schema.ts'
import { getSurfacePalette } from './theme.ts'

export function getElementFontFamily(element: CanvasElement): string {
  return element.styles.fontFamily ?? (element.type === 'button' ? '"Avenir Next", "Segoe UI", sans-serif' : 'Georgia, serif')
}

export function getElementFontSize(element: CanvasElement): number {
  if (element.styles.fontSize !== undefined) return element.styles.fontSize
  switch (element.type) {
    case 'heading':
      return 36
    case 'button':
      return 16
    default:
      return 18
  }
}

export function getButtonLabelFontSize(element: CanvasElement): number {
  return Math.round(getElementFontSize(element) * 0.9)
}

export function getElementFontWeight(element: CanvasElement): number {
  if (element.styles.fontWeight !== undefined) return element.styles.fontWeight
  return element.type === 'heading' || element.type === 'button' ? 700 : 400
}

export function getElementLineHeight(element: CanvasElement): number {
  const defaultMultiplier = element.type === 'heading' ? 1.2 : element.type === 'button' ? 1.15 : 1.65
  const multiplier = element.styles.lineHeightMultiplier ?? defaultMultiplier
  return Math.round(getElementFontSize(element) * multiplier)
}

export function getElementTextColor(element: CanvasElement, surfaceTheme: SurfaceTheme): string {
  if (element.styles.color !== undefined) return element.styles.color
  const palette = getSurfacePalette(surfaceTheme)
  if (element.type === 'heading') return palette.heading
  if (element.type === 'button') return palette.buttonText
  return palette.body
}

export function getElementFontShorthand(element: CanvasElement): string {
  return `${element.styles.fontStyle ?? 'normal'} ${getElementFontWeight(element)} ${getElementFontSize(element)}px ${getElementFontFamily(element)}`
}
