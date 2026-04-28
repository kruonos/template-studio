import {
  getPolygonIntervalForBand,
  getWrapHull,
  transformWrapPoints,
  type Interval,
  type Point,
} from './wrap-geometry.ts'
import {
  DEFAULT_PAPER_SIZE,
  DOCX_MIME,
  STORAGE_KEY,
  asElementId,
  createDefaultVariables,
  paperSizeFromPreset,
  type CanvasElement,
  type DragState,
  type ElementStyles,
  type ElementType,
  type ExportFormat,
  type ExportSnapshot,
  type InlineEditorState,
  type MarqueeState,
  type PaperSize,
  type ResizeState,
  type StoredDocument,
  type StudioState,
  type SurfaceTheme,
  type TextAlign,
  type TextProjection,
  type UiTheme,
} from './schema.ts'
import {
  MASCOT_PRESETS,
  type MascotAnimState,
} from './mascots.ts'
import {
  PRESETS,
  createBlankDocument,
  createLaunchBriefDocument,
} from './templates.ts'
import {
  clamp,
  cloneData,
  createId,
  escapeHtml,
  isElementType,
  isExportFormat,
  isInlineEditableType,
  isPaperSizeId,
  isSidebarTab,
  isSurfaceTheme,
  isTextBlock,
  isTextualElement,
  isViewMode,
  isWrapMode,
  parseNumber,
  roundTo,
  slugifyFilename,
} from './utils.ts'
import { getPageBuilderDom, requireElement } from './dom.ts'
import {
  normalizeStoredDocument,
  parseImportedTemplateDocument,
  readDocumentBackup,
  readTemplateStore,
  writeDocumentBackup,
} from './persistence.ts'
import {
  applySurfaceTheme,
  applyUiTheme,
  getActiveUiTheme,
  getDefaultBorderRadius,
  getSurfacePalette,
  readStoredUiTheme,
} from './theme.ts'
import {
  normalizeSafeUrl,
  sanitizeHtml,
} from './content.ts'
import {
  resetGifAnimState,
  resetGifBasePositions,
} from './animated-media.ts'
import type { TableData } from './schema.ts'
import {
  computeTableHeight,
  evaluateFormulas,
  getCell,
  getCellRect,
  getEffectiveBorder,
  parseTableData,
  serializeTableData,
} from './table-engine.ts'
import {
  getElementFontFamily,
  getElementFontShorthand,
  getElementFontSize,
  getElementFontWeight,
  getElementLineHeight,
  getElementTextColor,
} from './element-typography.ts'
import { resolveVariables as resolveTemplateVariables } from './template-variables.ts'
import {
  getAnimatedGifSource,
  getImageSource,
  getMascotVisualSource,
  getVideoEmbedSource,
  getVideoHref,
} from './element-media.ts'
import {
  getBaseCanvasScale as getViewportBaseCanvasScale,
  getCanvasScale as getViewportCanvasScale,
  getViewportPreviewWidth,
} from './viewport-scale.ts'
import { buildExportSnapshot as buildExportSnapshotExport } from './export-snapshot.ts'
import {
  applyDocument as applyDocumentController,
  changePaperSize as changePaperSizeController,
  deleteStoredTemplate as deleteStoredTemplateController,
  loadLatestTemplate as loadLatestTemplateController,
  loadTemplateById as loadTemplateByIdController,
  markDirty as markDirtyController,
  maybeExtendPages as maybeExtendPagesController,
  normalizeCanvasExtent as normalizeCanvasExtentController,
  recordState as recordStateController,
  redo as redoController,
  restoreTemplateVersion as restoreTemplateVersionController,
  saveCurrentTemplate as saveCurrentTemplateController,
  serializeDocument as serializeDocumentController,
  undo as undoController,
} from './document-lifecycle.ts'
import {
  renderLayersList as renderSidebarLayersList,
  renderShortcutsModal as renderSidebarShortcutsModal,
  renderSidebarPanels as renderSidebarTabs,
  renderTemplatesPanel as renderSidebarTemplatesPanel,
  renderVariablesList as renderSidebarVariablesList,
  syncToolbarState as syncSidebarToolbarState,
  updateStatusSurface as updateSidebarStatusSurface,
} from './sidebar-ui.ts'
import {
  addVariable as addVariableController,
  handleLayerListClick as handleLayerListClickController,
  handleTemplatesListClick as handleTemplatesListClickController,
  handleVariableListClick as handleVariableListClickController,
  handleVariableListInput as handleVariableListInputController,
  handleVersionListClick as handleVersionListClickController,
} from './sidebar-actions.ts'
import {
  commitTableCellEdit as commitTableCellEditUi,
  handleTableAction as handleTableActionUi,
  handleTableCellClick as handleTableCellClickUi,
  handleTableDoubleClick as handleTableDoubleClickUi,
  renderTableElement as renderTableElementUi,
  type TableCellEditingState,
  type TableCellSelectionState,
} from './table-ui.ts'
import { handleKeyboardShortcut as handleEditorKeyboardShortcut } from './editor-shortcuts.ts'
import {
  handleCanvasDoubleClick as handleCanvasDoubleClickInteraction,
  handleCanvasPointerDown as handleCanvasPointerDownInteraction,
  handlePointerMove as handlePointerMoveInteraction,
  handlePointerUp as handlePointerUpInteraction,
} from './canvas-interactions.ts'
import {
  clearMarqueeNode as clearMarqueeNodeOverlay,
  clearSmartGuides as clearSmartGuidesOverlay,
  computeSmartGuides as computeSmartGuidesOverlay,
  getCanvasPoint as getCanvasPointOverlay,
  hideMeasurement as hideMeasurementOverlay,
  maybeCanvasPoint as maybeCanvasPointOverlay,
  renderGridOverlay as renderGridOverlayOverlay,
  renderMarquee as renderMarqueeOverlay,
  renderSmartGuides as renderSmartGuidesOverlay,
  showMeasurement as showMeasurementOverlay,
  updateDropIndicator as updateDropIndicatorOverlay,
  updateMarqueeSelection as updateMarqueeSelectionOverlay,
  type SmartGuideLine,
  type SmartGuideResult,
} from './canvas-overlays.ts'
import {
  alignSelectedElements as alignSelectedElementsController,
  closeContextMenu as closeContextMenuController,
  distributeSelectedElements as distributeSelectedElementsController,
  handleContextAction as handleContextActionController,
  openContextMenu as openContextMenuController,
  renderContextMenu as renderContextMenuController,
} from './context-menu.ts'
import {
  cancelPathTrace as cancelPathTraceAnimation,
  commitPathTrace as commitPathTraceAnimation,
  parseMascotPath as parseMascotPathAnimation,
  renderGifPathOverlay as renderGifPathOverlayAnimation,
  renderMascotPathOverlay as renderMascotPathOverlayAnimation,
  renderPathOverlay as renderPathOverlayAnimation,
  startPathTrace as startPathTraceAnimation,
  toggleTracePathMode as toggleTracePathModeAnimation,
  type PathTraceState,
} from './animation-paths.ts'
import { renderPropertiesPanel as renderPropertiesPanelView } from './properties-panel.ts'
import {
  handleInspectorClick as handleInspectorClickController,
  handleInspectorInput as handleInspectorInputController,
} from './inspector-controller.ts'
import {
  renderCanvasViewport as renderCanvasViewportView,
  renderPageGuides as renderPageGuidesView,
} from './canvas-viewport-ui.ts'
import { renderCanvasElements as renderCanvasElementsView } from './canvas-elements-renderer.ts'
import { renderInlineEditor as renderInlineEditorView } from './inline-editor-ui.ts'
import {
  getGifSilhouetteInterval as getGifSilhouetteIntervalController,
  handleGifUpload as handleGifUploadController,
} from './gif-helpers.ts'
import {
  stopGifAnimation as stopGifAnimationController,
  syncGifAnimation as syncGifAnimationController,
} from './gif-animation.ts'
import {
  resetMascotBasePositions as resetMascotBasePositionsController,
  stopMascotAnimation as stopMascotAnimationController,
  syncMascotAnimation as syncMascotAnimationController,
  updateMascotPositions as updateMascotPositionsController,
} from './mascot-animation.ts'
import { sendTestEmail as sendTestEmailController } from './email-test.ts'
import {
  closeGifExportDialog as closeGifExportDialogController,
  downloadGifExport as downloadGifExportController,
  openGifExportDialog as openGifExportDialogController,
  renderGifExport as renderGifExportController,
} from './gif-export-ui.ts'
import { handleImageUpload as handleImageUploadController } from './image-upload.ts'
import { createElement as createElementFactory } from './element-factory.ts'
import {
  buildAbsoluteHtmlDocument as buildAbsoluteHtmlDocumentController,
  buildDocxBlob as buildDocxBlobController,
  buildEmailHtml as buildEmailHtmlController,
  buildEmailText as buildEmailTextController,
  buildLegacyEmailHtml as buildLegacyEmailHtmlController,
  buildLegacyEmailHtmlResult as buildLegacyEmailHtmlResultController,
  buildPdfBlob as buildPdfBlobController,
} from './export-assembly.ts'
import { downloadBlob, downloadText } from './browser-download.ts'
import {
  fitElementWidthToContent as fitElementWidthToContentProjection,
  fitTextElementHeight as fitTextElementHeightProjection,
  getTableCellRenderState as getTableCellRenderStateProjection,
  projectTextElement as projectTextElementProjection,
} from './text-projection.ts'
import { createCacheManager } from './cache-manager.ts'
import { isUserError, UserError } from './errors.ts'
import { initAnimationLoop } from './animation-loop.ts'
import { initRenderLoop, requestRender } from './render-loop.ts'
import { createStore } from './store.ts'

