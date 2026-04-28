import { MASCOT_PRESETS } from './mascots.ts'
import {
  BACKUP_STORAGE_KEY,
  DEFAULT_PAPER_SIZE,
  PAGE_MARGIN,
  PAPER_SIZE_PRESETS,
  asElementId,
  type CanvasElement,
  type DocumentBackup,
  type ElementStyles,
  type PaperSize,
  type PersistedStore,
  type SavedTemplate,
  type StoredCanvasElement,
  type StoredDocument,
  type TableData,
  type TemplateVar,
  STORAGE_VERSION,
} from './schema.ts'
import { parseDocumentBackup, parseImportedDocument, parsePersistedStore, safeParseStoredDocument } from './document-schema.ts'
import {
  clamp,
  cloneData,
  createId,
  deepFreeze,
  isAnimatedGifBehavior,
  isElementType,
  isPaperSizeId,
  isSurfaceTheme,
  isWrapMode,
  sanitizeVariableName,
} from './utils.ts'
import { createDefaultVariables } from './schema.ts'
import { createTableData, normalizeTableData, parseTableData, serializeTableData } from './table-engine.ts'

export function readTemplateStore(storageKey: string): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return []
    const parsed = parsePersistedStore(JSON.parse(raw) as unknown)
    return deepFreeze(parsed.templates.map(normalizeSavedTemplate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  } catch {
    return []
  }
}

export function writeTemplateStore(storageKey: string, templates: SavedTemplate[]): void {
  const payload: PersistedStore = {
    version: STORAGE_VERSION,
    templates,
  }
  localStorage.setItem(storageKey, JSON.stringify(payload))
}

export function readDocumentBackup(storageKey: string): DocumentBackup | null {
  try {
    const raw = localStorage.getItem(getBackupStorageKey(storageKey))
    if (raw === null) return null
    const parsed = parseDocumentBackup(JSON.parse(raw) as unknown)
    return {
      version: parsed.version,
      savedAt: parsed.savedAt,
      document: normalizeStoredDocument(parsed.document),
    }
  } catch {
    return null
  }
}

export function writeDocumentBackup(storageKey: string, document: StoredDocument): void {
  const payload: DocumentBackup = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    document: normalizeStoredDocument(document),
  }
  localStorage.setItem(getBackupStorageKey(storageKey), JSON.stringify(payload))
}

export function getBackupStorageKey(storageKey: string): string {
  return storageKey === BACKUP_STORAGE_KEY ? storageKey : `${storageKey}:backup`
}

export function normalizeSavedTemplate(template: SavedTemplate): SavedTemplate {
  return deepFreeze({
    id: template.id,
    name: template.name,
    description: template.description,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    version: template.version,
    current: normalizeStoredDocument(template.current),
    versions: Array.isArray(template.versions)
      ? template.versions.map(version => ({
        id: version.id,
        version: version.version,
        savedAt: version.savedAt,
        document: normalizeStoredDocument(version.document),
      }))
      : [],
  })
}

export function normalizeStoredDocument(documentState: StoredDocument): StoredDocument {
  const result: StoredDocument = {
    name: typeof documentState.name === 'string' ? documentState.name : 'Untitled template',
    description: typeof documentState.description === 'string' ? documentState.description : '',
    wrapMode: isWrapMode(documentState.wrapMode) ? documentState.wrapMode : 'freedom',
    surfaceTheme: isSurfaceTheme(documentState.surfaceTheme) ? documentState.surfaceTheme : 'light',
    manualPageCount: Number.isFinite(documentState.manualPageCount) ? Math.max(1, Math.round(documentState.manualPageCount)) : 1,
    variables: Array.isArray(documentState.variables) && documentState.variables.length > 0
      ? documentState.variables.map(normalizeVariable)
      : cloneData(createDefaultVariables()),
    elements: Array.isArray(documentState.elements)
      ? documentState.elements.map(normalizeStoredElement)
      : [],
  }
  if (documentState.paperSize !== undefined) {
    result.paperSize = normalizePaperSize(documentState.paperSize)
  }
  if (documentState.emailFormat === 'mjml' || documentState.emailFormat === 'legacy') {
    result.emailFormat = documentState.emailFormat
  }
  if (typeof documentState.emailBreakpoint === 'number' && Number.isFinite(documentState.emailBreakpoint)) {
    result.emailBreakpoint = clamp(Math.round(documentState.emailBreakpoint), 320, 960)
  }
  return deepFreeze(result)
}

