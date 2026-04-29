export type ElementType = 'heading' | 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'html' | 'video' | 'mascot' | 'animated-gif' | 'table'
export type MascotBehavior = 'patrol' | 'bounce' | 'orbit' | 'idle' | 'wander'
export type MascotPreset = 'dragon' | 'cat' | 'bird' | 'robot' | 'fox' | 'custom'
export type AnimatedGifBehavior = 'path-loop' | 'path-bounce' | 'path-once' | 'static'
export type WrapMode = 'strict' | 'normal' | 'freedom'
export type ViewMode = 'desktop' | 'tablet' | 'mobile'
export type ZoomMode = 'fit' | 'manual'
export type UiTheme = 'dark' | 'light'
export type SurfaceTheme = 'light' | 'dark'
export type SidebarTab = 'components' | 'templates' | 'variables' | 'layers'
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type TextAlign = 'left' | 'center' | 'right'
export type ExportFormat = 'html' | 'pdf' | 'docx' | 'odt' | 'email-html' | 'email-text' | 'json'
export type EmailExportFormat = 'mjml' | 'legacy'

type Brand<T, Tag extends string> = T & { readonly __brand: Tag }

export type ElementId = Brand<string, 'ElementId'>
export type PageId = Brand<string, 'PageId'>

export function asElementId(value: string): ElementId {
  return value as ElementId
}

export type GifExportParams = {
  durationSec: number
  fps: number
  colors: 64 | 128 | 256
  scale: 0.5 | 1 | 2
  loopCount: number
}

// ── Paper size model ──────────────────────────────────────────────
export type PaperSizeId =
  | 'email'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'a3-portrait'
  | 'a3-landscape'
  | 'letter-portrait'
  | 'letter-landscape'
  | 'legal-portrait'
  | 'legal-landscape'
  | 'flashcard-3x5'
  | 'flashcard-4x6'
  | 'custom'

export type PaperSizePreset = {
  id: PaperSizeId
  label: string
  group: string
  /** Canvas width in CSS pixels */
  width: number
  /** Page height in CSS pixels */
  height: number
  /** Default page margin in CSS pixels */
  margin: number
}

export type PaperSize = {
  id: PaperSizeId
  width: number
  height: number
  margin: number
}

// Physical dimensions → CSS pixels at 96 DPI
// A4: 210mm × 297mm → 794 × 1123 px
// A3: 297mm × 420mm → 1123 × 1587 px
// Letter: 8.5in × 11in → 816 × 1056 px
// Legal: 8.5in × 14in → 816 × 1344 px
// Flashcard 3×5: 3in × 5in → 288 × 480 px
// Flashcard 4×6: 4in × 6in → 384 × 576 px

export const PAPER_SIZE_PRESETS: PaperSizePreset[] = [
  { id: 'email',             label: 'Email (720px)',       group: 'Digital',  width: 720,  height: 980,  margin: 40 },
  { id: 'a4-portrait',       label: 'A4 Portrait',         group: 'Paper',    width: 794,  height: 1123, margin: 48 },
  { id: 'a4-landscape',      label: 'A4 Landscape',        group: 'Paper',    width: 1123, height: 794,  margin: 48 },
  { id: 'a3-portrait',       label: 'A3 Portrait',         group: 'Paper',    width: 1123, height: 1587, margin: 56 },
  { id: 'a3-landscape',      label: 'A3 Landscape',        group: 'Paper',    width: 1587, height: 1123, margin: 56 },
  { id: 'letter-portrait',   label: 'US Letter Portrait',  group: 'Paper',    width: 816,  height: 1056, margin: 48 },
  { id: 'letter-landscape',  label: 'US Letter Landscape', group: 'Paper',    width: 1056, height: 816,  margin: 48 },
  { id: 'legal-portrait',    label: 'US Legal Portrait',   group: 'Paper',    width: 816,  height: 1344, margin: 48 },
  { id: 'legal-landscape',   label: 'US Legal Landscape',  group: 'Paper',    width: 1344, height: 816,  margin: 48 },
  { id: 'flashcard-3x5',     label: 'Flashcard 3\u00d75',  group: 'Cards',    width: 480,  height: 288,  margin: 24 },
  { id: 'flashcard-4x6',     label: 'Flashcard 4\u00d76',  group: 'Cards',    width: 576,  height: 384,  margin: 28 },
  { id: 'custom',            label: 'Custom',              group: 'Custom',   width: 720,  height: 980,  margin: 40 },
]