const {
  canvasArea,
  canvasShell,
  canvasViewport,
  canvasSurface,
  canvas,
  pageGuides,
  inlineEditorLayer,
  dropIndicator,
  propsContent,
  statusText,
  templateNameInput,
  templateDescriptionInput,
  presetGrid,
  templatesList,
  versionsList,
  variablesList,
  layersList,
  pageIndicator,
  zoomIndicator,
  deviceCaptionLabel,
  deviceCaptionMeta,
  toast,
  errorBanner,
  errorText,
  exportMenu,
  templateImportInput,
  imageUploadInput,
  formatBlockSelect,
  formatFontSelect,
  formatSizeValue,
  dismissErrorButton,
  loadTemplateButton,
  contextMenuEl,
  smartGuidesLayer,
  paperSizeSelect,
  gifUploadInput,
  pathOverlay,
  tracePathButton,
  exportGifButton,
  gifExportOverlay,
  gifExportDurationInput,
  gifExportFpsInput,
  gifExportColorsSelect,
  gifExportScaleSelect,
  gifExportLoopInput,
  gifExportStatus,
  gifExportProgressBar,
  gifExportPreview,
  gifExportRenderButton,
  gifExportDownloadButton,
  gifExportCancelButton,
} = getPageBuilderDom()

const store = createStore({
  document: {
    templateId: null,
    templateName: 'Launch brief',
    description: '',
    elements: [],
    variables: cloneData(createDefaultVariables()),
    selectedId: null,
    selectedIds: new Set(),
    wrapMode: 'freedom',
    surfaceTheme: 'light',
    viewMode: 'desktop',
    zoomMode: 'fit',
    sidebarTab: 'components',
    zoom: 1,
    currentPage: 0,
    manualPageCount: 1,
    pageCount: 1,
    canvasHeight: DEFAULT_PAPER_SIZE.height,
    showGrid: false,
    showShortcuts: false,
    version: 0,
    lastSavedAt: null,
    dirty: false,
    paperSize: { ...DEFAULT_PAPER_SIZE },
    emailFormat: 'legacy',
    emailBreakpoint: 480,
  },
  history: {
    past: [],
    future: [],
  },
  interaction: {
    inlineEditorState: null,
    paletteDragType: null,
    dragState: null,
    resizeState: null,
    focusHistoryTarget: null,
    contextMenuState: null,
    marqueeState: null,
    marqueeNode: null,
    measurementNode: null,
    pathTraceState: null,
    pathTraceMode: false,
    table: {
      selection: null,
      editing: null,
      colResize: null,
      rowResize: null,
      pendingClick: null,
    },
  },
  runtime: {
    renderVersion: 0,
    toastTimer: null,
    autoSaveTimer: null,
    imageUploadTargetId: null,
    clipboard: null,
    elementNodes: new Map<string, HTMLDivElement>(),
    cacheManager: createCacheManager(),
    gifExportPreviewUrl: null,
  },
  animation: {
    mascotAnimStates: new Map<string, MascotAnimState>(),
    mascotAnimFrameId: null,
    mascotLastFrameTime: 0,
    mascotHullCache: new Map<string, Point[] | null>(),
    mascotHullPending: new Set<string>(),
    gifAnimFrameId: null,
    gifLastFrameTime: 0,
    gifHullCache: new Map<string, { x: number; y: number }[] | null>(),
    gifHullPending: new Set<string>(),
  },
})

const appState = store.getMutableState()
const state: StudioState = appState.document
const history = appState.history
const interaction = appState.interaction
const runtime = appState.runtime
const animation = appState.animation
const tableState = interaction.table
const cacheManager = runtime.cacheManager
const preparedCache = cacheManager.preparedCache
const elementNodes = runtime.elementNodes
const mascotHullCache = animation.mascotHullCache
const mascotHullPending = animation.mascotHullPending
const gifHullCache = animation.gifHullCache
const gifHullPending = animation.gifHullPending

function resolveVariables(text: string): string {
  return resolveTemplateVariables(text, state.variables)
}

// ── State-driven dimension getters ──────────────────────────────
// All layout code should use these instead of the CANVAS_WIDTH / PAGE_HEIGHT /
// PAGE_MARGIN constants so that switching paper size takes effect everywhere.
function canvasW(): number { return state.paperSize.width }
function pageH(): number { return state.paperSize.height }
function pageMar(): number { return state.paperSize.margin }

function clearAllPreparedCache(): void {
  cacheManager.clearPrepared('fonts')
}

function invalidateAllTextProjection(reason: 'document' | 'fonts' | 'variables' | 'wrap-mode' | 'surface-theme' | 'paper-size' | 'obstacles'): void {
  cacheManager.invalidateAll(reason)
}

function invalidateTextProjectionForElement(elementId: string, reason: 'element-content' | 'element-layout' = 'element-layout'): void {
  cacheManager.invalidateElement(elementId, reason)
}

function clearTableInteractionState(): void {
  if (tableState.editing !== null) {
    commitTableCellEdit()
  }
  tableState.selection = null
  tableState.editing = null
  tableState.colResize = null
  tableState.rowResize = null
  const editor = inlineEditorLayer.querySelector('.table-cell-editor')
  if (editor !== null) editor.remove()
}

function primeMascotHull(element: CanvasElement): void {
  if (element.type !== 'mascot' || (element.styles.mascotHullMode ?? 'rect') !== 'silhouette') return
  const src = getMascotVisualSource(element, resolveVariables)
  if (src.length === 0 || mascotHullCache.has(src) || mascotHullPending.has(src)) return
  mascotHullPending.add(src)
  void getWrapHull(src, { smoothRadius: 8, mode: 'mean' })
    .then(points => {
      mascotHullCache.set(src, points)
      mascotHullPending.delete(src)
      scheduleRender()
    })
    .catch(() => {
      mascotHullCache.set(src, null)
      mascotHullPending.delete(src)
    })
}

function getMascotSilhouetteInterval(textElement: CanvasElement, mascot: CanvasElement, bandTop: number, bandBottom: number, padding: number): Interval | null {
  if ((mascot.styles.mascotHullMode ?? 'rect') !== 'silhouette') return null
  const src = getMascotVisualSource(mascot, resolveVariables)
  if (src.length === 0) return null
  primeMascotHull(mascot)
  const hull = mascotHullCache.get(src)
  if (hull === undefined || hull === null) return null
  const transformed = transformWrapPoints(hull, {
    x: mascot.x,
    y: mascot.y,
    width: mascot.width,
    height: mascot.height,
  }, 0)
  const interval = getPolygonIntervalForBand(
    transformed,
    bandTop,
    bandBottom,
    Math.max(4, mascot.width * 0.04),
    Math.max(2, mascot.height * 0.02),
  )
  if (interval === null) return null
  const left = Math.max(padding, interval.left - textElement.x)
  const right = Math.min(textElement.width - padding, interval.right - textElement.x)
  if (left >= right) return null
  return { left, right }
}

export function bootstrapTemplateStudio(): void {
  try {
    initRenderLoop(store, { render, onError: reportError })
    initAnimationLoop(store, { syncMascotAnimation, syncGifAnimation })
    applyUiTheme(readStoredUiTheme())
    mountPresetButtons()
    const requestedPreset = getRequestedPreset()
    const initialDocument = requestedPreset?.create(state.paperSize) ?? createLaunchBriefDocument(state.paperSize)
    applyDocument(normalizeStoredDocument(initialDocument), { resetHistory: true, keepTemplateMetadata: false })
    render()
    wireStaticEvents()
    if (requestedPreset === null) void tryLoadInitialTemplate()
    document.fonts.ready.then(() => {
      clearAllPreparedCache()
      invalidateAllTextProjection('fonts')
      scheduleRender()
    })
  } catch (error) {
    reportError('Initialization failed', error)
  }
}

function getRequestedPreset() {
  const presetId = new URLSearchParams(window.location.search).get('preset')
  if (presetId === null || presetId.length === 0) return null
  return PRESETS.find(preset => preset.id === presetId) ?? null
}

async function tryLoadInitialTemplate(): Promise<void> {
  const templates = readTemplateStore(STORAGE_KEY)
  if (templates.length > 0) {
    loadTemplateButton.disabled = false
    return
  }
  const backup = readDocumentBackup(STORAGE_KEY)
  if (backup === null) return
  applyDocument(backup.document, { resetHistory: true, keepTemplateMetadata: false })
  showToast(`Recovered backup from ${new Date(backup.savedAt).toLocaleString()}`)
}

function wireStaticEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-sidebar-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset['sidebarTab']
      if (!isSidebarTab(nextTab)) return
      state.sidebarTab = nextTab
      scheduleRender()
    })
  })

  document.querySelectorAll<HTMLElement>('.wrap-mode').forEach(button => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset['wrapMode']
      if (!isWrapMode(nextMode)) return
      state.wrapMode = nextMode
      markDirty()
      invalidateAllTextProjection('wrap-mode')
      scheduleRender()
    })
  })

  document.querySelectorAll<HTMLElement>('.view-mode').forEach(button => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset['viewMode']
      if (!isViewMode(nextMode)) return
      state.viewMode = nextMode
      scheduleRender()
    })
  })

  document.querySelectorAll<HTMLElement>('.surface-theme').forEach(button => {
    button.addEventListener('click', () => {
      const nextTheme = button.dataset['surfaceTheme']
      if (!isSurfaceTheme(nextTheme)) return
      applySurfaceTheme(state, nextTheme, recordState, () => markDirty(), () => invalidateAllTextProjection('surface-theme'), scheduleRender)
    })
  })

  paperSizeSelect.addEventListener('change', () => {
    const nextId = paperSizeSelect.value
    if (!isPaperSizeId(nextId)) return
    changePaperSize(paperSizeFromPreset(nextId))
  })

  requireElement<HTMLButtonElement>('btn-theme').addEventListener('click', () => {
    const nextTheme: UiTheme = getActiveUiTheme() === 'dark' ? 'light' : 'dark'
    applyUiTheme(nextTheme)
  })

  document.querySelectorAll<HTMLElement>('[data-component-type]').forEach(button => {
    button.addEventListener('mousedown', event => {
      const nextType = button.dataset['componentType']
      if (!isElementType(nextType)) return
      interaction.paletteDragType = nextType
      updateDropIndicator(event)
      event.preventDefault()
    })
  })

  document.addEventListener('mousemove', event => {
    safeAction('Pointer move', () => handlePointerMove(event))
  })
  document.addEventListener('mouseup', event => {
    safeAction('Pointer up', () => handlePointerUp(event))
  })

  window.addEventListener('resize', () => {
    scheduleRender()
  })

  canvas.addEventListener('mousedown', event => {
    safeAction('Canvas pointer down', () => handleCanvasPointerDown(event))
  })
  canvas.addEventListener('dblclick', event => {
    safeAction('Inline editor open', () => handleCanvasDoubleClick(event))
  })
  canvasArea.addEventListener('scroll', () => {
    updateCurrentPageFromScroll()
  })

  canvasArea.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    prepareManualZoom()
    const delta = event.deltaY > 0 ? -0.05 : 0.05
    state.zoom = clamp(roundTo(state.zoom + delta, 2), 0.25, 3)
    scheduleRender()
  }, { passive: false })

  canvas.addEventListener('contextmenu', event => {
    event.preventDefault()
    safeAction('Context menu', () => openContextMenu(event))
  })

  document.addEventListener('click', event => {
    if (interaction.contextMenuState !== null) {
      const target = event.target
      if (target instanceof Node && !contextMenuEl.contains(target)) {
        closeContextMenu()
      }
    }
  })

  templateNameInput.addEventListener('input', () => {
    maybeRecordHistoryFor(templateNameInput)
    state.templateName = templateNameInput.value || 'Untitled template'
    markDirty(false)
    scheduleRender()
  })
  templateDescriptionInput.addEventListener('input', () => {
    maybeRecordHistoryFor(templateDescriptionInput)
    state.description = templateDescriptionInput.value
    markDirty(false)
    scheduleRender()
  })

  document.addEventListener('focusin', event => {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      interaction.focusHistoryTarget = target
    }
  })
  document.addEventListener('focusout', event => {
    if (interaction.focusHistoryTarget === event.target) interaction.focusHistoryTarget = null
  })

  propsContent.addEventListener('input', event => {
    safeAction('Inspector input', () => handleInspectorInput(event))
  })
  propsContent.addEventListener('change', event => {
    safeAction('Inspector change', () => handleInspectorInput(event))
  })
  propsContent.addEventListener('click', event => {
    safeAction('Inspector click', () => handleInspectorClick(event))
  })

  variablesList.addEventListener('input', event => {
    safeAction('Variable edit', () => handleVariableListInput(event))
  })
  variablesList.addEventListener('click', event => {
    safeAction('Variable click', () => handleVariableListClick(event))
  })
  layersList.addEventListener('click', event => {
    safeAction('Layer click', () => handleLayerListClick(event))
  })
  templatesList.addEventListener('click', event => {
    safeAction('Template list click', () => handleTemplatesListClick(event))
  })
  versionsList.addEventListener('click', event => {
    safeAction('Version list click', () => handleVersionListClick(event))
  })

  requireElement<HTMLButtonElement>('btn-save-template').addEventListener('click', () => {
    safeAction('Save template', () => saveCurrentTemplate())
  })
  requireElement<HTMLButtonElement>('btn-save-as-new').addEventListener('click', () => {
    safeAction('Save template copy', () => saveCurrentTemplate(true))
  })
  loadTemplateButton.addEventListener('click', () => {
    safeAction('Load latest template', () => loadLatestTemplate())
  })
  requireElement<HTMLButtonElement>('btn-new-template').addEventListener('click', () => {
    safeAction('New template', () => resetToBlankDocument())
  })
  requireElement<HTMLButtonElement>('btn-duplicate-template').addEventListener('click', () => {
    safeAction('Duplicate template', () => duplicateTemplateState())
  })
  requireElement<HTMLButtonElement>('btn-clear').addEventListener('click', () => {
    safeAction('Clear canvas', () => clearCanvas())
  })
  requireElement<HTMLButtonElement>('btn-add-page').addEventListener('click', () => {
    safeAction('Add page', () => {
      state.manualPageCount += 1
      normalizeCanvasExtent()
      goToPage(state.pageCount - 1)
      markDirty()
      scheduleRender()
    })
  })
  requireElement<HTMLButtonElement>('btn-prev-page').addEventListener('click', () => {
    safeAction('Previous page', () => goToPage(state.currentPage - 1))
  })
  requireElement<HTMLButtonElement>('btn-next-page').addEventListener('click', () => {
    safeAction('Next page', () => goToPage(state.currentPage + 1))
  })
  requireElement<HTMLButtonElement>('btn-zoom-in').addEventListener('click', () => {
    prepareManualZoom()
    state.zoom = clamp(roundTo(state.zoom + 0.1, 2), 0.4, 2)
    scheduleRender()
  })
  requireElement<HTMLButtonElement>('btn-zoom-out').addEventListener('click', () => {
    prepareManualZoom()
    state.zoom = clamp(roundTo(state.zoom - 0.1, 2), 0.4, 2)
    scheduleRender()
  })
  requireElement<HTMLButtonElement>('btn-zoom-fit').addEventListener('click', () => {
    state.zoomMode = 'fit'
    scheduleRender()
  })

  requireElement<HTMLButtonElement>('btn-toggle-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid
    scheduleRender()
  })

  requireElement<HTMLButtonElement>('btn-add-variable').addEventListener('click', () => {
    safeAction('Add variable', () => addVariable())
  })

  requireElement<HTMLButtonElement>('btn-import-template').addEventListener('click', () => {
    templateImportInput.click()
  })
  templateImportInput.addEventListener('change', () => {
    safeAction('Import template', () => void importTemplateFile())
  })

  imageUploadInput.addEventListener('change', () => {
    safeAction('Upload image', () => void handleImageUpload())
  })

  gifUploadInput.addEventListener('change', () => {
    safeAction('Upload animated visual', () => void handleGifUpload())
  })

  tracePathButton.addEventListener('click', () => {
    safeAction('Toggle trace-path', () => toggleTracePathMode())
  })

  exportGifButton.addEventListener('click', () => {
    safeAction('Open GIF export', () => openGifExportDialog())
  })

  requireElement<HTMLButtonElement>('btn-export-menu').addEventListener('click', event => {
    event.stopPropagation()
    exportMenu.classList.toggle('open')
  })
  exportMenu.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    const format = target.dataset['exportFormat']
    if (!isExportFormat(format)) return
    exportMenu.classList.remove('open')
    safeAction('Export', () => {
      const maybePromise = exportDocument(format)
      if (maybePromise !== undefined) {
        void maybePromise.catch(error => reportError('Export', error))
      }
    })
  })
  document.addEventListener('click', event => {
    if (!(event.target instanceof Node)) return
    if (event.target instanceof HTMLElement && event.target.closest('#export-anchor') !== null) return
    exportMenu.classList.remove('open')
  })

  // ── Email test sender modal ──────────────────────────────────
  const emailTestOverlay = requireElement<HTMLDivElement>('email-test-overlay')
  const emailTestFrom = requireElement<HTMLInputElement>('email-test-from')
  const emailTestTo = requireElement<HTMLInputElement>('email-test-to')
  const emailTestFormat = requireElement<HTMLSelectElement>('email-test-format')
  const emailTestStatus = requireElement<HTMLDivElement>('email-test-status')
  const btnEmailTestSend = requireElement<HTMLButtonElement>('btn-email-test-send')

  requireElement<HTMLButtonElement>('btn-send-test-email').addEventListener('click', () => {
    exportMenu.classList.remove('open')
    emailTestStatus.textContent = ''
    emailTestStatus.className = 'email-test-status'
    emailTestFormat.value = 'email-html'
    emailTestOverlay.classList.add('open')
  })

  requireElement<HTMLButtonElement>('btn-email-test-cancel').addEventListener('click', () => {
    emailTestOverlay.classList.remove('open')
  })

  gifExportCancelButton.addEventListener('click', () => {
    closeGifExportDialogController(createGifExportHooks())
  })

  gifExportOverlay.addEventListener('click', event => {
    if (event.target === gifExportOverlay) closeGifExportDialogController(createGifExportHooks())
  })

  gifExportRenderButton.addEventListener('click', () => {
    safeAction('Render GIF export', () => {
      void renderGifExport().catch(error => reportError('GIF export', error))
    })
  })

  gifExportDownloadButton.addEventListener('click', () => {
    safeAction('Download GIF export', () => downloadGifExport())
  })

  emailTestOverlay.addEventListener('click', event => {
    if (event.target === emailTestOverlay) emailTestOverlay.classList.remove('open')
  })

  btnEmailTestSend.addEventListener('click', () => {
    safeAction('Send test email', () => {
      void sendTestEmail(
        emailTestFrom.value.trim(),
        emailTestTo.value.trim(),
        emailTestFormat.value,
        emailTestStatus,
        btnEmailTestSend,
      )
    })
  })

  formatBlockSelect.addEventListener('change', () => {
    safeAction('Change block type', () => {
      const selected = getSelectedElement()
      if (selected === null || (selected.type !== 'text' && selected.type !== 'heading')) return
      const nextType = formatBlockSelect.value
      if (nextType !== 'text' && nextType !== 'heading') return
      recordState()
      selected.type = nextType
      if (nextType === 'heading') {
        selected.height = Math.max(selected.height, 120)
        selected.styles.fontWeight = 700
      } else {
        selected.height = Math.max(selected.height, 180)
      }
      markDirty()
      invalidateTextProjectionForElement(selected.id)
      scheduleRender()
    })
  })

  formatFontSelect.addEventListener('change', () => {
    safeAction('Change font', () => {
      const selected = getSelectedElement()
      if (selected === null || !isTextualElement(selected.type)) return
      recordState()
      selected.styles.fontFamily = formatFontSelect.value
      markDirty()
      invalidateTextProjectionForElement(selected.id)
      scheduleRender()
    })
  })

  requireElement<HTMLButtonElement>('fmt-size-inc').addEventListener('click', () => {
    safeAction('Increase font size', () => adjustFontSize(2))
  })
  requireElement<HTMLButtonElement>('fmt-size-dec').addEventListener('click', () => {
    safeAction('Decrease font size', () => adjustFontSize(-2))
  })
  requireElement<HTMLButtonElement>('fmt-bold').addEventListener('click', () => {
    safeAction('Toggle bold', () => toggleTextStyle('fontWeight', 700, 400))
  })
  requireElement<HTMLButtonElement>('fmt-italic').addEventListener('click', () => {
    safeAction('Toggle italic', () => toggleTextStyle('fontStyle', 'italic', 'normal'))
  })
  requireElement<HTMLButtonElement>('fmt-underline').addEventListener('click', () => {
    safeAction('Toggle underline', () => toggleTextStyle('textDecoration', 'underline', 'none'))
  })
  requireElement<HTMLButtonElement>('fmt-align-left').addEventListener('click', () => {
    safeAction('Align left', () => setSelectedTextAlign('left'))
  })
  requireElement<HTMLButtonElement>('fmt-align-center').addEventListener('click', () => {
    safeAction('Align center', () => setSelectedTextAlign('center'))
  })
  requireElement<HTMLButtonElement>('fmt-align-right').addEventListener('click', () => {
    safeAction('Align right', () => setSelectedTextAlign('right'))
  })
  requireElement<HTMLButtonElement>('fmt-bullets').addEventListener('click', () => {
    safeAction('Bullets', () => applyListFormatting(false))
  })
  requireElement<HTMLButtonElement>('fmt-numbered').addEventListener('click', () => {
    safeAction('Numbers', () => applyListFormatting(true))
  })

  dismissErrorButton.addEventListener('click', () => {
    errorBanner.style.display = 'none'
  })

  window.addEventListener('error', event => {
    reportError('Unhandled error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', event => {
    reportError('Unhandled promise rejection', event.reason)
  })

  document.addEventListener('keydown', event => {
    safeAction('Keyboard shortcut', () => handleKeyboardShortcut(event))
  })
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  handleEditorKeyboardShortcut(event, {
    state,
    getPathTraceMode: () => interaction.pathTraceMode,
    cancelPathTrace,
    hasContextMenu: () => interaction.contextMenuState !== null,
    closeContextMenu,
    inlineEditorLayer,
    getTableEditing: () => tableState.editing,
    setTableEditing: editing => {
      tableState.editing = editing
    },
    getInlineEditorState: () => interaction.inlineEditorState,
    setInlineEditorState: nextState => {
      interaction.inlineEditorState = nextState
    },
    getTableSelection: () => tableState.selection,
    setTableSelection: selection => {
      tableState.selection = selection
    },
    exportMenu,
    errorBanner,
    scheduleRender,
    saveCurrentTemplate: () => saveCurrentTemplate(),
    undo,
    redo,
    duplicateSelectedElement,
    getSelectedElement,
    getClipboard: () => runtime.clipboard,
    setClipboard: element => {
      runtime.clipboard = element
    },
    cloneElement: cloneData,
    showToast,
    recordState,
    createId,
    canvasWidth: canvasW,
    maybeExtendPages,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    removeSelectedElements,
    getSelectedElements,
    toggleLockSelected,
    selectAll,
  })
}

function handlePointerMove(event: MouseEvent): void {
  handlePointerMoveInteraction(event, createCanvasInteractionHooks())
}

function handlePointerUp(event: MouseEvent): void {
  handlePointerUpInteraction(event, createCanvasInteractionHooks())
}

function handleCanvasPointerDown(event: MouseEvent): void {
  handleCanvasPointerDownInteraction(event, createCanvasInteractionHooks())
}

function handleCanvasDoubleClick(event: MouseEvent): void {
  handleCanvasDoubleClickInteraction(event, createCanvasInteractionHooks())
}

function handleInspectorInput(event: Event): void {
  handleInspectorInputController(event, createInspectorControllerHooks())
}

function handleInspectorClick(event: Event): void {
  handleInspectorClickController(event, createInspectorControllerHooks())
}

function handleVariableListInput(event: Event): void {
  handleVariableListInputController(event, createSidebarActionHooks())
}

function handleVariableListClick(event: Event): void {
  handleVariableListClickController(event, createSidebarActionHooks())
}

function handleLayerListClick(event: Event): void {
  handleLayerListClickController(event, createSidebarActionHooks())
}

function handleTemplatesListClick(event: Event): void {
  handleTemplatesListClickController(event, createSidebarActionHooks())
}

function handleVersionListClick(event: Event): void {
  handleVersionListClickController(event, createSidebarActionHooks())
}

function addVariable(): void {
  addVariableController(createSidebarActionHooks())
}

function adjustFontSize(delta: number): void {
  const selected = getSelectedElement()
  if (selected === null || !isTextualElement(selected.type)) return
  recordState()
  const nextSize = clamp(getElementFontSize(selected) + delta, 8, 96)
  selected.styles.fontSize = nextSize
  markDirty()
  invalidateTextProjectionForElement(selected.id)
  scheduleRender()
}

function toggleTextStyle<K extends 'fontWeight' | 'fontStyle' | 'textDecoration'>(key: K, truthy: ElementStyles[K], falsy: ElementStyles[K]): void {
  const selected = getSelectedElement()
  if (selected === null || !isTextualElement(selected.type)) return
  recordState()
  selected.styles[key] = selected.styles[key] === truthy ? falsy : truthy
  markDirty()
  invalidateTextProjectionForElement(selected.id)
  scheduleRender()
}

function setSelectedTextAlign(alignment: TextAlign): void {
  const selected = getSelectedElement()
  if (selected === null || !isTextualElement(selected.type)) return
  recordState()
  selected.styles.textAlign = alignment
  markDirty()
  invalidateTextProjectionForElement(selected.id)
  scheduleRender()
}

function applyListFormatting(ordered: boolean): void {
  const editor = getActiveTextEditor()
  if (editor === null) {
    showToast('Focus a content field first')
    return
  }
  maybeRecordHistoryFor(editor)
  const start = editor.selectionStart
  const end = editor.selectionEnd
  const original = editor.value
  const segment = original.slice(start, end) || original
  const baseStart = original.slice(0, start)
  const baseEnd = original.slice(end)
  const lines = segment.split('\n')
  const formatted = lines
    .map((line, index) => {
      if (line.trim().length === 0) return line
      return ordered ? `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}` : `- ${line.replace(/^[-*]\s+/, '')}`
    })
    .join('\n')
  const nextValue = original.slice(start, end).length > 0 ? `${baseStart}${formatted}${baseEnd}` : formatted
  editor.value = nextValue
  if (editor.dataset['inlineEditor'] === 'true') {
    if (interaction.inlineEditorState !== null) interaction.inlineEditorState.draft = nextValue
  } else {
    const selected = getSelectedElement()
    if (selected !== null) selected.content = nextValue
  }
  markDirty(false)
  clearAllPreparedCache()
  invalidateAllTextProjection('fonts')
  scheduleRender()
}

function resetToBlankDocument(): void {
  recordState()
  applyDocument(
    normalizeStoredDocument(createBlankDocument(state.surfaceTheme, getSurfacePalette(state.surfaceTheme), state.paperSize)),
    { resetHistory: true, keepTemplateMetadata: false },
  )
  showToast('Blank template ready')
}

function duplicateTemplateState(): void {
  recordState()
  state.templateId = null
  state.version = 0
  state.lastSavedAt = null
  state.templateName = `${state.templateName} Copy`
  state.dirty = true
  scheduleRender()
  showToast('Template duplicated in the editor')
}

function clearCanvas(): void {
  if (state.elements.length === 0) return
  recordState()
  state.elements = []
  state.selectedId = null
  interaction.inlineEditorState = null
  state.manualPageCount = 1
  normalizeCanvasExtent()
  markDirty()
  invalidateAllTextProjection('document')
  scheduleRender()
}

function duplicateSelectedElement(): void {
  const selected = getSelectedElement()
  if (selected === null) return
  recordState()
  const duplicate = cloneData(selected)
  duplicate.id = createId('el')
  duplicate.x = clamp(selected.x + 18, 0, Math.max(0, canvasW() - selected.width))
  duplicate.y = Math.max(0, selected.y + 18)
  state.elements.push(duplicate)
  state.selectedId = duplicate.id
  maybeExtendPages(duplicate.y + duplicate.height)
  markDirty()
  invalidateAllTextProjection('obstacles')
  scheduleRender()
}

function removeSelectedElements(): void {
  const toRemove = state.selectedIds.size > 0 ? state.selectedIds : (state.selectedId !== null ? new Set([state.selectedId]) : new Set<string>())
  if (toRemove.size === 0) return
  recordState()
  const count = state.elements.filter(el => toRemove.has(el.id)).length
  state.elements = state.elements.filter(el => !toRemove.has(el.id))
  state.selectedId = null
  state.selectedIds = new Set()
  interaction.inlineEditorState = null
  normalizeCanvasExtent()
  markDirty()
  syncMascotAnimation()
  invalidateAllTextProjection('obstacles')
  scheduleRender()
  showToast(`${count} element${count === 1 ? '' : 's'} removed`)
}

function removeSelectedElement(): void {
  removeSelectedElements()
}

function swapElements(a: number, b: number): void {
  const itemA = state.elements[a]
  const itemB = state.elements[b]
  if (itemA === undefined || itemB === undefined) return
  state.elements[a] = itemB
  state.elements[b] = itemA
}

function exportDocument(format: ExportFormat): Promise<void> | void {
  switch (format) {
    case 'html': {
      const html = buildAbsoluteHtmlDocument({ paged: true, printable: false, autoPrint: false })
      downloadText(`${slugifyFilename(state.templateName)}.html`, html, 'text/html')
      showToast('HTML exported')
      break
    }
    case 'pdf': {
      return buildPdfBlob().then(blob => {
        downloadBlob(blob, `${slugifyFilename(state.templateName)}.pdf`)
        showToast('PDF exported')
      })
    }
    case 'docx':
      return buildDocxBlob().then(blob => {
        downloadBlob(blob, `${slugifyFilename(state.templateName)}.docx`)
        showToast('DOCX exported')
      })
    case 'email-html': {
      return (async () => {
        const legacyResult = state.emailFormat === 'mjml' ? null : await buildLegacyEmailHtmlResult()
        const html = legacyResult?.html ?? await buildEmailHtml()
        downloadText(`${slugifyFilename(state.templateName)}-email.html`, html, 'text/html')
        if (legacyResult !== null && legacyResult.warnings.length > 0) {
          console.warn('Email export warnings', legacyResult.warnings)
          showToast(`Email HTML exported with ${legacyResult.warnings.length} compatibility warning${legacyResult.warnings.length === 1 ? '' : 's'}`)
        } else {
          showToast(state.emailFormat === 'mjml' ? 'Email HTML exported via MJML wrapper' : 'Email HTML exported via sliced tables')
        }
      })()
    }
    case 'email-text': {
      return buildEmailText().then(text => {
        downloadText(`${slugifyFilename(state.templateName)}-email.txt`, text, 'text/plain')
        showToast('Email text exported')
      })
    }
    case 'json': {
      const payload = JSON.stringify({
        template: serializeDocument(),
        layoutSnapshot: buildExportSnapshot(),
        templateId: state.templateId,
        version: state.version,
        lastSavedAt: state.lastSavedAt,
      }, null, 2)
      downloadText(`${slugifyFilename(state.templateName)}.json`, payload, 'application/json')
      showToast('JSON exported')
      break
    }
  }
}

async function sendTestEmail(
  from: string,
  to: string,
  format: string,
  statusEl: HTMLDivElement,
  sendBtn: HTMLButtonElement,
): Promise<void> {
  await sendTestEmailController(from, to, format, statusEl, sendBtn, createEmailTestHooks())
}

function openGifExportDialog(): void {
  openGifExportDialogController(createGifExportHooks())
}

async function renderGifExport(): Promise<void> {
  await renderGifExportController(createGifExportHooks())
}

function downloadGifExport(): void {
  downloadGifExportController(createGifExportHooks())
}

async function handleImageUpload(): Promise<void> {
  await handleImageUploadController(createImageUploadHooks())
}

async function importTemplateFile(): Promise<void> {
  const file = templateImportInput.files?.[0]
  templateImportInput.value = ''
  if (file === undefined) return
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new UserError('Template JSON is invalid')
  }
  const maybeDocument = parseImportedTemplateDocument(parsed)
  if (maybeDocument === null) throw new UserError('Unsupported template JSON')
  applyDocument(maybeDocument, { resetHistory: true, keepTemplateMetadata: false })
  showToast('Template imported')
}