export function normalizeElement(element: CanvasElement): CanvasElement {
  return {
    id: typeof element.id === 'string' ? asElementId(element.id) : createId('el'),
    type: isElementType(element.type) ? element.type : 'text',
    x: Number.isFinite(element.x) ? element.x : PAGE_MARGIN,
    y: Number.isFinite(element.y) ? element.y : PAGE_MARGIN,
    width: Number.isFinite(element.width) ? Math.max(36, element.width) : 240,
    height: Number.isFinite(element.height) ? Math.max(12, element.height) : 120,
    content: typeof element.content === 'string' ? element.content : '',
    styles: normalizeStyles(element.styles),
    locked: element.locked === true,
  }
}

function createFallbackTableData(width: number): TableData {
  return createTableData(3, 3, Math.max(120, Math.round(width) || 240), 32)
}

function normalizeStoredTableContent(content: TableData | string, width: number): TableData {
  if (typeof content === 'string') {
    const parsed = parseTableData(content)
    return parsed ?? createFallbackTableData(width)
  }
  return normalizeTableData(content)
}

export function normalizeStoredElement(element: StoredCanvasElement | CanvasElement): StoredCanvasElement {
  const type = isElementType(element.type) ? element.type : 'text'
  const next = {
    id: typeof element.id === 'string' ? asElementId(element.id) : createId('el'),
    type,
    x: Number.isFinite(element.x) ? element.x : PAGE_MARGIN,
    y: Number.isFinite(element.y) ? element.y : PAGE_MARGIN,
    width: Number.isFinite(element.width) ? Math.max(36, element.width) : 240,
    height: Number.isFinite(element.height) ? Math.max(12, element.height) : 120,
    styles: normalizeStyles(element.styles),
    locked: element.locked === true,
  }
  if (type === 'table') {
    return {
      ...next,
      type: 'table',
      content: normalizeStoredTableContent(element.content, next.width),
    }
  }
  return {
    ...next,
    type,
    content: typeof element.content === 'string' ? element.content : '',
  }
}

export function hydrateStoredElement(element: StoredCanvasElement): CanvasElement {
  const next: CanvasElement = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    content: element.type === 'table' ? serializeTableData(normalizeTableData(element.content)) : element.content,
    styles: normalizeStyles(element.styles),
  }
  if (element.locked) next.locked = true
  return next
}

export function serializeCanvasElement(element: CanvasElement): StoredCanvasElement {
  const normalized = normalizeElement(element)
  if (normalized.type === 'table') {
    return {
      ...normalized,
      type: 'table',
      content: normalizeStoredTableContent(normalized.content, normalized.width),
    }
  }
  return {
    ...normalized,
    type: normalized.type,
    content: normalized.content,
  }
}