export const DEFAULT_PAPER_SIZE: PaperSize = { id: 'email', width: 720, height: 980, margin: 40 }

export function getPaperSizePreset(id: PaperSizeId): PaperSizePreset {
  return PAPER_SIZE_PRESETS.find(p => p.id === id) ?? PAPER_SIZE_PRESETS[0]!
}

export function paperSizeFromPreset(id: PaperSizeId): PaperSize {
  const preset = getPaperSizePreset(id)
  return { id: preset.id, width: preset.width, height: preset.height, margin: preset.margin }
}

export function createCustomPaperSize(width: number, height: number, margin: number): PaperSize {
  return { id: 'custom', width, height, margin }
}

// ── Traced path model (for animated-gif path following) ──────────
export type TracedPathPoint = {
  x: number
  y: number
}

export type TracedPathControlPoint = {
  /** Anchor point position */
  anchor: TracedPathPoint
  /** Optional cubic bezier handle (incoming) */
  handleIn?: TracedPathPoint
  /** Optional cubic bezier handle (outgoing) */
  handleOut?: TracedPathPoint
}

export type TracedPath = {
  /** Ordered control points defining the path */
  points: TracedPathControlPoint[]
  /** Whether the path forms a closed loop */
  closed: boolean
}

export type GifFrameInfo = {
  /** Delay between this frame and the next (ms) */
  delay: number
  /** Width of this frame */
  width: number
  /** Height of this frame */
  height: number
}

// ── Table model ──────────────────────────────────────────────────
export type CellBorderStyle = {
  width: number
  color: string
  style: 'solid' | 'dashed' | 'dotted' | 'none'
}

export type CellStyles = {
  borderTop?: CellBorderStyle
  borderRight?: CellBorderStyle
  borderBottom?: CellBorderStyle
  borderLeft?: CellBorderStyle
  background?: string
  padding?: number
  hAlign?: 'left' | 'center' | 'right'
  vAlign?: 'top' | 'middle' | 'bottom'
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  color?: string
}

export type TableCell = {
  /** Row index in the grid */
  row: number
  /** Column index in the grid */
  col: number
  /** Number of rows this cell spans (default 1) */
  rowspan: number
  /** Number of columns this cell spans (default 1) */
  colspan: number
  /** Text content (may include variables and formulas) */
  content: string
  /** Per-cell visual styles */
  styles: CellStyles
}

export type TableData = {
  /** Number of rows */
  rows: number
  /** Number of columns */
  cols: number
  /** Column widths as fractions of total table width (summing to 1) */
  colWidths: number[]
  /** Row heights in CSS pixels */
  rowHeights: number[]
  /** Flat array of cells (sparse — merged cells only have the anchor) */
  cells: TableCell[]
  /** Number of header rows that repeat on page breaks */
  headerRows: number
  /** Default border style applied to all cell edges */
  defaultBorder: CellBorderStyle
}

export type ElementStyles = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textAlign?: TextAlign
  wordBreak?: 'normal' | 'keep-all'
  textDecoration?: 'none' | 'underline'
  letterSpacing?: number
  lineHeightMultiplier?: number
  color?: string
  background?: string
  borderRadius?: number
  href?: string
  opacity?: number
  mascotBehavior?: MascotBehavior
  mascotSpeed?: number
  mascotPreset?: MascotPreset
  mascotPath?: string
  mascotSpeech?: string
  mascotHullMode?: 'rect' | 'silhouette'
  // ── Animated GIF path-following fields ────────────────────────
  /** JSON-serialized TracedPath for animated-gif elements */
  gifPath?: string
  /** Animation behavior along the traced path */
  gifBehavior?: AnimatedGifBehavior
  /** Speed multiplier for path animation (0.1–5) */
  gifSpeed?: number
  /** Hull mode for obstacle detection: rect or silhouette */
  gifHullMode?: 'rect' | 'silhouette'
  /** Total number of extracted GIF frames (metadata only) */
  gifFrameCount?: number
  /** Total GIF duration in ms */
  gifDuration?: number
  // ── Table element fields ──────────────────────────────────────
  /** Number of header rows that repeat on page break (table only) */
  tableHeaderRows?: number
  /** Show alternating row shading */
  tableStriped?: boolean
  /** Stripe color for alternating rows */
  tableStripeColor?: string
}