function loadLatestTemplate(): void {
  loadLatestTemplateController(createDocumentLifecycleHooks())
}

function loadTemplateById(templateId: string): void {
  loadTemplateByIdController(templateId, createDocumentLifecycleHooks())
}

function restoreTemplateVersion(templateId: string, versionId: string): void {
  restoreTemplateVersionController(templateId, versionId, createDocumentLifecycleHooks())
}

function deleteStoredTemplate(templateId: string): void {
  deleteStoredTemplateController(templateId, createDocumentLifecycleHooks())
}

function saveCurrentTemplate(asNew = false): void {
  saveCurrentTemplateController(createDocumentLifecycleHooks(), asNew)
}

function serializeDocument(): StoredDocument {
  return serializeDocumentController(createDocumentLifecycleHooks())
}

function applyDocument(documentState: StoredDocument, options: { resetHistory: boolean; keepTemplateMetadata: boolean }): void {
  applyDocumentController(documentState, options, createDocumentLifecycleHooks())
}

function recordState(): void {
  recordStateController(createDocumentLifecycleHooks())
}

function undo(): void {
  undoController(createDocumentLifecycleHooks())
}

function redo(): void {
  redoController(createDocumentLifecycleHooks())
}

function markDirty(showChanged = true): void {
  markDirtyController(createDocumentLifecycleHooks(), showChanged)
}

