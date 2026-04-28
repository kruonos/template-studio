import { asElementId, type CanvasElement, type StoredDocument, type StudioState } from './schema.ts'
import { STORAGE_KEY } from './schema.ts'
import { readTemplateStore } from './persistence.ts'
import { sanitizeVariableName } from './utils.ts'

type SidebarActionHooks = {
  state: StudioState
  variableNameInput: HTMLInputElement
  variableLabelInput: HTMLInputElement
  variableValueInput: HTMLInputElement
  maybeRecordHistoryFor: (target: EventTarget) => void
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  clearPreparedCache: () => void
  clearTextProjectionCache: () => void
  scheduleRender: () => void
  showToast: (message: string) => void
  getElementById: (id: string) => CanvasElement | null
  swapElements: (a: number, b: number) => void
  duplicateSelectedElement: () => void
  removeSelectedElement: () => void
  loadTemplateById: (templateId: string) => void
  deleteStoredTemplate: (templateId: string) => void
  restoreTemplateVersion: (templateId: string, versionId: string) => void
  applyDocument: (documentState: StoredDocument, options: { resetHistory: boolean; keepTemplateMetadata: boolean }) => void
}

export function handleVariableListInput(event: Event, hooks: SidebarActionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const index = parseInt(target.dataset['variableIndex'] ?? '-1', 10)
  const field = target.dataset['variableField']
  const variable = hooks.state.variables[index]
  if (variable === undefined || (field !== 'label' && field !== 'value' && field !== 'fallback')) return
  hooks.maybeRecordHistoryFor(target)
  if (field === 'label') variable.label = target.value
  if (field === 'value') variable.value = target.value
  if (field === 'fallback') variable.fallback = target.value
  hooks.markDirty(false)
  hooks.clearPreparedCache()
  hooks.clearTextProjectionCache()
  hooks.scheduleRender()
}

export function handleVariableListClick(event: Event, hooks: SidebarActionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const actionTarget = target.closest<HTMLElement>('[data-variable-action]')
  const action = actionTarget?.dataset['variableAction']
  if (action === undefined) return
  const index = parseInt(actionTarget?.dataset['variableIndex'] ?? '-1', 10)
  if (!Number.isInteger(index) || index < 0 || index >= hooks.state.variables.length) return

  if (action === 'delete') {
    hooks.recordState()
    const [removed] = hooks.state.variables.splice(index, 1)
    if (removed !== undefined) {
      hooks.markDirty()
      hooks.clearPreparedCache()
      hooks.clearTextProjectionCache()
      hooks.scheduleRender()
      hooks.showToast(`Removed {{${removed.name}}}`)
    }
  }
}

export function handleLayerListClick(event: Event, hooks: SidebarActionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const actionTarget = target.closest<HTMLElement>('[data-layer-action]')
  const action = actionTarget?.dataset['layerAction']
  if (action === undefined) return
  const elementId = actionTarget?.dataset['elementId']
  if (elementId === undefined) return
  const index = hooks.state.elements.findIndex(element => element.id === elementId)
  if (index === -1) return

  switch (action) {
    case 'select':
      hooks.state.selectedId = asElementId(elementId)
      hooks.scheduleRender()
      break
    case 'up':
      if (index === hooks.state.elements.length - 1) return
      hooks.recordState()
      hooks.swapElements(index, index + 1)
      hooks.markDirty()
      hooks.scheduleRender()
      break
    case 'down':
      if (index === 0) return
      hooks.recordState()
      hooks.swapElements(index, index - 1)
      hooks.markDirty()
      hooks.scheduleRender()
      break
    case 'lock': {
      const element = hooks.getElementById(elementId)
      if (element === null) return
      hooks.recordState()
      element.locked = !element.locked
      hooks.markDirty()
      hooks.scheduleRender()
      hooks.showToast(element.locked ? 'Element locked' : 'Element unlocked')
      break
    }
    case 'duplicate':
      hooks.state.selectedId = asElementId(elementId)
      hooks.duplicateSelectedElement()
      break
    case 'delete':
      hooks.state.selectedId = asElementId(elementId)
      hooks.removeSelectedElement()
      break
    default:
      break
  }
}

export function handleTemplatesListClick(event: Event, hooks: SidebarActionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const actionTarget = target.closest<HTMLElement>('[data-template-action]')
  const action = actionTarget?.dataset['templateAction']
  const templateId = actionTarget?.dataset['templateId']
  if (action === undefined || templateId === undefined) return

  switch (action) {
    case 'load':
      hooks.loadTemplateById(templateId)
      break
    case 'clone': {
      const template = readTemplateStore(STORAGE_KEY).find(item => item.id === templateId)
      if (template === undefined) return
      hooks.applyDocument(template.current, { resetHistory: true, keepTemplateMetadata: false })
      hooks.state.templateName = `${template.name} Copy`
      hooks.state.description = template.description
      hooks.state.templateId = null
      hooks.state.version = 0
      hooks.state.lastSavedAt = null
      hooks.state.dirty = true
      hooks.scheduleRender()
      hooks.showToast(`Loaded ${template.name} as a copy`)
      break
    }
    case 'delete':
      hooks.deleteStoredTemplate(templateId)
      break
    default:
      break
  }
}

export function handleVersionListClick(event: Event, hooks: SidebarActionHooks): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const actionTarget = target.closest<HTMLElement>('[data-version-action]')
  const versionId = actionTarget?.dataset['versionId']
  const action = actionTarget?.dataset['versionAction']
  if (versionId === undefined || action !== 'restore' || hooks.state.templateId === null) return
  hooks.restoreTemplateVersion(hooks.state.templateId, versionId)
}

export function addVariable(hooks: SidebarActionHooks): void {
  const normalizedName = sanitizeVariableName(hooks.variableNameInput.value)
  if (normalizedName.length === 0) {
    hooks.showToast('Variable name is required')
    return
  }
  if (hooks.state.variables.some(variable => variable.name === normalizedName)) {
    hooks.showToast(`{{${normalizedName}}} already exists`)
    return
  }
  hooks.recordState()
  hooks.state.variables.push({
    name: normalizedName,
    label: hooks.variableLabelInput.value.trim() || normalizedName,
    value: hooks.variableValueInput.value,
  })
  hooks.variableNameInput.value = ''
  hooks.variableLabelInput.value = ''
  hooks.variableValueInput.value = ''
  hooks.markDirty()
  hooks.clearPreparedCache()
  hooks.clearTextProjectionCache()
  hooks.scheduleRender()
  hooks.showToast(`Added {{${normalizedName}}}`)
}
