import {
  DEFAULT_PAPER_SIZE,
  MAX_HISTORY,
  PAPER_SIZE_PRESETS,
  type PaperSize,
  type SavedTemplate,
  type StoredDocument,
  type StudioState,
} from './schema.ts'
import {
  hydrateStoredElement,
  normalizeStoredDocument,
  readTemplateStore,
  serializeCanvasElement,
  writeTemplateStore,
} from './persistence.ts'
import { remapElementsToPaperSize } from './paper-size.ts'
import { capitalize, cloneData, createId } from './utils.ts'

type HistoryState = {
  past: StoredDocument[]
  future: StoredDocument[]
}

type ApplyDocumentOptions = {
  resetHistory: boolean
  keepTemplateMetadata: boolean
}

type LifecycleHooks = {
  state: StudioState
  history: HistoryState
  storageKey: string
  getAutoSaveTimer: () => number | null
  setAutoSaveTimer: (timer: number | null) => void
  clearPreparedCache: () => void
  clearTextProjectionCache: () => void
  clearInlineEditor: () => void
  clearMascotAnimationState: () => void
  syncMascotAnimation: () => void
  scheduleRender: () => void
  showToast: (message: string) => void
  writeDocumentBackup: (storageKey: string, document: StoredDocument) => void
  templateNameInput: HTMLInputElement
  loadTemplateButton: HTMLButtonElement
  canvasSurface: HTMLDivElement
  deviceCaptionLabel: HTMLElement
}

export function loadLatestTemplate(hooks: LifecycleHooks): void {
  const latest = readTemplateStore(hooks.storageKey)[0]
  if (latest === undefined) {
    hooks.showToast('No saved templates yet')
    return
  }
  loadTemplateById(latest.id, hooks)
}

export function loadTemplateById(templateId: string, hooks: LifecycleHooks): void {
  const template = readTemplateStore(hooks.storageKey).find(item => item.id === templateId)
  if (template === undefined) {
    hooks.showToast('Template not found')
    return
  }
  applyDocument(template.current, { resetHistory: true, keepTemplateMetadata: true }, hooks)
  hooks.state.templateId = template.id
  hooks.state.templateName = template.name
  hooks.state.description = template.description
  hooks.state.version = template.version
  hooks.state.lastSavedAt = template.updatedAt
  hooks.state.dirty = false
  hooks.scheduleRender()
  hooks.showToast(`Loaded ${template.name}`)
}

export function restoreTemplateVersion(templateId: string, versionId: string, hooks: LifecycleHooks): void {
  const template = readTemplateStore(hooks.storageKey).find(item => item.id === templateId)
  const version = template?.versions.find(item => item.id === versionId)
  if (template === undefined || version === undefined) {
    hooks.showToast('Version not found')
    return
  }
  applyDocument(version.document, { resetHistory: true, keepTemplateMetadata: true }, hooks)
  hooks.state.templateId = template.id
  hooks.state.templateName = template.name
  hooks.state.description = template.description
  hooks.state.version = version.version
  hooks.state.lastSavedAt = version.savedAt
  hooks.state.dirty = true
  hooks.scheduleRender()
  hooks.showToast(`Restored version ${version.version}`)
}

export function deleteStoredTemplate(templateId: string, hooks: LifecycleHooks): void {
  const templates = readTemplateStore(hooks.storageKey)
  const nextTemplates = templates.filter(template => template.id !== templateId)
  if (nextTemplates.length === templates.length) return
  writeTemplateStore(hooks.storageKey, nextTemplates)
  if (hooks.state.templateId === templateId) {
    hooks.state.templateId = null
    hooks.state.version = 0
    hooks.state.lastSavedAt = null
    hooks.state.dirty = true
  }
  hooks.scheduleRender()
  hooks.showToast('Saved template deleted')
}