function normalizeCanvasExtent(): void {
  normalizeCanvasExtentController(createDocumentLifecycleHooks())
}

function maybeExtendPages(requiredBottom: number): void {
  maybeExtendPagesController(requiredBottom, createDocumentLifecycleHooks())
}

// Switch to a new paper size. Repositions and resizes elements that would
// fall outside the new canvas bounds.
function changePaperSize(newSize: PaperSize): void {
  changePaperSizeController(newSize, createDocumentLifecycleHooks())
}

function scheduleRender(): void {
  requestRender(store)
}

function render(): void {
  try {
    normalizeCanvasExtent()
    renderCanvasViewport()
    renderPageGuides()
    renderCanvasElements()
    // Skip inline editor re-render if user is actively typing in it —
    // otherwise replaceChildren() destroys the focused textarea.
    {
      const ae = document.activeElement
      const isEditingInline = ae !== null && inlineEditorLayer.contains(ae) &&
        (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement)
      if (!isEditingInline) {
        renderInlineEditor()
      }
    }
    renderSidebarPanels()
    renderVariablesList()
    renderTemplatesPanel()
    renderLayersList()
    // Skip properties panel re-render if user is actively typing in it —
    // otherwise innerHTML replacement destroys the focused input/textarea.
    const activeEl = document.activeElement
    const isEditingInspector = activeEl !== null && propsContent.contains(activeEl) &&
      (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement)
    if (!isEditingInspector) {
      renderPropertiesPanel()
    }
    syncToolbarState()
    updateStatusSurface()
    renderGridOverlay()
    renderShortcutsModal()
    document.title = `${state.templateName} — Template Studio`
  } catch (error) {
    reportError('Render failed', error)
  }
}

function renderCanvasViewport(): void {
  renderCanvasViewportView({
    state,
    canvasShell,
    canvasViewport,
    canvasSurface,
    zoomIndicator,
    canvasWidth: canvasW(),
    canvasHeight: state.canvasHeight,
    canvasScale: getCanvasScale(),
    surface: getCanvasSurfaceTokens(state.surfaceTheme),
  })
}

function renderPageGuides(): void {
  renderPageGuidesView(pageGuides, state.pageCount, pageH())
}

function renderCanvasElements(): void {
  renderCanvasElementsView({
    state,
    canvas,
    elementNodes,
    dragState: interaction.dragState,
    resizeState: interaction.resizeState,
    projectTextElement,
    resolveVariables,
    getImageSource: element => getImageSource(element, resolveVariables),
    getAnimatedGifSource: element => getAnimatedGifSource(element, resolveVariables),
    getMascotVisualSource: element => getMascotVisualSource(element, resolveVariables),
    getVideoEmbedSource: element => getVideoEmbedSource(element, resolveVariables),
    getElementTextColor: element => getElementTextColor(element, state.surfaceTheme),
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
    createPlaceholder,
    sanitizeHtml,
    renderMascotPathOverlay,
    renderGifPathOverlay,
    renderTableElement,
  })
}

function renderInlineEditor(): void {
  renderInlineEditorView(createInlineEditorHooks())
}

function renderSidebarPanels(): void {
  renderSidebarTabs(state.sidebarTab)
}

function renderVariablesList(): void {
  renderSidebarVariablesList(variablesList, state.variables)
}

function renderTemplatesPanel(): void {
  renderSidebarTemplatesPanel({ templatesList, versionsList }, state.templateId)
}

function renderLayersList(): void {
  renderSidebarLayersList(layersList, state.elements, state.selectedId, state.selectedIds)
}

function renderPropertiesPanel(): void {
  const element = getSelectedElement()
  renderPropertiesPanelView({
    target: propsContent,
    state,
    element,
    projection: element !== null && isTextBlock(element.type) ? projectTextElement(element) : null,
    pageHeight: pageH(),
    tableSelection: tableState.selection,
  })
}

function syncToolbarState(): void {
  syncSidebarToolbarState({
    state,
    dom: { paperSizeSelect, formatBlockSelect, formatFontSelect, formatSizeValue },
    getSelectedElement,
    toggleToolbarButton,
  })
}

function updateStatusSurface(): void {
  updateSidebarStatusSurface({
    state,
    dom: { statusText, templateNameInput, templateDescriptionInput, pageIndicator, deviceCaptionLabel, deviceCaptionMeta },
    canvasWidth: canvasW(),
  })
}

function toggleLockSelected(): void {
  const selected = getSelectedElement()
  if (selected === null) return
  recordState()
  selected.locked = !selected.locked
  markDirty()
  scheduleRender()
  showToast(selected.locked ? 'Element locked' : 'Element unlocked')
}

function renderGridOverlay(): void {
  renderGridOverlayOverlay(canvasSurface, state.showGrid)
}

function renderShortcutsModal(): void {
  renderSidebarShortcutsModal({
    showShortcuts: state.showShortcuts,
    onClose: () => {
      state.showShortcuts = false
      scheduleRender()
    },
  })
}

// ── Context menu ────────────────────────────────────────────────
function openContextMenu(event: MouseEvent): void {
  openContextMenuController(event, {
    state,
    getElementById,
    setContextMenuState: nextState => {
      interaction.contextMenuState = nextState
    },
  })
  renderContextMenu()
}

function closeContextMenu(): void {
  closeContextMenuController(contextMenuEl, {
    getContextMenuState: () => interaction.contextMenuState,
    setContextMenuState: nextState => {
      interaction.contextMenuState = nextState
    },
  })
}

function renderContextMenu(): void {
  renderContextMenuController(contextMenuEl, action => {
    handleContextAction(action)
    closeContextMenu()
  }, {
    state,
    getClipboard: () => runtime.clipboard,
    getContextMenuState: () => interaction.contextMenuState,
    getElementById,
  })
}

function handleContextAction(action: string): void {
  handleContextActionController(action, {
    state,
    getClipboard: () => runtime.clipboard,
    setClipboard: element => {
      runtime.clipboard = element
    },
    getContextMenuState: () => interaction.contextMenuState,
    setContextMenuState: nextState => {
      interaction.contextMenuState = nextState
    },
    getElementById,
    getSelectedElement,
    getSelectedElements,
    selectAll,
    toggleLockSelected,
    duplicateSelectedElement,
    removeSelectedElements,
    fitTextElementHeight,
    fitElementWidthToContent,
    getInlineEditorState: () => interaction.inlineEditorState,
    setInlineEditorState: nextState => {
      interaction.inlineEditorState = nextState
    },
    recordState,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    scheduleRender,
    showToast,
    maybeExtendPages,
    canvasWidth: canvasW,
  })
}

function alignSelectedElements(edge: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v'): void {
  alignSelectedElementsController(edge, {
    getSelectedElements,
    recordState,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    scheduleRender,
  })
}

function distributeSelectedElements(axis: 'horizontal' | 'vertical'): void {
  distributeSelectedElementsController(axis, {
    getSelectedElements,
    recordState,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    scheduleRender,
  })
}

function computeSmartGuides(dragged: CanvasElement, candidateX: number, candidateY: number): SmartGuideResult {
  return computeSmartGuidesOverlay(dragged, candidateX, candidateY, {
    showGrid: state.showGrid,
    elements: state.elements,
    selectedIds: state.selectedIds,
    canvasWidth: canvasW(),
    pageHeight: pageH(),
    pageMargin: pageMar(),
  })
}

