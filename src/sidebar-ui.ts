import type { PageBuilderDom } from './dom.ts'
import { getViewportPreviewWidth } from './viewport-scale.ts'
import {
  FONT_CHOICES,
  STORAGE_KEY,
  type CanvasElement,
  type StudioState,
  type TemplateVar,
} from './schema.ts'
import { readTemplateStore } from './persistence.ts'
import { capitalize, escapeAttribute, escapeHtml, formatTimestamp, isTextualElement } from './utils.ts'
import {
  getElementFontFamily,
  getElementFontSize,
  getElementFontWeight,
} from './element-typography.ts'

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['Ctrl/⌘ + S', 'Save template'],
  ['Ctrl/⌘ + Z', 'Undo'],
  ['Ctrl/⌘ + Shift+Z / Y', 'Redo'],
  ['Ctrl/⌘ + C', 'Copy element'],
  ['Ctrl/⌘ + V', 'Paste element'],
  ['Ctrl/⌘ + D', 'Duplicate element'],
  ['Ctrl/⌘ + A', 'Select all elements'],
  ['Delete / Backspace', 'Remove element(s)'],
  ['↑ ↓ ← →', 'Nudge 1px'],
  ['Shift + Arrow keys', 'Nudge 10px'],
  ['Shift + Drag', 'Constrain axis'],
  ['Shift + Resize', 'Lock aspect ratio'],
  ['Shift + Click', 'Multi-select'],
  ['Ctrl/⌘ + Scroll', 'Zoom canvas'],
  ['Tab / Shift+Tab', 'Cycle elements'],
  ['G', 'Toggle grid + snap'],
  ['L', 'Lock / unlock element'],
  ['Escape', 'Deselect / close'],
  ['?', 'Toggle this panel'],
  ['Right-click', 'Context menu'],
  ['Double-click', 'Inline text editor'],
]

type ToolbarSyncOptions = {
  state: StudioState
  dom: Pick<PageBuilderDom, 'paperSizeSelect' | 'formatBlockSelect' | 'formatFontSelect' | 'formatSizeValue'>
  getSelectedElement: () => CanvasElement | null
  toggleToolbarButton: (id: string, active: boolean) => void
}

type StatusSurfaceOptions = {
  state: StudioState
  dom: Pick<PageBuilderDom, 'statusText' | 'templateNameInput' | 'templateDescriptionInput' | 'pageIndicator' | 'deviceCaptionLabel' | 'deviceCaptionMeta'>
  canvasWidth: number
}

type ShortcutsModalOptions = {
  showShortcuts: boolean
  onClose: () => void
}

export function renderSidebarPanels(sidebarTab: StudioState['sidebarTab']): void {
  document.querySelectorAll<HTMLElement>('[data-sidebar-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset['sidebarTab'] === sidebarTab)
  })
  document.querySelectorAll<HTMLElement>('.sidebar-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `sidebar-${sidebarTab}`)
  })
}

export function renderVariablesList(list: HTMLDivElement, variables: TemplateVar[]): void {
  if (variables.length === 0) {
    list.innerHTML = `<div class="properties-empty">No variables yet. Add reusable fields for names, links, offers, or dates.</div>`
    return
  }
  list.innerHTML = variables.map((variable, index) => `
    <div class="variable-card">
      <strong>{{${escapeHtml(variable.name)}}}</strong>
      <small>${escapeHtml(variable.label)}</small>
      <div class="prop-stack" style="margin-top:10px;">
        <div class="prop-field">
          <label>Label</label>
          <input class="prop-input" data-variable-index="${index}" data-variable-field="label" value="${escapeAttribute(variable.label)}">
        </div>
        <div class="prop-field">
          <label>Default value</label>
          <input class="prop-input" data-variable-index="${index}" data-variable-field="value" value="${escapeAttribute(variable.value)}">
        </div>
        <div class="prop-field">
          <label>Fallback</label>
          <input class="prop-input" data-variable-index="${index}" data-variable-field="fallback" value="${escapeAttribute(variable.fallback ?? '')}">
        </div>
      </div>
      <div class="card-actions">
        <button class="surface-chip danger" data-variable-action="delete" data-variable-index="${index}">Delete</button>
      </div>
    </div>
  `).join('')
}

