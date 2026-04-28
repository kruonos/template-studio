import { z } from 'zod'
import { MASCOT_PRESETS } from './mascots.ts'
import {
  STORAGE_VERSION,
  type DocumentBackup,
  type ElementStyles,
  type MascotPreset,
  type PersistedStore,
  type SavedTemplate,
  type SavedVersion,
  type StoredCanvasElement,
  type StoredDocument,
  type TableData,
  type TemplateVar,
  asElementId,
} from './schema.ts'
import { normalizeTableData, parseTableData } from './table-engine.ts'

const mascotBehaviorSchema = z.enum(['patrol', 'bounce', 'orbit', 'idle', 'wander'])
const animatedGifBehaviorSchema = z.enum(['path-loop', 'path-bounce', 'path-once', 'static'])
const wrapModeSchema = z.enum(['strict', 'normal', 'freedom'])
const surfaceThemeSchema = z.enum(['light', 'dark'])
const textAlignSchema = z.enum(['left', 'center', 'right'])
const textDecorationSchema = z.enum(['none', 'underline'])
const fontStyleSchema = z.enum(['normal', 'italic'])
const hullModeSchema = z.enum(['rect', 'silhouette'])
const emailFormatSchema = z.enum(['mjml', 'legacy'])
const paperSizeIdSchema = z.enum([
  'email',
  'a4-portrait',
  'a4-landscape',
  'a3-portrait',
  'a3-landscape',
  'letter-portrait',
  'letter-landscape',
  'legal-portrait',
  'legal-landscape',
  'flashcard-3x5',
  'flashcard-4x6',
  'custom',
])

const paperSizeSchema = z.object({
  id: paperSizeIdSchema,
  width: z.number().finite(),
  height: z.number().finite(),
  margin: z.number().finite(),
})

const cellBorderStyleSchema = z.object({
  width: z.number().finite(),
  color: z.string(),
  style: z.enum(['solid', 'dashed', 'dotted', 'none']),
})

const cellStylesSchema = z.object({
  borderTop: cellBorderStyleSchema.optional(),
  borderRight: cellBorderStyleSchema.optional(),
  borderBottom: cellBorderStyleSchema.optional(),
  borderLeft: cellBorderStyleSchema.optional(),
  background: z.string().optional(),
  padding: z.number().finite().optional(),
  hAlign: z.enum(['left', 'center', 'right']).optional(),
  vAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().finite().optional(),
  fontWeight: z.number().finite().optional(),
  fontStyle: fontStyleSchema.optional(),
  color: z.string().optional(),
})

const tableCellSchema = z.object({
  row: z.number().finite(),
  col: z.number().finite(),
  rowspan: z.number().finite(),
  colspan: z.number().finite(),
  content: z.string(),
  styles: cellStylesSchema,
})

const tableDataObjectSchema = z.object({
  rows: z.number().finite(),
  cols: z.number().finite(),
  colWidths: z.array(z.number().finite()),
  rowHeights: z.array(z.number().finite()),
  cells: z.array(tableCellSchema),
  headerRows: z.number().finite(),
  defaultBorder: cellBorderStyleSchema,
})

const tableDataSchema = z.union([
  tableDataObjectSchema,
  z.string().transform((value, ctx) => {
    const parsed = parseTableData(value)
    if (parsed !== null) return parsed
    ctx.addIssue({ code: 'custom', message: 'Invalid table JSON' })
    return z.NEVER
  }),
]).transform(data => normalizeTableData(data as TableData))

const templateVarSchema = z.object({
  name: z.string(),
  label: z.string(),
  value: z.string(),
  fallback: z.string().optional(),
})

const mascotPresetKeys = new Set(Object.keys(MASCOT_PRESETS))

const elementStylesSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.number().finite().optional(),
  fontWeight: z.number().finite().optional(),
  fontStyle: fontStyleSchema.optional(),
  textAlign: textAlignSchema.optional(),
  wordBreak: z.enum(['normal', 'keep-all']).optional(),
  textDecoration: textDecorationSchema.optional(),
  letterSpacing: z.number().finite().optional(),
  lineHeightMultiplier: z.number().finite().optional(),
  color: z.string().optional(),
  background: z.string().optional(),
  borderRadius: z.number().finite().optional(),
  href: z.string().optional(),
  opacity: z.number().finite().optional(),
  mascotBehavior: mascotBehaviorSchema.optional(),
  mascotSpeed: z.number().finite().optional(),
  mascotPreset: z.string().refine(value => mascotPresetKeys.has(value), 'Invalid mascot preset').optional(),
  mascotPath: z.string().optional(),
  mascotSpeech: z.string().optional(),
  mascotHullMode: hullModeSchema.optional(),
  gifPath: z.string().optional(),
  gifBehavior: animatedGifBehaviorSchema.optional(),
  gifSpeed: z.number().finite().optional(),
  gifHullMode: hullModeSchema.optional(),
  gifFrameCount: z.number().finite().optional(),
  gifDuration: z.number().finite().optional(),
  tableHeaderRows: z.number().finite().optional(),
  tableStriped: z.boolean().optional(),
  tableStripeColor: z.string().optional(),
})

const canvasElementBaseSchema = z.object({
  id: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  styles: elementStylesSchema,
  locked: z.boolean().optional(),
})

const stringContentElementSchema = canvasElementBaseSchema.extend({
  type: z.enum(['heading', 'text', 'image', 'button', 'divider', 'spacer', 'html', 'video', 'mascot', 'animated-gif']),
  content: z.string(),
})

const tableElementSchema = canvasElementBaseSchema.extend({
  type: z.literal('table'),
  content: tableDataSchema,
})

const canvasElementSchema = z.union([stringContentElementSchema, tableElementSchema])

const storedDocumentSchema = z.object({
  name: z.string(),
  description: z.string(),
  elements: z.array(canvasElementSchema),
  variables: z.array(templateVarSchema),
  wrapMode: wrapModeSchema,
  surfaceTheme: surfaceThemeSchema,
  manualPageCount: z.number().finite(),
  paperSize: paperSizeSchema.optional(),
  emailFormat: emailFormatSchema.optional(),
  emailBreakpoint: z.number().finite().optional(),
})

const savedVersionSchema = z.object({
  id: z.string(),
  version: z.number().finite(),
  savedAt: z.string(),
  document: storedDocumentSchema,
})

const savedTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().finite(),
  current: storedDocumentSchema,
  versions: z.array(savedVersionSchema),
})

const persistedStoreSchema = z.object({
  version: z.number().finite().optional(),
  templates: z.array(savedTemplateSchema),
})

const importEnvelopeSchema = z.object({
  template: storedDocumentSchema.optional(),
  current: storedDocumentSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
})

const documentBackupSchema = z.object({
  version: z.number().finite(),
  savedAt: z.string(),
  document: storedDocumentSchema,
})

function toTemplateVar(variable: z.infer<typeof templateVarSchema>): TemplateVar {
  const next: TemplateVar = {
    name: variable.name,
    label: variable.label,
    value: variable.value,
  }
  if (variable.fallback !== undefined) next.fallback = variable.fallback
  return next
}

function toElementStyles(styles: z.infer<typeof elementStylesSchema>): ElementStyles {
  const next: ElementStyles = {}
  if (styles.fontFamily !== undefined) next.fontFamily = styles.fontFamily
  if (styles.fontSize !== undefined) next.fontSize = styles.fontSize
  if (styles.fontWeight !== undefined) next.fontWeight = styles.fontWeight
  if (styles.fontStyle !== undefined) next.fontStyle = styles.fontStyle
  if (styles.textAlign !== undefined) next.textAlign = styles.textAlign
  if (styles.wordBreak !== undefined) next.wordBreak = styles.wordBreak
  if (styles.textDecoration !== undefined) next.textDecoration = styles.textDecoration
  if (styles.letterSpacing !== undefined) next.letterSpacing = styles.letterSpacing
  if (styles.lineHeightMultiplier !== undefined) next.lineHeightMultiplier = styles.lineHeightMultiplier
  if (styles.color !== undefined) next.color = styles.color
  if (styles.background !== undefined) next.background = styles.background
  if (styles.borderRadius !== undefined) next.borderRadius = styles.borderRadius
  if (styles.href !== undefined) next.href = styles.href
  if (styles.opacity !== undefined) next.opacity = styles.opacity
  if (styles.mascotBehavior !== undefined) next.mascotBehavior = styles.mascotBehavior
  if (styles.mascotSpeed !== undefined) next.mascotSpeed = styles.mascotSpeed
  if (styles.mascotPreset !== undefined) next.mascotPreset = styles.mascotPreset as MascotPreset
  if (styles.mascotPath !== undefined) next.mascotPath = styles.mascotPath
  if (styles.mascotSpeech !== undefined) next.mascotSpeech = styles.mascotSpeech
  if (styles.mascotHullMode !== undefined) next.mascotHullMode = styles.mascotHullMode
  if (styles.gifPath !== undefined) next.gifPath = styles.gifPath
  if (styles.gifBehavior !== undefined) next.gifBehavior = styles.gifBehavior
  if (styles.gifSpeed !== undefined) next.gifSpeed = styles.gifSpeed
  if (styles.gifHullMode !== undefined) next.gifHullMode = styles.gifHullMode
  if (styles.gifFrameCount !== undefined) next.gifFrameCount = styles.gifFrameCount
  if (styles.gifDuration !== undefined) next.gifDuration = styles.gifDuration
  if (styles.tableHeaderRows !== undefined) next.tableHeaderRows = styles.tableHeaderRows
  if (styles.tableStriped !== undefined) next.tableStriped = styles.tableStriped
  if (styles.tableStripeColor !== undefined) next.tableStripeColor = styles.tableStripeColor
  return next
}