function renderSmartGuides(lines: SmartGuideLine[]): void {
  renderSmartGuidesOverlay(smartGuidesLayer, lines)
}

function clearSmartGuides(): void {
  clearSmartGuidesOverlay(smartGuidesLayer)
}

// ── Marquee selection ───────────────────────────────────────────
function updateMarqueeSelection(): void {
  if (interaction.marqueeState === null) return
  const selection = updateMarqueeSelectionOverlay(state.elements, interaction.marqueeState)
  state.selectedIds = new Set(Array.from(selection.selectedIds, asElementId))
  state.selectedId = selection.selectedId === null ? null : asElementId(selection.selectedId)
}

function renderMarquee(): void {
  interaction.marqueeNode = renderMarqueeOverlay(canvasSurface, interaction.marqueeState, interaction.marqueeNode)
}

function clearMarqueeNode(): void {
  interaction.marqueeNode = clearMarqueeNodeOverlay(interaction.marqueeNode)
}

// ── Measurement tooltip ─────────────────────────────────────────
function showMeasurement(element: CanvasElement): void {
  interaction.measurementNode = showMeasurementOverlay(canvasSurface, interaction.measurementNode, element)
}

function hideMeasurement(): void {
  interaction.measurementNode = hideMeasurementOverlay(interaction.measurementNode)
}

// ── Mascot animation engine ─────────────────────────────────────
function parseMascotPath(element: CanvasElement) {
  return parseMascotPathAnimation(element)
}

function renderAnimatedCanvasFrame(): void {
  try {
    invalidateAllTextProjection('obstacles')
    renderCanvasElements()
  } catch (error) {
    stopMascotAnimation()
    stopGifAnimation()
    reportError('Animation render failed', error)
  }
}

function updateMascotPositions(deltaMs: number): boolean {
  return updateMascotPositionsController(deltaMs, createMascotAnimationHooks())
}

function stopMascotAnimation(): void {
  stopMascotAnimationController(createMascotAnimationHooks())
}

function syncMascotAnimation(): void {
  syncMascotAnimationController(createMascotAnimationHooks())
}

function resetMascotBasePositions(): void {
  resetMascotBasePositionsController(createMascotAnimationHooks())
}

function renderMascotPathOverlay(node: HTMLDivElement, element: CanvasElement): void {
  renderMascotPathOverlayAnimation(node, element, canvasW(), state.canvasHeight)
}

// ── Animated GIF engine ─────────────────────────────────────────

function renderGifPathOverlay(node: HTMLDivElement, element: CanvasElement): void {
  renderGifPathOverlayAnimation(node, element, canvasW(), state.canvasHeight)
}

function getGifSilhouetteInterval(textElement: CanvasElement, gif: CanvasElement, bandTop: number, bandBottom: number, padding: number): Interval | null {
  return getGifSilhouetteIntervalController(
    textElement,
    gif,
    bandTop,
    bandBottom,
    padding,
    createGifHelperHooks(),
  )
}

function stopGifAnimation(): void {
  stopGifAnimationController(createGifAnimationHooks())
}

function syncGifAnimation(): void {
  syncGifAnimationController(createGifAnimationHooks())
}

// ── Path tracing ────────────────────────────────────────────────

function toggleTracePathMode(): void {
  toggleTracePathModeAnimation(createPathTraceHooks())
}

function startPathTrace(elementId: string): void {
  startPathTraceAnimation(elementId, createPathTraceHooks())
}

function cancelPathTrace(): void {
  cancelPathTraceAnimation(createPathTraceHooks())
}

function commitPathTrace(): void {
  commitPathTraceAnimation(createPathTraceHooks())
}

function renderPathOverlay(): void {
  renderPathOverlayAnimation(createPathTraceHooks())
}

async function handleGifUpload(): Promise<void> {
  await handleGifUploadController(createGifUploadHooks())
}

// ── Table rendering & interaction ───────────────────────────────

function getTableData(element: CanvasElement): TableData | null {
  return parseTableData(element.content)
}

/** Auto-fit element height to match actual table row heights. */
function autoFitTableHeight(element: CanvasElement): void {
  const data = getTableData(element)
  if (data === null) return
  element.height = computeTableHeight(data)
}

function renderTableElement(frame: HTMLDivElement, _node: HTMLDivElement, element: CanvasElement): void {
  renderTableElementUi(frame, element, createTableUiHooks())
}

function commitTableCellEdit(): void {
  commitTableCellEditUi(createTableUiHooks())
}

function handleTableCellClick(element: CanvasElement, localX: number, localY: number, shiftKey: boolean): void {
  handleTableCellClickUi(element, localX, localY, shiftKey, createTableUiHooks())
}

function handleTableDoubleClick(element: CanvasElement, localX: number, localY: number): void {
  handleTableDoubleClickUi(element, localX, localY, createTableUiHooks())
}

function handleTableAction(action: string): void {
  handleTableActionUi(action, createTableUiHooks())
}

function createTableUiHooks() {
  return {
    selectedId: state.selectedId,
    getSelection: () => tableState.selection,
    setSelection: (selection: TableCellSelectionState | null) => {
      tableState.selection = selection
    },
    getEditing: () => tableState.editing,
    setEditing: (editing: TableCellEditingState | null) => {
      tableState.editing = editing
    },
    inlineEditorLayer,
    scheduleRender,
    recordState,
    markDirty,
    getSelectedElement,
    getElementById,
    getResolvedTableCellContent,
    getTableCellRenderState,
    createPlaceholder,
  }
}

function createSidebarActionHooks() {
  return {
    state,
    variableNameInput: requireElement<HTMLInputElement>('var-name-input'),
    variableLabelInput: requireElement<HTMLInputElement>('var-label-input'),
    variableValueInput: requireElement<HTMLInputElement>('var-value-input'),
    maybeRecordHistoryFor,
    recordState,
    markDirty,
    clearPreparedCache: clearAllPreparedCache,
    clearTextProjectionCache: () => invalidateAllTextProjection('variables'),
    scheduleRender,
    showToast,
    getElementById,
    swapElements,
    duplicateSelectedElement,
    removeSelectedElement,
    loadTemplateById,
    deleteStoredTemplate,
    restoreTemplateVersion,
    applyDocument,
  }
}

function createCanvasInteractionHooks() {
  return {
    state,
    getPathTraceMode: () => interaction.pathTraceMode,
    getPathTraceState: () => interaction.pathTraceState,
    setPathTraceDrawing: (drawing: boolean) => {
      if (interaction.pathTraceState !== null) interaction.pathTraceState.drawing = drawing
    },
    appendPathTracePoint: (point: { x: number; y: number }) => {
      interaction.pathTraceState?.rawPoints.push(point)
    },
    renderPathOverlay,
    commitPathTrace,
    closeContextMenu,
    getInlineEditorState: () => interaction.inlineEditorState,
    setInlineEditorState: (nextState: InlineEditorState | null) => {
      interaction.inlineEditorState = nextState
    },
    getPaletteDragType: () => interaction.paletteDragType,
    setPaletteDragType: (type: ElementType | null) => {
      interaction.paletteDragType = type
    },
    updateDropIndicator,
    getDragState: () => interaction.dragState,
    setDragState: (nextState: DragState | null) => {
      interaction.dragState = nextState
    },
    getResizeState: () => interaction.resizeState,
    setResizeState: (nextState: ResizeState | null) => {
      interaction.resizeState = nextState
    },
    getMarqueeState: () => interaction.marqueeState,
    setMarqueeState: (nextState: MarqueeState | null) => {
      interaction.marqueeState = nextState
    },
    clearMarqueeNode,
    updateMarqueeSelection,
    renderMarquee,
    getTableColResize: () => tableState.colResize,
    setTableColResize: (nextState: typeof tableState.colResize) => {
      tableState.colResize = nextState
    },
    getTableRowResize: () => tableState.rowResize,
    setTableRowResize: (nextState: typeof tableState.rowResize) => {
      tableState.rowResize = nextState
    },
    getTablePendingClick: () => tableState.pendingClick,
    setTablePendingClick: (nextState: typeof tableState.pendingClick) => {
      tableState.pendingClick = nextState
    },
    getTableSelectionElementId: () => tableState.selection?.elementId ?? null,
    clearTableInteractionState,
    handleTableCellClick,
    handleTableDoubleClick,
    getCanvasPoint,
    maybeCanvasPoint,
    getElementById,
    recordState,
    maybeExtendPages,
    showMeasurement,
    hideMeasurement,
    computeSmartGuides,
    renderSmartGuides,
    clearSmartGuides,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    resetMascotBasePositions,
    resetGifBasePositions: () => resetGifBasePositions(state.elements),
    syncMascotAnimation,
    syncGifAnimation,
    scheduleRender,
    createElement,
    showToast,
    discardLastHistoryEntry: () => {
      history.past.pop()
    },
    canvasWidth: canvasW,
  }
}

function createPathTraceHooks() {
  return {
    state,
    pathOverlay,
    tracePathButton,
    getPathTraceMode: () => interaction.pathTraceMode,
    setPathTraceMode: (enabled: boolean) => {
      interaction.pathTraceMode = enabled
    },
    getPathTraceState: () => interaction.pathTraceState,
    setPathTraceState: (nextState: PathTraceState | null) => {
      interaction.pathTraceState = nextState
    },
    getSelectedElement,
    getElementById,
    recordState,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    scheduleRender,
    showToast,
    resetGifBasePositions: () => resetGifBasePositions(state.elements),
    syncGifAnimation,
    resetMascotAnimState: (elementId: string) => {
      animation.mascotAnimStates.delete(elementId)
    },
    resetMascotBasePositions,
    syncMascotAnimation,
    canvasWidth: canvasW,
  }
}

function createDocumentLifecycleHooks() {
  return {
    state,
    history,
    storageKey: STORAGE_KEY,
    getAutoSaveTimer: () => runtime.autoSaveTimer,
    setAutoSaveTimer: (timer: number | null) => {
      runtime.autoSaveTimer = timer
    },
    clearPreparedCache: () => {
      clearAllPreparedCache()
    },
    clearTextProjectionCache: () => invalidateAllTextProjection('document'),
    clearInlineEditor: () => {
      interaction.inlineEditorState = null
    },
    clearMascotAnimationState: () => {
      animation.mascotAnimStates.clear()
    },
    syncMascotAnimation,
    scheduleRender,
    showToast,
    writeDocumentBackup,
    templateNameInput,
    loadTemplateButton,
    canvasSurface,
    deviceCaptionLabel,
  }
}