type CanvasElementBase = {
  id: ElementId
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  styles: ElementStyles
  locked?: boolean
}

export type CanvasElement = CanvasElementBase & {
  content: string
}

export type StoredCanvasElement =
  | (CanvasElementBase & {
    type: Exclude<ElementType, 'table'>
    content: string
  })
  | (CanvasElementBase & {
    type: 'table'
    content: TableData
  })

export type TemplateVar = {
  name: string
  label: string
  value: string
  fallback?: string
}

export type StoredDocument = {
  name: string
  description: string
  elements: StoredCanvasElement[]
  variables: TemplateVar[]
  wrapMode: WrapMode
  surfaceTheme: SurfaceTheme
  manualPageCount: number
  paperSize?: PaperSize
  emailFormat?: EmailExportFormat
  emailBreakpoint?: number
}

export type SavedVersion = {
  id: string
  version: number
  savedAt: string
  document: StoredDocument
}

export type SavedTemplate = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  version: number
  current: StoredDocument
  versions: SavedVersion[]
}

export type PersistedStore = {
  version: number
  templates: SavedTemplate[]
}

export type DocumentBackup = {
  version: number
  savedAt: string
  document: StoredDocument
}

export type StudioState = {
  templateId: string | null
  templateName: string
  description: string
  elements: CanvasElement[]
  variables: TemplateVar[]
  selectedId: ElementId | null
  selectedIds: Set<ElementId>
  wrapMode: WrapMode
  surfaceTheme: SurfaceTheme
  viewMode: ViewMode
  zoomMode: ZoomMode
  sidebarTab: SidebarTab
  zoom: number
  currentPage: number
  manualPageCount: number
  pageCount: number
  canvasHeight: number
  showGrid: boolean
  showShortcuts: boolean
  version: number
  lastSavedAt: string | null
  dirty: boolean
  paperSize: PaperSize
  emailFormat: EmailExportFormat
  emailBreakpoint: number
}

export type ContextMenuState = {
  x: number
  y: number
  elementId: ElementId | null
}

export type MarqueeState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export type TextProjectionLine = {
  x: number
  y: number
  text: string
  width: number
  slotWidth: number
}

export type TextProjection = {
  lines: TextProjectionLine[]
  font: string
  lineHeight: number
  color: string
  textDecoration: string
  truncated: boolean
}

export type InlineEditorState = {
  elementId: ElementId
  draft: string
}

export type Preset = {
  id: string
  name: string
  description: string
  create: (paperSize?: PaperSize) => StoredDocument
}

export type DragState = {
  id: ElementId
  offsetX: number
  offsetY: number
}