function toStoredCanvasElement(element: z.infer<typeof canvasElementSchema>): StoredCanvasElement {
  const next = {
    id: asElementId(element.id),
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    styles: toElementStyles(element.styles),
  }
  if (element.type === 'table') {
    const tableElement: StoredCanvasElement = {
      ...next,
      type: 'table',
      content: element.content,
    }
    if (element.locked !== undefined) tableElement.locked = element.locked
    return tableElement
  }
  const contentElement: StoredCanvasElement = {
    ...next,
    type: element.type,
    content: element.content,
  }
  if (element.locked !== undefined) contentElement.locked = element.locked
  return contentElement
}

function toStoredDocument(document: z.infer<typeof storedDocumentSchema>): StoredDocument {
  const next: StoredDocument = {
    name: document.name,
    description: document.description,
    elements: document.elements.map(toStoredCanvasElement),
    variables: document.variables.map(toTemplateVar),
    wrapMode: document.wrapMode,
    surfaceTheme: document.surfaceTheme,
    manualPageCount: document.manualPageCount,
  }
  if (document.paperSize !== undefined) next.paperSize = document.paperSize
  if (document.emailFormat !== undefined) next.emailFormat = document.emailFormat
  if (document.emailBreakpoint !== undefined) next.emailBreakpoint = document.emailBreakpoint
  return next
}

function toSavedVersion(version: z.infer<typeof savedVersionSchema>): SavedVersion {
  return {
    id: version.id,
    version: version.version,
    savedAt: version.savedAt,
    document: toStoredDocument(version.document),
  }
}

function toSavedTemplate(template: z.infer<typeof savedTemplateSchema>): SavedTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    version: template.version,
    current: toStoredDocument(template.current),
    versions: template.versions.map(toSavedVersion),
  }
}

export function safeParseStoredDocument(value: unknown): { success: true; data: StoredDocument } | { success: false } {
  const parsed = storedDocumentSchema.safeParse(value)
  if (!parsed.success) return { success: false }
  return { success: true, data: toStoredDocument(parsed.data) }
}

export function parsePersistedStore(value: unknown): PersistedStore {
  const parsed = persistedStoreSchema.parse(value)
  return {
    version: parsed.version ?? STORAGE_VERSION,
    templates: parsed.templates.map(toSavedTemplate),
  }
}

export function parseImportedDocument(value: unknown): StoredDocument | null {
  const directDocument = storedDocumentSchema.safeParse(value)
  if (directDocument.success) return toStoredDocument(directDocument.data)
  const envelope = importEnvelopeSchema.safeParse(value)
  if (!envelope.success) return null
  if (envelope.data.template !== undefined) return toStoredDocument(envelope.data.template)
  if (envelope.data.current !== undefined) return toStoredDocument(envelope.data.current)
  return null
}

export function parseDocumentBackup(value: unknown): DocumentBackup {
  const parsed = documentBackupSchema.parse(value)
  return {
    version: parsed.version,
    savedAt: parsed.savedAt,
    document: toStoredDocument(parsed.document),
  }
}
