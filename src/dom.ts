export type PageBuilderDom = {
  canvasArea: HTMLDivElement
  canvasShell: HTMLDivElement
  canvasViewport: HTMLDivElement
  canvasSurface: HTMLDivElement
  canvas: HTMLDivElement
  pageGuides: HTMLDivElement
  inlineEditorLayer: HTMLDivElement
  dropIndicator: HTMLDivElement
  propsContent: HTMLDivElement
  statusText: HTMLSpanElement
  templateNameInput: HTMLInputElement
  templateDescriptionInput: HTMLTextAreaElement
  presetGrid: HTMLDivElement
  templatesList: HTMLDivElement
  versionsList: HTMLDivElement
  variablesList: HTMLDivElement
  layersList: HTMLDivElement
  pageIndicator: HTMLSpanElement
  zoomIndicator: HTMLSpanElement
  deviceCaptionLabel: HTMLSpanElement
  deviceCaptionMeta: HTMLSpanElement
  toast: HTMLDivElement
  errorBanner: HTMLDivElement
  errorText: HTMLSpanElement
  exportMenu: HTMLDivElement
  templateImportInput: HTMLInputElement
  imageUploadInput: HTMLInputElement
  formatBlockSelect: HTMLSelectElement
  formatFontSelect: HTMLSelectElement
  formatSizeValue: HTMLSpanElement
  dismissErrorButton: HTMLButtonElement
  loadTemplateButton: HTMLButtonElement
  contextMenuEl: HTMLDivElement
  smartGuidesLayer: HTMLDivElement
  paperSizeSelect: HTMLSelectElement
  gifUploadInput: HTMLInputElement
  pathOverlay: SVGSVGElement
  tracePathButton: HTMLButtonElement
  exportGifButton: HTMLButtonElement
  gifExportOverlay: HTMLDivElement
  gifExportDurationInput: HTMLInputElement
  gifExportFpsInput: HTMLInputElement
  gifExportColorsSelect: HTMLSelectElement
  gifExportScaleSelect: HTMLSelectElement
  gifExportLoopInput: HTMLInputElement
  gifExportStatus: HTMLDivElement
  gifExportProgressBar: HTMLDivElement
  gifExportPreview: HTMLImageElement
  gifExportRenderButton: HTMLButtonElement
  gifExportDownloadButton: HTMLButtonElement
  gifExportCancelButton: HTMLButtonElement
}

export function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`#${id} not found`)
  return node as T
}

export function getPageBuilderDom(): PageBuilderDom {
  return {
    canvasArea: requireElement<HTMLDivElement>('canvas-area'),
    canvasShell: requireElement<HTMLDivElement>('canvas-shell'),
    canvasViewport: requireElement<HTMLDivElement>('canvas-viewport'),
    canvasSurface: requireElement<HTMLDivElement>('canvas-surface'),
    canvas: requireElement<HTMLDivElement>('canvas'),
    pageGuides: requireElement<HTMLDivElement>('page-guides'),
    inlineEditorLayer: requireElement<HTMLDivElement>('inline-editor-layer'),
    dropIndicator: requireElement<HTMLDivElement>('drop-indicator'),
    propsContent: requireElement<HTMLDivElement>('props-content'),
    statusText: requireElement<HTMLSpanElement>('status-text'),
    templateNameInput: requireElement<HTMLInputElement>('template-name'),
    templateDescriptionInput: requireElement<HTMLTextAreaElement>('template-description'),
    presetGrid: requireElement<HTMLDivElement>('preset-grid'),
    templatesList: requireElement<HTMLDivElement>('templates-list'),
    versionsList: requireElement<HTMLDivElement>('versions-list'),
    variablesList: requireElement<HTMLDivElement>('variables-list'),
    layersList: requireElement<HTMLDivElement>('layers-list'),
    pageIndicator: requireElement<HTMLSpanElement>('page-indicator'),
    zoomIndicator: requireElement<HTMLSpanElement>('zoom-indicator'),
    deviceCaptionLabel: requireElement<HTMLSpanElement>('device-caption-label'),
    deviceCaptionMeta: requireElement<HTMLSpanElement>('device-caption-meta'),
    toast: requireElement<HTMLDivElement>('toast'),
    errorBanner: requireElement<HTMLDivElement>('error-banner'),
    errorText: requireElement<HTMLSpanElement>('error-text'),
    exportMenu: requireElement<HTMLDivElement>('export-menu'),
    templateImportInput: requireElement<HTMLInputElement>('template-import-input'),
    imageUploadInput: requireElement<HTMLInputElement>('image-upload-input'),
    formatBlockSelect: requireElement<HTMLSelectElement>('fmt-block'),
    formatFontSelect: requireElement<HTMLSelectElement>('fmt-font'),
    formatSizeValue: requireElement<HTMLSpanElement>('fmt-size-value'),
    dismissErrorButton: requireElement<HTMLButtonElement>('btn-dismiss-error'),
    loadTemplateButton: requireElement<HTMLButtonElement>('btn-load-template'),
    contextMenuEl: requireElement<HTMLDivElement>('context-menu'),
    smartGuidesLayer: requireElement<HTMLDivElement>('smart-guides'),
    paperSizeSelect: requireElement<HTMLSelectElement>('paper-size-select'),
    gifUploadInput: requireElement<HTMLInputElement>('gif-upload-input'),
    pathOverlay: requireElement('path-overlay') as unknown as SVGSVGElement,
    tracePathButton: requireElement<HTMLButtonElement>('btn-trace-path'),
    exportGifButton: requireElement<HTMLButtonElement>('btn-export-gif'),
    gifExportOverlay: requireElement<HTMLDivElement>('gif-export-overlay'),
    gifExportDurationInput: requireElement<HTMLInputElement>('gif-export-duration'),
    gifExportFpsInput: requireElement<HTMLInputElement>('gif-export-fps'),
    gifExportColorsSelect: requireElement<HTMLSelectElement>('gif-export-colors'),
    gifExportScaleSelect: requireElement<HTMLSelectElement>('gif-export-scale'),
    gifExportLoopInput: requireElement<HTMLInputElement>('gif-export-loop'),
    gifExportStatus: requireElement<HTMLDivElement>('gif-export-status'),
    gifExportProgressBar: requireElement<HTMLDivElement>('gif-export-progress-bar'),
    gifExportPreview: requireElement<HTMLImageElement>('gif-export-preview'),
    gifExportRenderButton: requireElement<HTMLButtonElement>('btn-gif-export-render'),
    gifExportDownloadButton: requireElement<HTMLButtonElement>('btn-gif-export-download'),
    gifExportCancelButton: requireElement<HTMLButtonElement>('btn-gif-export-cancel'),
  }
}