export function normalizeStyles(styles: ElementStyles | undefined): ElementStyles {
  if (styles === undefined || styles === null) return {}
  const next: ElementStyles = {}
  if (typeof styles.fontFamily === 'string') next.fontFamily = styles.fontFamily
  if (typeof styles.fontSize === 'number' && Number.isFinite(styles.fontSize)) next.fontSize = styles.fontSize
  if (typeof styles.fontWeight === 'number' && Number.isFinite(styles.fontWeight)) next.fontWeight = styles.fontWeight
  if (styles.fontStyle === 'italic' || styles.fontStyle === 'normal') next.fontStyle = styles.fontStyle
  if (styles.textAlign === 'left' || styles.textAlign === 'center' || styles.textAlign === 'right') next.textAlign = styles.textAlign
  if (styles.wordBreak === 'normal' || styles.wordBreak === 'keep-all') next.wordBreak = styles.wordBreak
  if (styles.textDecoration === 'underline' || styles.textDecoration === 'none') next.textDecoration = styles.textDecoration
  if (typeof styles.color === 'string') next.color = styles.color
  if (typeof styles.background === 'string') next.background = styles.background
  if (typeof styles.borderRadius === 'number' && Number.isFinite(styles.borderRadius)) next.borderRadius = styles.borderRadius
  if (typeof styles.href === 'string') next.href = styles.href
  if (typeof styles.opacity === 'number' && Number.isFinite(styles.opacity)) next.opacity = clamp(styles.opacity, 0, 1)
  if (typeof styles.letterSpacing === 'number' && Number.isFinite(styles.letterSpacing)) next.letterSpacing = styles.letterSpacing
  if (typeof styles.lineHeightMultiplier === 'number' && Number.isFinite(styles.lineHeightMultiplier)) next.lineHeightMultiplier = clamp(styles.lineHeightMultiplier, 0.5, 5)
  if (styles.mascotBehavior === 'patrol' || styles.mascotBehavior === 'bounce' || styles.mascotBehavior === 'orbit' || styles.mascotBehavior === 'idle' || styles.mascotBehavior === 'wander') next.mascotBehavior = styles.mascotBehavior
  if (typeof styles.mascotSpeed === 'number' && Number.isFinite(styles.mascotSpeed)) next.mascotSpeed = clamp(styles.mascotSpeed, 0.1, 5)
  if (typeof styles.mascotPreset === 'string' && styles.mascotPreset in MASCOT_PRESETS) next.mascotPreset = styles.mascotPreset
  if (typeof styles.mascotPath === 'string') next.mascotPath = styles.mascotPath
  if (typeof styles.mascotSpeech === 'string') next.mascotSpeech = styles.mascotSpeech
  if (styles.mascotHullMode === 'rect' || styles.mascotHullMode === 'silhouette') next.mascotHullMode = styles.mascotHullMode
  // Animated GIF styles
  if (typeof styles.gifPath === 'string') next.gifPath = styles.gifPath
  if (isAnimatedGifBehavior(styles.gifBehavior)) next.gifBehavior = styles.gifBehavior
  if (typeof styles.gifSpeed === 'number' && Number.isFinite(styles.gifSpeed)) next.gifSpeed = clamp(styles.gifSpeed, 0.1, 5)
  if (styles.gifHullMode === 'rect' || styles.gifHullMode === 'silhouette') next.gifHullMode = styles.gifHullMode
  if (typeof styles.gifFrameCount === 'number' && Number.isFinite(styles.gifFrameCount)) next.gifFrameCount = Math.max(0, Math.round(styles.gifFrameCount))
  if (typeof styles.gifDuration === 'number' && Number.isFinite(styles.gifDuration)) next.gifDuration = Math.max(0, styles.gifDuration)
  // Table styles
  if (typeof styles.tableHeaderRows === 'number' && Number.isFinite(styles.tableHeaderRows)) next.tableHeaderRows = Math.max(0, Math.round(styles.tableHeaderRows))
  if (typeof styles.tableStriped === 'boolean') next.tableStriped = styles.tableStriped
  if (typeof styles.tableStripeColor === 'string') next.tableStripeColor = styles.tableStripeColor
  return next
}

export function normalizeVariable(variable: TemplateVar): TemplateVar {
  const next: TemplateVar = {
    name: sanitizeVariableName(variable.name),
    label: typeof variable.label === 'string' ? variable.label : variable.name,
    value: typeof variable.value === 'string' ? variable.value : '',
  }
  if (typeof variable.fallback === 'string') next.fallback = variable.fallback
  return next
}

export function isStoredDocument(value: unknown): value is StoredDocument {
  return safeParseStoredDocument(value).success
}

export function parseImportedTemplateDocument(value: unknown): StoredDocument | null {
  const parsed = parseImportedDocument(value)
  return parsed === null ? null : normalizeStoredDocument(parsed)
}

function normalizePaperSize(raw: Partial<PaperSize> | undefined): PaperSize {
  if (raw === undefined || typeof raw !== 'object' || raw === null) return { ...DEFAULT_PAPER_SIZE }
  const id = isPaperSizeId(raw.id) ? raw.id : 'email'
  // For known presets, prefer the canonical dimensions; for custom, accept stored values
  if (id !== 'custom') {
    const preset = PAPER_SIZE_PRESETS.find(p => p.id === id)
    if (preset !== undefined) return { id: preset.id, width: preset.width, height: preset.height, margin: preset.margin }
  }
  return {
    id,
    width: typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0 ? raw.width : DEFAULT_PAPER_SIZE.width,
    height: typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0 ? raw.height : DEFAULT_PAPER_SIZE.height,
    margin: typeof raw.margin === 'number' && Number.isFinite(raw.margin) && raw.margin >= 0 ? raw.margin : DEFAULT_PAPER_SIZE.margin,
  }
}