export function saveCurrentTemplate(hooks: LifecycleHooks, asNew = false): void {
  const templates = readTemplateStore(hooks.storageKey)
  const nextDocument = serializeDocument(hooks)
  const now = new Date().toISOString()
  const existingId = !asNew ? hooks.state.templateId : null
  const nextId = existingId ?? createId('tpl')
  const existingTemplate = templates.find(template => template.id === nextId)
  const nextVersion = (existingTemplate?.version ?? 0) + 1
  const maxVersions = 30
  const nextTemplate: SavedTemplate = {
    id: nextId,
    name: hooks.state.templateName.trim() || 'Untitled template',
    description: hooks.state.description,
    createdAt: existingTemplate?.createdAt ?? now,
    updatedAt: now,
    version: nextVersion,
    current: nextDocument,
    versions: [
      ...(existingTemplate?.versions ?? []),
      {
        id: createId('ver'),
        version: nextVersion,
        savedAt: now,
        document: nextDocument,
      },
    ].slice(-maxVersions),
  }
  const withoutCurrent = templates.filter(template => template.id !== nextId)
  withoutCurrent.unshift(nextTemplate)
  writeTemplateStore(hooks.storageKey, withoutCurrent)
  hooks.writeDocumentBackup(hooks.storageKey, nextDocument)
  hooks.state.templateId = nextId
  hooks.state.templateName = nextTemplate.name
  hooks.state.version = nextVersion
  hooks.state.lastSavedAt = now
  hooks.state.dirty = false
  hooks.templateNameInput.value = hooks.state.templateName
  hooks.loadTemplateButton.disabled = false
  hooks.scheduleRender()
  hooks.showToast(asNew ? 'Template saved as new entry' : 'Template saved')
}

export function serializeDocument(hooks: Pick<LifecycleHooks, 'state'>): StoredDocument {
  return normalizeStoredDocument({
    name: hooks.state.templateName,
    description: hooks.state.description,
    elements: hooks.state.elements.map(serializeCanvasElement),
    variables: cloneData(hooks.state.variables),
    wrapMode: hooks.state.wrapMode,
    surfaceTheme: hooks.state.surfaceTheme,
    manualPageCount: hooks.state.manualPageCount,
    paperSize: { ...hooks.state.paperSize },
    emailFormat: hooks.state.emailFormat,
    emailBreakpoint: hooks.state.emailBreakpoint,
  })
}

export function applyDocument(documentState: StoredDocument, options: ApplyDocumentOptions, hooks: LifecycleHooks): void {
  const normalized = normalizeStoredDocument(documentState)
  hooks.state.templateName = options.keepTemplateMetadata ? hooks.state.templateName : normalized.name
  hooks.state.description = options.keepTemplateMetadata ? hooks.state.description : normalized.description
  hooks.state.elements = normalized.elements.map(hydrateStoredElement)
  hooks.state.variables = cloneData(normalized.variables)
  hooks.state.wrapMode = normalized.wrapMode
  hooks.state.surfaceTheme = normalized.surfaceTheme
  hooks.state.manualPageCount = normalized.manualPageCount
  hooks.state.paperSize = normalized.paperSize !== undefined ? { ...normalized.paperSize } : { ...DEFAULT_PAPER_SIZE }
  hooks.state.emailFormat = normalized.emailFormat ?? 'legacy'
  hooks.state.emailBreakpoint = normalized.emailBreakpoint ?? 480
  hooks.state.zoomMode = 'fit'
  hooks.state.zoom = 1
  hooks.state.selectedId = null
  hooks.state.selectedIds = new Set()
  hooks.clearInlineEditor()
  hooks.clearPreparedCache()
  hooks.clearTextProjectionCache()
  normalizeCanvasExtent(hooks)
  if (options.resetHistory) {
    hooks.history.past = []
    hooks.history.future = []
  }
  hooks.clearMascotAnimationState()
  hooks.syncMascotAnimation()
  applyCanvasDimensions(hooks)
  hooks.scheduleRender()
}

export function recordState(hooks: Pick<LifecycleHooks, 'state' | 'history'>): void {
  const snapshot = serializeDocument(hooks)
  hooks.history.past.push(snapshot)
  if (hooks.history.past.length > MAX_HISTORY) hooks.history.past.shift()
  hooks.history.future = []
}

export function undo(hooks: LifecycleHooks): void {
  const snapshot = hooks.history.past.pop()
  if (snapshot === undefined) return
  hooks.history.future.push(serializeDocument(hooks))
  applyDocument(snapshot, { resetHistory: false, keepTemplateMetadata: false }, hooks)
  hooks.state.dirty = true
  hooks.scheduleRender()
  hooks.showToast('Undo')
}