export function renderTemplatesPanel(dom: Pick<PageBuilderDom, 'templatesList' | 'versionsList'>, templateId: string | null): void {
  const templates = readTemplateStore(STORAGE_KEY)
  dom.templatesList.innerHTML = templates.length === 0
    ? `<div class="properties-empty">No saved templates yet. Save the current canvas to start versioning.</div>`
    : templates.map(template => `
      <div class="template-card${template.id === templateId ? ' active' : ''}">
        <strong>${escapeHtml(template.name)}</strong>
        <small>v${template.version} · ${formatTimestamp(template.updatedAt)}</small>
        <small>${escapeHtml(template.description || 'No description')}</small>
        <div class="card-actions">
          <button class="surface-chip" data-template-action="load" data-template-id="${template.id}">Load</button>
          <button class="surface-chip" data-template-action="clone" data-template-id="${template.id}">Use Copy</button>
          <button class="surface-chip danger" data-template-action="delete" data-template-id="${template.id}">Delete</button>
        </div>
      </div>
    `).join('')

  const activeTemplate = templateId === null ? null : templates.find(template => template.id === templateId) ?? null
  dom.versionsList.innerHTML = activeTemplate === null
    ? `<div class="properties-empty">Save the current template to start collecting restore points.</div>`
    : activeTemplate.versions.slice().reverse().map(version => `
      <div class="template-card">
        <strong>Version ${version.version}</strong>
        <small>${formatTimestamp(version.savedAt)}</small>
        <div class="card-actions">
          <button class="surface-chip" data-version-action="restore" data-version-id="${version.id}">Restore</button>
        </div>
      </div>
    `).join('')
}

export function renderLayersList(
  list: HTMLDivElement,
  elements: CanvasElement[],
  selectedId: string | null,
  selectedIds: ReadonlySet<string>,
): void {
  if (elements.length === 0) {
    list.innerHTML = `<div class="properties-empty">No elements on canvas. Drag components from the library to start composing.</div>`
    return
  }
  list.innerHTML = [...elements].map((element, index) => `
    <div class="layer-card${element.id === selectedId || selectedIds.has(element.id) ? ' active' : ''}">
      <strong>${element.locked ? '🔒 ' : ''}${index + 1}. ${capitalize(element.type)}</strong>
      <small>${Math.round(element.x)}, ${Math.round(element.y)} · ${Math.round(element.width)}×${Math.round(element.height)}${element.locked ? ' · Locked' : ''}</small>
      <div class="card-actions">
        <button class="surface-chip" data-layer-action="select" data-element-id="${element.id}">Select</button>
        <button class="surface-chip" data-layer-action="up" data-element-id="${element.id}">Up</button>
        <button class="surface-chip" data-layer-action="down" data-element-id="${element.id}">Down</button>
        <button class="surface-chip${element.locked ? ' warning' : ''}" data-layer-action="lock" data-element-id="${element.id}">${element.locked ? 'Unlock' : 'Lock'}</button>
        <button class="surface-chip" data-layer-action="duplicate" data-element-id="${element.id}">Duplicate</button>
        <button class="surface-chip danger" data-layer-action="delete" data-element-id="${element.id}">Delete</button>
      </div>
    </div>
  `).join('')
}