function createMascotAnimationHooks() {
  return {
    state,
    getAnimStates: () => animation.mascotAnimStates,
    getFrameId: () => animation.mascotAnimFrameId,
    setFrameId: (frameId: number | null) => {
      animation.mascotAnimFrameId = frameId
    },
    getLastFrameTime: () => animation.mascotLastFrameTime,
    setLastFrameTime: (time: number) => {
      animation.mascotLastFrameTime = time
    },
    canvasWidth: canvasW,
    renderAnimatedCanvasFrame,
  }
}

function createGifAnimationHooks() {
  return {
    state,
    getFrameId: () => animation.gifAnimFrameId,
    setFrameId: (frameId: number | null) => {
      animation.gifAnimFrameId = frameId
    },
    getLastFrameTime: () => animation.gifLastFrameTime,
    setLastFrameTime: (time: number) => {
      animation.gifLastFrameTime = time
    },
    canvasWidth: canvasW,
    renderAnimatedCanvasFrame,
  }
}

function createGifHelperHooks() {
  return {
    getHullCache: () => gifHullCache,
    getHullPending: () => gifHullPending,
    scheduleRender,
    resolveGifSource: (element: CanvasElement) => getAnimatedGifSource(element, resolveVariables),
  }
}

function createGifUploadHooks() {
  return {
    ...createGifHelperHooks(),
    gifUploadInput,
    getUploadTargetId: () => runtime.imageUploadTargetId,
    setUploadTargetId: (targetId: string | null) => {
      runtime.imageUploadTargetId = targetId
    },
    getElementById,
    recordState,
    markDirty,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    showToast,
    reportError,
  }
}

function createEmailTestHooks() {
  return {
    templateName: () => state.templateName,
    buildEmailHtml,
    buildEmailText,
    buildLegacyEmailHtml,
    buildAbsoluteHtmlDocument,
    showToast,
  }
}

function createGifExportHooks() {
  return {
    state,
    gifExportOverlay,
    gifExportDurationInput,
    gifExportFpsInput,
    gifExportColorsSelect,
    gifExportScaleSelect,
    gifExportLoopInput,
    gifExportStatus,
    gifExportProgressBar,
    gifExportPreview,
    gifExportRenderButton,
    gifExportDownloadButton,
    getPreviewUrl: () => runtime.gifExportPreviewUrl,
    setPreviewUrl: (url: string | null) => {
      runtime.gifExportPreviewUrl = url
    },
    clamp,
    parseNumber,
    slugifyFilename,
    canvasWidth: canvasW,
    resolveVariables,
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
    getElementLineHeight,
    getElementTextColor: (element: CanvasElement) => getElementTextColor(element, state.surfaceTheme),
    getElementFontShorthand,
    getDefaultBorderRadius,
    projectTextElement,
    getTableData,
    getCell,
    getResolvedTableCellContent,
    getTableCellRenderState,
    getTableCellFontFamily,
    getTableCellFontSize,
    getTableCellFontWeight,
    getTableCellLineHeight,
    updateMascotPositions,
    resetMascotBasePositions,
    stopMascotAnimation,
    stopGifAnimation,
    syncGifAnimation,
    syncMascotAnimation,
    clearTextProjectionCache: () => invalidateAllTextProjection('obstacles'),
    showToast,
  }
}

function createImageUploadHooks() {
  return {
    imageUploadInput,
    getUploadTargetId: () => runtime.imageUploadTargetId,
    setUploadTargetId: (targetId: string | null) => {
      runtime.imageUploadTargetId = targetId
    },
    getElementById,
    recordState,
    canvasWidth: canvasW,
    clamp,
    deleteMascotHull: (src: string) => {
      mascotHullCache.delete(src)
    },
    resetMascotBasePositions,
    syncMascotAnimation,
    maybeExtendPages,
    markDirty: () => {
      markDirty()
    },
    scheduleRender,
    showToast,
  }
}

function createExportAssemblyHooks() {
  return {
    state,
    docxMime: DOCX_MIME,
    buildExportSnapshot,
    resolveVariables,
    normalizeHref: (value: string) => normalizeSafeUrl(value, 'href'),
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
    getElementLineHeight,
    getElementTextColor: (element: CanvasElement) => getElementTextColor(element, state.surfaceTheme),
    getElementFontShorthand,
    getAnimatedGifSource: (element: CanvasElement) => getAnimatedGifSource(element, resolveVariables),
    getImageSource: (element: CanvasElement) => getImageSource(element, resolveVariables),
    getMascotSource: (element: CanvasElement) => getMascotVisualSource(element, resolveVariables),
    getVideoHref: (element: CanvasElement) => getVideoHref(element, resolveVariables),
    getMascotPresetLabel: (preset: string) => MASCOT_PRESETS[preset as keyof typeof MASCOT_PRESETS]?.label ?? 'Mascot',
    getTableCellRenderState,
    getResolvedTableCellContent,
    getTableCellFontFamily,
    getTableCellFontSize,
    getTableCellFontWeight,
    formatTableBorderCss,
    parseTableData,
    sanitizeHtml,
    showToast,
  }
}

function createTextProjectionHooks() {
  return {
    preparedCache,
    wrapMode: state.wrapMode,
    resolveVariables,
    getElementFontShorthand,
    getElementLineHeight,
    getElementTextColor: (element: CanvasElement) => getElementTextColor(element, state.surfaceTheme),
    getOverlappingObstaclesForTextBox: (x: number, y: number, width: number, height: number, excludeElementId: string) => {
      return state.elements.filter(other => {
        if (other.id === excludeElementId || isTextBlock(other.type)) return false
        return other.x < x + width && other.x + other.width > x && other.y < y + height && other.y + other.height > y
      })
    },
    getMascotSilhouetteInterval,
    getGifSilhouetteInterval,
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
    getTableCellFontShorthand,
    getTableCellLineHeight,
    getTableCellTextColor,
    getCellRect,
    getEffectiveBorder,
    getRenderedBorderWidth,
  }
}

function createInlineEditorHooks() {
  return {
    state,
    inlineEditorLayer,
    getInlineEditorState: () => interaction.inlineEditorState,
    setInlineEditorState: (nextState: InlineEditorState | null) => {
      interaction.inlineEditorState = nextState
    },
    getElementById,
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
    getElementLineHeight,
    insertTokenIntoTextArea,
    recordState,
    markDirty,
    clearTextProjectionFor: (elementId: string) => {
      invalidateTextProjectionForElement(elementId)
    },
    scheduleRender,
  }
}

function createInspectorControllerHooks() {
  return {
    state,
    getSelectedElement,
    maybeRecordHistoryFor,
    canvasWidth: canvasW,
    getTableSelection: () => tableState.selection,
    getTableData,
    serializeTableData,
    autoFitTableHeight,
    getElementFontSize,
    getDefaultBorderRadius,
    resetMascotBasePositions,
    syncMascotAnimation,
    resetGifBasePositions: () => resetGifBasePositions(state.elements),
    syncGifAnimation,
    maybeExtendPages,
    markDirty,
    clearTextProjectionFor: (elementId: string) => {
      invalidateTextProjectionForElement(elementId)
    },
    clearAllTextProjection: () => {
      invalidateAllTextProjection('obstacles')
    },
    scheduleRender,
    removeSelectedElement,
    duplicateSelectedElement,
    getInlineEditorState: () => interaction.inlineEditorState,
    setInlineEditorState: (nextState: InlineEditorState | null) => {
      interaction.inlineEditorState = nextState
    },
    fitTextElementHeight,
    fitElementWidthToContent,
    setSelectedTextAlign,
    toggleLockSelected,
    alignSelectedElements,
    distributeSelectedElements,
    setImageUploadTargetId: (id: string | null) => {
      runtime.imageUploadTargetId = id
    },
    clickGifUploadInput: () => {
      gifUploadInput.click()
    },
    clickImageUploadInput: () => {
      imageUploadInput.click()
    },
    insertVariableToken,
    parseMascotPath,
    resetGifAnimState,
    startPathTrace,
    showToast,
    handleTableAction,
    mascotAnimStates: animation.mascotAnimStates,
    recordState,
  }
}

function updateCurrentPageFromScroll(): void {
  const scale = getCanvasScale()
  const pageTop = canvasViewport.offsetTop
  const visibleMid = canvasArea.scrollTop + canvasArea.clientHeight / 2 - pageTop
  const nextPage = clamp(Math.floor(visibleMid / Math.max(1, pageH() * scale)), 0, state.pageCount - 1)
  if (nextPage === state.currentPage) return
  state.currentPage = nextPage
  pageIndicator.textContent = `Page ${state.currentPage + 1} / ${state.pageCount}`
}

function goToPage(pageIndex: number): void {
  const nextPage = clamp(pageIndex, 0, state.pageCount - 1)
  state.currentPage = nextPage
  const scale = getCanvasScale()
  const top = canvasViewport.offsetTop + nextPage * pageH() * scale - 18
  canvasArea.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  scheduleRender()
}

function prepareManualZoom(): void {
  if (state.zoomMode === 'manual') return
  const baseScale = getBaseCanvasScale()
  state.zoom = clamp(roundTo(getCanvasScale() / baseScale, 2), 0.4, 2)
  state.zoomMode = 'manual'
}

function getBaseCanvasScale(): number {
  return getViewportBaseCanvasScale(state.viewMode, canvasW())
}

function getCanvasSurfaceTokens(surfaceTheme: SurfaceTheme): {
  workbench: string
  pageBg: string
  pageBorder: string
  pageRule: string
  pageBreak: string
  pageShadow: string
} {
  if (surfaceTheme === 'dark') {
    return {
      workbench: '#04070c',
      pageBg: '#0a1118',
      pageBorder: 'rgba(235, 244, 252, 0.08)',
      pageRule: 'rgba(235, 244, 252, 0.03)',
      pageBreak: 'rgba(235, 244, 252, 0.12)',
      pageShadow: '0 16px 40px rgba(0, 0, 0, 0.48)',
    }
  }
  return {
    workbench: '#e8e8ec',
    pageBg: '#ffffff',
    pageBorder: 'rgba(13, 33, 48, 0.10)',
    pageRule: 'rgba(13, 33, 48, 0.04)',
    pageBreak: 'rgba(13, 33, 48, 0.12)',
    pageShadow: '0 10px 32px rgba(15, 23, 42, 0.14)',
  }
}