export function redo(hooks: LifecycleHooks): void {
  const snapshot = hooks.history.future.pop()
  if (snapshot === undefined) return
  hooks.history.past.push(serializeDocument(hooks))
  applyDocument(snapshot, { resetHistory: false, keepTemplateMetadata: false }, hooks)
  hooks.state.dirty = true
  hooks.scheduleRender()
  hooks.showToast('Redo')
}

export function markDirty(hooks: LifecycleHooks, showChanged = true): void {
  hooks.state.dirty = true
  if (showChanged) hooks.scheduleRender()
  const autoSaveTimer = hooks.getAutoSaveTimer()
  if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer)
  hooks.setAutoSaveTimer(window.setTimeout(() => {
    hooks.setAutoSaveTimer(null)
    if (hooks.state.dirty) {
      try {
        hooks.writeDocumentBackup(hooks.storageKey, serializeDocument(hooks))
        saveCurrentTemplate(hooks)
      } catch {
        // Silent auto-save failure — user can still save manually.
      }
    }
  }, 30_000))
}

export function normalizeCanvasExtent(hooks: Pick<LifecycleHooks, 'state'>): void {
  const deepestBottom = hooks.state.elements.reduce((max, element) => Math.max(max, element.y + element.height + pageMargin(hooks.state)), pageHeight(hooks.state))
  const autoPages = Math.max(1, Math.ceil(deepestBottom / pageHeight(hooks.state)))
  hooks.state.pageCount = Math.max(hooks.state.manualPageCount, autoPages)
  hooks.state.canvasHeight = hooks.state.pageCount * pageHeight(hooks.state)
  hooks.state.currentPage = clampPageIndex(hooks.state)
}

export function maybeExtendPages(requiredBottom: number, hooks: Pick<LifecycleHooks, 'state'>): void {
  if (requiredBottom + pageMargin(hooks.state) <= hooks.state.canvasHeight) return
  hooks.state.manualPageCount = Math.max(hooks.state.manualPageCount, Math.ceil((requiredBottom + pageMargin(hooks.state)) / pageHeight(hooks.state)))
  normalizeCanvasExtent(hooks)
}

export function applyCanvasDimensions(hooks: Pick<LifecycleHooks, 'state' | 'canvasSurface' | 'deviceCaptionLabel'>): void {
  hooks.canvasSurface.style.width = `${canvasWidth(hooks.state)}px`
  hooks.canvasSurface.style.setProperty('--page-margin', `${pageMargin(hooks.state)}px`)
  normalizeCanvasExtent(hooks)
  hooks.deviceCaptionLabel.textContent = `${capitalize(hooks.state.viewMode)} preview · ${canvasWidth(hooks.state)}px`
}

export function changePaperSize(newSize: PaperSize, hooks: LifecycleHooks): void {
  if (newSize.width === hooks.state.paperSize.width && newSize.height === hooks.state.paperSize.height && newSize.margin === hooks.state.paperSize.margin) {
    hooks.state.paperSize.id = newSize.id
    return
  }
  recordState(hooks)
  const oldPaperSize = { ...hooks.state.paperSize }
  hooks.state.paperSize = { ...newSize }
  remapElementsToPaperSize(hooks.state.elements, oldPaperSize, newSize)

  hooks.clearPreparedCache()
  hooks.clearTextProjectionCache()
  hooks.state.zoomMode = 'fit'
  hooks.state.zoom = 1
  applyCanvasDimensions(hooks)
  markDirty(hooks)
  hooks.scheduleRender()
  hooks.showToast(`Paper: ${PAPER_SIZE_PRESETS.find(preset => preset.id === newSize.id)?.label ?? 'Custom'}`)
}

function canvasWidth(state: StudioState): number {
  return state.paperSize.width
}

function pageHeight(state: StudioState): number {
  return state.paperSize.height
}

function pageMargin(state: StudioState): number {
  return state.paperSize.margin
}

function clampPageIndex(state: StudioState): number {
  return Math.min(Math.max(Math.floor(state.currentPage), 0), state.pageCount - 1)
}