export function syncToolbarState(options: ToolbarSyncOptions): void {
  const { dom, state, getSelectedElement, toggleToolbarButton } = options
  document.querySelectorAll<HTMLElement>('.wrap-mode').forEach(button => {
    button.classList.toggle('active', button.dataset['wrapMode'] === state.wrapMode)
  })
  document.querySelectorAll<HTMLElement>('.view-mode').forEach(button => {
    button.classList.toggle('active', button.dataset['viewMode'] === state.viewMode)
  })
  document.querySelectorAll<HTMLElement>('.surface-theme').forEach(button => {
    button.classList.toggle('active', button.dataset['surfaceTheme'] === state.surfaceTheme)
  })
  if (dom.paperSizeSelect.value !== state.paperSize.id) {
    dom.paperSizeSelect.value = state.paperSize.id
  }
  toggleToolbarButton('btn-toggle-grid', state.showGrid)

  const selected = getSelectedElement()
  if (selected !== null && isTextualElement(selected.type)) {
    dom.formatBlockSelect.value = selected.type === 'heading' ? 'heading' : 'text'
    dom.formatFontSelect.value = getElementFontFamily(selected)
    dom.formatSizeValue.textContent = `${getElementFontSize(selected)}px`
  } else {
    dom.formatBlockSelect.value = 'text'
    dom.formatFontSelect.value = FONT_CHOICES[0]
    dom.formatSizeValue.textContent = '16px'
  }

  const isBold = selected !== null && isTextualElement(selected.type) && getElementFontWeight(selected) >= 700
  const isItalic = selected !== null && isTextualElement(selected.type) && (selected.styles.fontStyle ?? 'normal') === 'italic'
  const isUnderline = selected !== null && isTextualElement(selected.type) && (selected.styles.textDecoration ?? 'none') === 'underline'
  toggleToolbarButton('fmt-bold', isBold)
  toggleToolbarButton('fmt-italic', isItalic)
  toggleToolbarButton('fmt-underline', isUnderline)
  toggleToolbarButton('fmt-align-left', selected !== null && isTextualElement(selected.type) && (selected.styles.textAlign ?? 'left') === 'left')
  toggleToolbarButton('fmt-align-center', selected !== null && isTextualElement(selected.type) && (selected.styles.textAlign ?? 'left') === 'center')
  toggleToolbarButton('fmt-align-right', selected !== null && isTextualElement(selected.type) && (selected.styles.textAlign ?? 'left') === 'right')
}

export function updateStatusSurface(options: StatusSurfaceOptions): void {
  const { dom, state, canvasWidth } = options
  dom.statusText.textContent = `${state.dirty ? 'Unsaved' : 'Saved'} · ${state.elements.length} block${state.elements.length === 1 ? '' : 's'} · v${state.version}`
  dom.templateNameInput.value = state.templateName
  dom.templateDescriptionInput.value = state.description
  dom.pageIndicator.textContent = `Page ${state.currentPage + 1} / ${state.pageCount}`
  const viewportWidth = Math.round(getViewportPreviewWidth(state.viewMode, canvasWidth))
  dom.deviceCaptionLabel.textContent = `${capitalize(state.viewMode)} preview · ${viewportWidth}px`
  const lastSaved = state.lastSavedAt === null ? 'Never saved' : `Last saved ${formatTimestamp(state.lastSavedAt)}`
  dom.deviceCaptionMeta.textContent = `${capitalize(state.surfaceTheme)} surface · ${capitalize(state.wrapMode)} wrap · ${lastSaved}`
}

export function renderShortcutsModal(options: ShortcutsModalOptions): void {
  let modal = document.getElementById('shortcuts-modal')
  if (!options.showShortcuts) {
    if (modal !== null) modal.remove()
    return
  }
  if (modal !== null) return

  modal = document.createElement('div')
  modal.id = 'shortcuts-modal'
  modal.innerHTML = `
    <div class="shortcuts-backdrop"></div>
    <div class="shortcuts-card">
      <div class="shortcuts-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="surface-chip" id="btn-close-shortcuts">Close</button>
      </div>
      <div class="shortcuts-body">
        ${SHORTCUTS.map(([key, desc]) => `<div class="shortcut-row"><kbd>${key}</kbd><span>${desc}</span></div>`).join('')}
      </div>
    </div>
  `
  document.body.append(modal)
  modal.querySelector('#btn-close-shortcuts')?.addEventListener('click', options.onClose)
  modal.querySelector('.shortcuts-backdrop')?.addEventListener('click', options.onClose)
}