function getAvailableCanvasWidth(): number {
  const areaWidth = canvasArea.clientWidth
  if (areaWidth <= 0) return getViewportPreviewWidth(state.viewMode, canvasW())
  return Math.max(260, areaWidth - 64)
}

function getCanvasScale(): number {
  return roundTo(getViewportCanvasScale({
    viewMode: state.viewMode,
    paperWidth: canvasW(),
    zoomMode: state.zoomMode,
    zoom: state.zoom,
    availableWidth: getAvailableCanvasWidth(),
  }), 3)
}

function projectTextElement(element: CanvasElement): TextProjection {
  return cacheManager.registerTextProjection(element.id, () => projectTextElementProjection(element, createTextProjectionHooks()))
}

function fitTextElementHeight(element: CanvasElement): void {
  invalidateTextProjectionForElement(element.id)
  element.height = fitTextElementHeightProjection(element, createTextProjectionHooks())
}

function fitElementWidthToContent(element: CanvasElement): void {
  const previousWidth = element.width
  element.width = fitElementWidthToContentProjection(element, createTextProjectionHooks())
  if (element.width !== previousWidth) {
    if (isTextBlock(element.type)) invalidateTextProjectionForElement(element.id)
    else invalidateAllTextProjection('obstacles')
  }
}

function getRenderedBorderWidth(border: TableData['defaultBorder']): number {
  return border.style === 'none' ? 0 : Math.max(0, border.width)
}

function getTableCellFontFamily(cell: TableData['cells'][number]): string {
  return cell.styles.fontFamily ?? '"Avenir Next", "Segoe UI", sans-serif'
}

function getTableCellFontSize(cell: TableData['cells'][number]): number {
  return cell.styles.fontSize ?? 13
}

function getTableCellFontWeight(cell: TableData['cells'][number]): number {
  return cell.styles.fontWeight ?? 400
}

function getTableCellLineHeight(cell: TableData['cells'][number]): number {
  return Math.round(getTableCellFontSize(cell) * 1.4)
}

function getTableCellTextColor(cell: TableData['cells'][number]): string {
  return cell.styles.color ?? '#354a5a'
}

function getTableCellFontShorthand(cell: TableData['cells'][number]): string {
  return `${cell.styles.fontStyle ?? 'normal'} ${getTableCellFontWeight(cell)} ${getTableCellFontSize(cell)}px ${getTableCellFontFamily(cell)}`
}

function formatTableBorderCss(border: TableData['defaultBorder']): string {
  return border.style === 'none' || border.width <= 0 ? 'none' : `${border.width}px ${border.style} ${border.color}`
}

function getResolvedTableCellContent(cell: TableData['cells'][number], data: TableData): string {
  return resolveVariables(evaluateFormulas(cell.content, data))
}

function getTableCellRenderState(
  element: CanvasElement,
  data: TableData,
  cell: TableData['cells'][number],
  rowIndex: number,
  content: string,
): {
  rect: ReturnType<typeof getCellRect>
  padding: number
  bg: string
  borderTop: TableData['defaultBorder']
  borderRight: TableData['defaultBorder']
  borderBottom: TableData['defaultBorder']
  borderLeft: TableData['defaultBorder']
  projection: TextProjection
} {
  return getTableCellRenderStateProjection(element, data, cell, rowIndex, content, createTextProjectionHooks())
}

function buildExportSnapshot(): ExportSnapshot {
  return buildExportSnapshotExport({
    state,
    canvasWidth: canvasW,
    pageHeight: pageH,
    pageMargin: pageMar,
    projectTextElement,
    getElementFontFamily,
    getElementFontSize,
    getElementFontWeight,
  })
}


async function buildPdfBlob(): Promise<Blob> {
  return buildPdfBlobController(createExportAssemblyHooks())
}

function buildAbsoluteHtmlDocument(options: { paged: boolean; printable: boolean; autoPrint: boolean }): string {
  return buildAbsoluteHtmlDocumentController(options, createExportAssemblyHooks())
}

async function buildEmailHtml(): Promise<string> {
  return buildEmailHtmlController(createExportAssemblyHooks())
}

async function buildLegacyEmailHtml(): Promise<string> {
  return buildLegacyEmailHtmlController(createExportAssemblyHooks())
}

async function buildLegacyEmailHtmlResult() {
  return buildLegacyEmailHtmlResultController(createExportAssemblyHooks())
}

// ---------------------------------------------------------------------------
// Email-compatible table-based layout engine
// ---------------------------------------------------------------------------
async function buildEmailText(): Promise<string> {
  return buildEmailTextController(createExportAssemblyHooks())
}

async function buildDocxBlob(): Promise<Blob> {
  return buildDocxBlobController(createExportAssemblyHooks())
}

function mountPresetButtons(): void {
  presetGrid.innerHTML = PRESETS.map(preset => `
    <button class="library-card" data-preset-id="${preset.id}">
      <strong>${escapeHtml(preset.name)}</strong>
      <span>${escapeHtml(preset.description)}</span>
    </button>
  `).join('')
  presetGrid.querySelectorAll<HTMLElement>('[data-preset-id]').forEach(button => {
    button.addEventListener('click', () => {
      const presetId = button.dataset['presetId']
      const preset = PRESETS.find(item => item.id === presetId)
      if (preset === undefined) return
      recordState()
      applyDocument(normalizeStoredDocument(preset.create(state.paperSize)), { resetHistory: true, keepTemplateMetadata: false })
      showToast(`${preset.name} preset loaded`)
    })
  })
}

function createElement(type: ElementType, x: number, y: number): CanvasElement {
  return createElementFactory(type, x, y, {
    createId,
    paperSize: state.paperSize,
    surfacePalette: getSurfacePalette(state.surfaceTheme),
    clamp,
  })
}

function getSelectedElement(): CanvasElement | null {
  return state.selectedId === null ? null : getElementById(state.selectedId)
}

function getSelectedElements(): CanvasElement[] {
  if (state.selectedIds.size > 0) {
    return state.elements.filter(el => state.selectedIds.has(el.id))
  }
  const primary = getSelectedElement()
  return primary !== null ? [primary] : []
}

function selectAll(): void {
  state.selectedIds = new Set(state.elements.map(el => el.id))
  if (state.elements.length > 0) {
    state.selectedId = state.elements[state.elements.length - 1]!.id
  }
  scheduleRender()
  showToast(`${state.elements.length} element${state.elements.length === 1 ? '' : 's'} selected`)
}

function getElementById(id: string): CanvasElement | null {
  return state.elements.find(element => element.id === id) ?? null
}

function createPlaceholder(title: string, detail: string): HTMLDivElement {
  const placeholder = document.createElement('div')
  placeholder.className = 'canvas-element__placeholder'
  placeholder.innerHTML = `<div><strong>${escapeHtml(title)}</strong><div>${escapeHtml(detail)}</div></div>`
  return placeholder
}

function getCanvasPoint(event: MouseEvent): { x: number; y: number } {
  return getCanvasPointOverlay(event, {
    canvasViewport,
    canvasScale: getCanvasScale(),
    canvasWidth: canvasW(),
    canvasHeight: state.canvasHeight,
  })
}

function maybeCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
  return maybeCanvasPointOverlay(event, {
    canvasViewport,
    canvasScale: getCanvasScale(),
    canvasWidth: canvasW(),
    canvasHeight: state.canvasHeight,
  })
}

function updateDropIndicator(event: MouseEvent): void {
  updateDropIndicatorOverlay(event, {
    dropIndicator,
    paletteDragType: interaction.paletteDragType,
    maybeCanvasPoint,
    createElement,
  })
}

function maybeRecordHistoryFor(target: EventTarget): void {
  if (interaction.focusHistoryTarget !== target) return
  recordState()
  interaction.focusHistoryTarget = null
}

function getActiveTextEditor(): HTMLTextAreaElement | null {
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement) return active
  return null
}

function insertVariableToken(variableName: string): void {
  const editor = getActiveTextEditor()
  const token = `{{${variableName}}}`
  if (editor !== null) {
    insertTokenIntoTextArea(editor, token)
    if (editor.dataset['inlineEditor'] === 'true') {
      if (interaction.inlineEditorState !== null) interaction.inlineEditorState.draft = editor.value
    } else {
      const selected = getSelectedElement()
      if (selected !== null) selected.content = editor.value
    }
    markDirty(false)
    invalidateAllTextProjection('variables')
    scheduleRender()
    return
  }
  const selected = getSelectedElement()
  if (selected === null || !isInlineEditableType(selected.type)) return
  recordState()
  selected.content += token
  markDirty()
  invalidateTextProjectionForElement(selected.id, 'element-content')
  scheduleRender()
}

function insertTokenIntoTextArea(textarea: HTMLTextAreaElement, token: string): void {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  textarea.value = `${value.slice(0, start)}${token}${value.slice(end)}`
  textarea.selectionStart = start + token.length
  textarea.selectionEnd = start + token.length
  textarea.focus()
}

function toggleToolbarButton(id: string, active: boolean): void {
  requireElement<HTMLButtonElement>(id).classList.toggle('active', active)
}

function reportError(context: string, error: unknown): void {
  if (isUserError(error)) {
    showToast(error.message)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  errorText.textContent = `${context}: ${message}`
  errorBanner.style.display = 'flex'
  console.error(context, error)
}

function safeAction(label: string, action: () => void): void {
  try {
    action()
  } catch (error) {
    reportError(label, error)
  }
}

function showToast(message: string): void {
  toast.textContent = message
  toast.classList.add('show')
  if (runtime.toastTimer !== null) window.clearTimeout(runtime.toastTimer)
  runtime.toastTimer = window.setTimeout(() => {
    toast.classList.remove('show')
    runtime.toastTimer = null
  }, 2200)
}