export type ResizeState = {
  id: ElementId
  handle: ResizeHandle
  startX: number
  startY: number
  startRect: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type FlowBlock = {
  id: string
  type: ElementType
  text: string
  href: string | null
  src: string | null
  styles: ElementStyles
  height: number
  width: number
  x: number
  y: number
  pageIndex: number
}

export type ExportSnapshotTextItem = {
  kind: 'text-line'
  elementId: ElementId
  elementType: 'text' | 'heading'
  pageIndex: number
  x: number
  y: number
  width: number
  slotWidth: number
  height: number
  text: string
  font: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  color: string
  textDecoration: 'none' | 'underline'
  letterSpacing: number
  opacity: number
}

export type ExportSnapshotBlockItem = {
  kind: 'block'
  element: CanvasElement
  pageIndex: number
  y: number
}

export type ExportSnapshotItem = ExportSnapshotTextItem | ExportSnapshotBlockItem

export type ExportSnapshotPage = {
  pageIndex: number
  items: ExportSnapshotItem[]
}

export type ExportSnapshot = {
  templateName: string
  description: string
  canvasWidth: number
  pageHeight: number
  pageMargin: number
  canvasHeight: number
  pageCount: number
  surfaceTheme: SurfaceTheme
  wrapMode: WrapMode
  paperSizeId: PaperSizeId
  pages: ExportSnapshotPage[]
}

// Legacy dimension constants — kept as defaults. Runtime code should use
// state.paperSize.width / state.paperSize.height / state.paperSize.margin.
export const CANVAS_WIDTH = 720
export const PAGE_HEIGHT = 980
export const PAGE_MARGIN = 40
export const MAX_HISTORY = 100
export const STORAGE_KEY = 'pretext-template-studio:v1'
export const STORAGE_VERSION = 2
export const BACKUP_STORAGE_KEY = `${STORAGE_KEY}:backup`
export const UI_THEME_STORAGE_KEY = `${STORAGE_KEY}:ui-theme`
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const ODT_MIME = 'application/vnd.oasis.opendocument.text'
export const IMAGE_MAX_EDGE = 1600
export const VIEWPORT_WIDTH_BY_MODE: Record<ViewMode, number> = {
  desktop: CANVAS_WIDTH,
  tablet: 600,
  mobile: 390,
}

export const FONT_CHOICES = [
  'Georgia, serif',
  '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
  '"Avenir Next", "Segoe UI", sans-serif',
  'Arial, sans-serif',
  '"Courier New", monospace',
] as const

export const SURFACE_PALETTES = {
  light: {
    pageBackground: '#fffdf8',
    workbenchBackground: '#ece7df',
    heading: '#1a2b3a',
    body: '#354a5a',
    divider: 'rgba(13, 33, 48, 0.2)',
    buttonBackground: '#17384f',
    buttonText: '#f8fffd',
    exportFrame: '#f2f2ef',
  },
  dark: {
    pageBackground: '#0a1118',
    workbenchBackground: '#04070c',
    heading: '#f3f7fb',
    body: '#cad9e5',
    divider: 'rgba(226, 244, 255, 0.18)',
    buttonBackground: '#2dd4e0',
    buttonText: '#071217',
    exportFrame: '#03070b',
  },
} as const

export type SurfacePalette = (typeof SURFACE_PALETTES)[SurfaceTheme]

export const MANAGED_TEXT_COLORS = ['#1a2b3a', '#354a5a', '#f0f2f5', '#c5c8cc', '#f3f7fb', '#cad9e5']
export const MANAGED_BUTTON_BACKGROUNDS = ['#17384f', '#0f5f58', '#164e63', '#0d766e', '#2dd4e0']
export const MANAGED_BUTTON_TEXT_COLORS = ['#f8fffd', '#f6fffd', '#071217']
export const MANAGED_DIVIDER_COLORS = ['rgba(13, 33, 48, 0.2)', 'rgba(226, 244, 255, 0.18)']
export const SMART_GUIDE_THRESHOLD = 5
export const COLOR_SWATCHES = [
  '#1a2b3a', '#354a5a', '#0f5f58', '#164e63', '#0d766e', '#17384f',
  '#c85d31', '#b86b14', '#9e4626', '#dc2626', '#16a34a',
  '#f3f7fb', '#cad9e5', '#f8fffd', '#f0f2f5',
  '#0a1118', '#071217', '#2dd4e0', '#f59f6c', '#4ade80',
]

export function createDefaultVariables(): TemplateVar[] {
  return [
    { name: 'firstName', label: 'First name', value: 'Ava' },
    { name: 'lastName', label: 'Last name', value: 'Stone' },
    { name: 'company', label: 'Company', value: 'Northline Studio' },
    { name: 'role', label: 'Role', value: 'Design director' },
    { name: 'ctaUrl', label: 'CTA URL', value: 'https://example.com/demo' },
    { name: 'eventDate', label: 'Event date', value: new Date().toLocaleDateString() },
  ]
}
