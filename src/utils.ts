import type {
  AnimatedGifBehavior,
  ElementId,
  ElementType,
  ExportFormat,
  PaperSizeId,
  ResizeHandle,
  SidebarTab,
  SurfaceTheme,
  ViewMode,
  WrapMode,
} from './schema.ts'
import { asElementId } from './schema.ts'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

export function toHexColor(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }
  if (normalized === 'transparent' || normalized.length === 0) return '#ffffff'
  return '#000000'
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function toDocxColor(value: string | undefined, fallback: string): string {
  const fallbackMatch = fallback.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  const fallbackHex = fallbackMatch?.[1]
  const normalizedFallback = fallbackHex === undefined
    ? '8496A5'
    : (fallbackHex.length === 3
      ? fallbackHex.split('').map(char => `${char}${char}`).join('').toUpperCase()
      : fallbackHex.toUpperCase())
  if (value === undefined) return normalizedFallback
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (match === null) return normalizedFallback
  const raw = match[1]
  if (raw === undefined) return normalizedFallback
  if (raw.length === 3) return raw.split('').map(char => `${char}${char}`).join('').toUpperCase()
  return raw.toUpperCase()
}

export function slugifyFilename(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return cleaned.length > 0 ? cleaned.replace(/^-+|-+$/g, '') : 'template'
}

export function capitalize(value: string): string {
  const first = value[0]
  return first === undefined ? value : `${first.toUpperCase()}${value.slice(1)}`
}

export function sanitizeVariableName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_]/g, '')
}

export function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

export function createId(prefix: 'el'): ElementId
export function createId(prefix: string): string
export function createId(prefix: string): string {
  const uuid = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const value = `${prefix}-${uuid.slice(0, 8)}`
  return prefix === 'el' ? asElementId(value) : value
}

export function isElementType(value: string | undefined): value is ElementType {
  return value === 'heading' || value === 'text' || value === 'image' || value === 'button' || value === 'divider' || value === 'spacer' || value === 'html' || value === 'video' || value === 'mascot' || value === 'animated-gif' || value === 'table'
}

export function isWrapMode(value: string | undefined): value is WrapMode {
  return value === 'strict' || value === 'normal' || value === 'freedom'
}

export function isViewMode(value: string | undefined): value is ViewMode {
  return value === 'desktop' || value === 'tablet' || value === 'mobile'
}

export function isSurfaceTheme(value: string | undefined): value is SurfaceTheme {
  return value === 'light' || value === 'dark'
}

export function isSidebarTab(value: string | undefined): value is SidebarTab {
  return value === 'components' || value === 'templates' || value === 'variables' || value === 'layers'
}

export function isResizeHandle(value: string | undefined): value is ResizeHandle {
  return value === 'nw' || value === 'n' || value === 'ne' || value === 'e' || value === 'se' || value === 's' || value === 'sw' || value === 'w'
}

export function isExportFormat(value: string | undefined): value is ExportFormat {
  return value === 'html' || value === 'pdf' || value === 'docx' || value === 'odt' || value === 'email-html' || value === 'email-text' || value === 'json'
}

export function isTextualElement(type: ElementType): boolean {
  return type === 'heading' || type === 'text' || type === 'button'
}

export function isTextBlock(type: ElementType): type is 'heading' | 'text' {
  return type === 'heading' || type === 'text'
}

export function isInlineEditableType(type: ElementType): boolean {
  return type === 'heading' || type === 'text' || type === 'button' || type === 'html'
}

const PAPER_SIZE_IDS = new Set<string>([
  'email', 'a4-portrait', 'a4-landscape', 'a3-portrait', 'a3-landscape',
  'letter-portrait', 'letter-landscape', 'legal-portrait', 'legal-landscape',
  'flashcard-3x5', 'flashcard-4x6', 'custom',
])
export function isPaperSizeId(value: string | undefined): value is PaperSizeId {
  return value !== undefined && PAPER_SIZE_IDS.has(value)
}

export function isAnimatedGifBehavior(value: string | undefined): value is AnimatedGifBehavior {
  return value === 'path-loop' || value === 'path-bounce' || value === 'path-once' || value === 'static'
}
