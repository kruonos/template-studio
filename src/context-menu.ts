import { asElementId, type CanvasElement, type ContextMenuState, type InlineEditorState, type StudioState } from './schema.ts'
import { clamp, cloneData, createId, escapeHtml, isInlineEditableType, isTextBlock } from './utils.ts'

type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v'
type DistributeAxis = 'horizontal' | 'vertical'

type ContextMenuHooks = {
  state: StudioState
  getClipboard: () => CanvasElement | null
  setClipboard: (element: CanvasElement | null) => void
  getContextMenuState: () => ContextMenuState | null
  setContextMenuState: (state: ContextMenuState | null) => void
  getElementById: (id: string) => CanvasElement | null
  getSelectedElement: () => CanvasElement | null
  getSelectedElements: () => CanvasElement[]
  selectAll: () => void
  toggleLockSelected: () => void
  duplicateSelectedElement: () => void
  removeSelectedElements: () => void
  fitTextElementHeight: (element: CanvasElement) => void
  fitElementWidthToContent: (element: CanvasElement) => void
  getInlineEditorState: () => InlineEditorState | null
  setInlineEditorState: (state: InlineEditorState | null) => void
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionCache: () => void
  scheduleRender: () => void
  showToast: (message: string) => void
  maybeExtendPages: (requiredBottom: number) => void
  canvasWidth: () => number
}

export function openContextMenu(
  event: MouseEvent,
  hooks: Pick<ContextMenuHooks, 'state' | 'getElementById' | 'setContextMenuState'>,
): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const elementNode = target.closest<HTMLElement>('.canvas-element')
  const elementId = elementNode?.dataset['elementId'] ?? null
  if (elementId !== null) {
    const element = hooks.getElementById(elementId)
    if (element !== null) {
      hooks.state.selectedId = element.id
      if (!hooks.state.selectedIds.has(element.id)) {
        hooks.state.selectedIds = new Set([element.id])
      }
    }
  }
  hooks.setContextMenuState({ x: event.clientX, y: event.clientY, elementId: elementId === null ? null : asElementId(elementId) })
}

export function closeContextMenu(
  contextMenuEl: HTMLDivElement,
  hooks: Pick<ContextMenuHooks, 'getContextMenuState' | 'setContextMenuState'>,
): void {
  if (hooks.getContextMenuState() === null) return
  hooks.setContextMenuState(null)
  contextMenuEl.style.display = 'none'
}

export function renderContextMenu(
  contextMenuEl: HTMLDivElement,
  onAction: (action: string) => void,
  hooks: Pick<ContextMenuHooks, 'state' | 'getClipboard' | 'getContextMenuState' | 'getElementById'>,
): void {
  const contextMenuState = hooks.getContextMenuState()
  if (contextMenuState === null) {
    contextMenuEl.style.display = 'none'
    return
  }
  const element = contextMenuState.elementId !== null ? hooks.getElementById(contextMenuState.elementId) : null
  const multiCount = hooks.state.selectedIds.size
  const items: string[] = []
  const clipboard = hooks.getClipboard()

  if (element !== null) {
    items.push(ctxItem('ctx-duplicate', 'Duplicate', '⌘D'))
    items.push(ctxItem('ctx-copy', 'Copy', '⌘C'))
    if (clipboard !== null) items.push(ctxItem('ctx-paste', 'Paste', '⌘V'))
    items.push('<div class="ctx-divider"></div>')
    items.push(ctxItem('ctx-lock', element.locked ? 'Unlock' : 'Lock', 'L'))
    items.push(ctxItem('ctx-bring-front', 'Bring to front', ''))
    items.push(ctxItem('ctx-send-back', 'Send to back', ''))
    if (isTextBlock(element.type) || element.type === 'button') items.push(ctxItem('ctx-fit-width', 'Fit width to content', ''))
    if (isTextBlock(element.type)) items.push(ctxItem('ctx-fit-height', 'Fit text height', ''))
    if (isInlineEditableType(element.type)) items.push(ctxItem('ctx-edit', 'Edit inline', 'Dbl-click'))
    items.push('<div class="ctx-divider"></div>')
    items.push(ctxItem('ctx-delete', 'Delete', 'Del', true))
  } else {
    if (clipboard !== null) items.push(ctxItem('ctx-paste', 'Paste', '⌘V'))
    items.push(ctxItem('ctx-select-all', 'Select all', '⌘A'))
  }

  if (multiCount > 1) {
    items.push('<div class="ctx-divider"></div>')
    items.push(ctxItem('ctx-align-left', 'Align left edges', ''))
    items.push(ctxItem('ctx-align-right', 'Align right edges', ''))
    items.push(ctxItem('ctx-align-top', 'Align top edges', ''))
    items.push(ctxItem('ctx-align-bottom', 'Align bottom edges', ''))
    items.push(ctxItem('ctx-distribute-h', 'Distribute horizontally', ''))
    items.push(ctxItem('ctx-distribute-v', 'Distribute vertically', ''))
  }

  contextMenuEl.innerHTML = items.join('')
  contextMenuEl.style.display = 'block'

  const menuWidth = contextMenuEl.offsetWidth
  const menuHeight = contextMenuEl.offsetHeight
  const left = Math.min(contextMenuState.x, window.innerWidth - menuWidth - 8)
  const top = Math.min(contextMenuState.y, window.innerHeight - menuHeight - 8)
  contextMenuEl.style.left = `${Math.max(4, left)}px`
  contextMenuEl.style.top = `${Math.max(4, top)}px`

  contextMenuEl.querySelectorAll<HTMLButtonElement>('.ctx-item').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset['ctxAction']
      if (action !== undefined) onAction(action)
    })
  })
}

export function handleContextAction(action: string, hooks: ContextMenuHooks): void {
  switch (action) {
    case 'ctx-duplicate':
      hooks.duplicateSelectedElement()
      break
    case 'ctx-copy': {
      const selected = hooks.getSelectedElement()
      if (selected !== null) {
        hooks.setClipboard(cloneData(selected))
        hooks.showToast('Copied')
      }
      break
    }
    case 'ctx-paste': {
      const clipboard = hooks.getClipboard()
      if (clipboard === null) return
      hooks.recordState()
      const pasted = cloneData(clipboard)
      pasted.id = createId('el')
      pasted.x = clamp(pasted.x + 20, 0, Math.max(0, hooks.canvasWidth() - pasted.width))
      pasted.y = Math.max(0, pasted.y + 20)
      pasted.locked = false
      hooks.state.elements.push(pasted)
      hooks.state.selectedId = pasted.id
      hooks.state.selectedIds = new Set([pasted.id])
      hooks.maybeExtendPages(pasted.y + pasted.height)
      hooks.markDirty()
      hooks.clearTextProjectionCache()
      hooks.scheduleRender()
      hooks.showToast('Pasted')
      break
    }
    case 'ctx-lock':
      hooks.toggleLockSelected()
      break
    case 'ctx-bring-front':
      bringToFront(hooks)
      break
    case 'ctx-send-back':
      sendToBack(hooks)
      break
    case 'ctx-fit-height': {
      const element = hooks.getSelectedElement()
      if (element !== null && isTextBlock(element.type)) {
        hooks.recordState()
        hooks.fitTextElementHeight(element)
        hooks.markDirty()
        hooks.scheduleRender()
      }
      break
    }
    case 'ctx-fit-width': {
      const element = hooks.getSelectedElement()
      if (element !== null && (isTextBlock(element.type) || element.type === 'button')) {
        hooks.recordState()
        hooks.fitElementWidthToContent(element)
        if (isTextBlock(element.type)) hooks.fitTextElementHeight(element)
        hooks.markDirty()
        hooks.scheduleRender()
      }
      break
    }
    case 'ctx-edit': {
      const element = hooks.getSelectedElement()
      if (element !== null && isInlineEditableType(element.type)) {
        hooks.setInlineEditorState({ elementId: element.id, draft: element.content })
        hooks.scheduleRender()
      }
      break
    }
    case 'ctx-delete':
      hooks.removeSelectedElements()
      break
    case 'ctx-select-all':
      hooks.selectAll()
      break
    case 'ctx-align-left':
      alignSelectedElements('left', hooks)
      break
    case 'ctx-align-right':
      alignSelectedElements('right', hooks)
      break
    case 'ctx-align-top':
      alignSelectedElements('top', hooks)
      break
    case 'ctx-align-bottom':
      alignSelectedElements('bottom', hooks)
      break
    case 'ctx-distribute-h':
      distributeSelectedElements('horizontal', hooks)
      break
    case 'ctx-distribute-v':
      distributeSelectedElements('vertical', hooks)
      break
  }
}

function bringToFront(hooks: Pick<ContextMenuHooks, 'state' | 'getSelectedElement' | 'recordState' | 'markDirty' | 'scheduleRender'>): void {
  const element = hooks.getSelectedElement()
  if (element === null) return
  const index = hooks.state.elements.indexOf(element)
  if (index === -1 || index === hooks.state.elements.length - 1) return
  hooks.recordState()
  hooks.state.elements.splice(index, 1)
  hooks.state.elements.push(element)
  hooks.markDirty()
  hooks.scheduleRender()
}

function sendToBack(hooks: Pick<ContextMenuHooks, 'state' | 'getSelectedElement' | 'recordState' | 'markDirty' | 'scheduleRender'>): void {
  const element = hooks.getSelectedElement()
  if (element === null) return
  const index = hooks.state.elements.indexOf(element)
  if (index <= 0) return
  hooks.recordState()
  hooks.state.elements.splice(index, 1)
  hooks.state.elements.unshift(element)
  hooks.markDirty()
  hooks.scheduleRender()
}

export function alignSelectedElements(
  edge: AlignEdge,
  hooks: Pick<ContextMenuHooks, 'getSelectedElements' | 'recordState' | 'markDirty' | 'clearTextProjectionCache' | 'scheduleRender'>,
): void {
  const targets = hooks.getSelectedElements().filter(element => !element.locked)
  if (targets.length < 2) return
  hooks.recordState()
  switch (edge) {
    case 'left': {
      const minX = Math.min(...targets.map(element => element.x))
      targets.forEach(element => {
        element.x = minX
      })
      break
    }
    case 'right': {
      const maxRight = Math.max(...targets.map(element => element.x + element.width))
      targets.forEach(element => {
        element.x = maxRight - element.width
      })
      break
    }
    case 'top': {
      const minY = Math.min(...targets.map(element => element.y))
      targets.forEach(element => {
        element.y = minY
      })
      break
    }
    case 'bottom': {
      const maxBottom = Math.max(...targets.map(element => element.y + element.height))
      targets.forEach(element => {
        element.y = maxBottom - element.height
      })
      break
    }
    case 'center-h': {
      const minX = Math.min(...targets.map(element => element.x))
      const maxRight = Math.max(...targets.map(element => element.x + element.width))
      const center = (minX + maxRight) / 2
      targets.forEach(element => {
        element.x = center - element.width / 2
      })
      break
    }
    case 'center-v': {
      const minY = Math.min(...targets.map(element => element.y))
      const maxBottom = Math.max(...targets.map(element => element.y + element.height))
      const center = (minY + maxBottom) / 2
      targets.forEach(element => {
        element.y = center - element.height / 2
      })
      break
    }
  }
  hooks.markDirty()
  hooks.clearTextProjectionCache()
  hooks.scheduleRender()
}

export function distributeSelectedElements(
  axis: DistributeAxis,
  hooks: Pick<ContextMenuHooks, 'getSelectedElements' | 'recordState' | 'markDirty' | 'clearTextProjectionCache' | 'scheduleRender'>,
): void {
  const targets = hooks.getSelectedElements().filter(element => !element.locked)
  if (targets.length < 3) return
  hooks.recordState()
  if (axis === 'horizontal') {
    targets.sort((a, b) => a.x - b.x)
    const first = targets[0]!
    const last = targets[targets.length - 1]!
    const totalGap = (last.x + last.width) - first.x - targets.reduce((sum, element) => sum + element.width, 0)
    const gap = totalGap / (targets.length - 1)
    let cursor = first.x + first.width
    for (let index = 1; index < targets.length - 1; index++) {
      targets[index]!.x = cursor + gap
      cursor = targets[index]!.x + targets[index]!.width
    }
  } else {
    targets.sort((a, b) => a.y - b.y)
    const first = targets[0]!
    const last = targets[targets.length - 1]!
    const totalGap = (last.y + last.height) - first.y - targets.reduce((sum, element) => sum + element.height, 0)
    const gap = totalGap / (targets.length - 1)
    let cursor = first.y + first.height
    for (let index = 1; index < targets.length - 1; index++) {
      targets[index]!.y = cursor + gap
      cursor = targets[index]!.y + targets[index]!.height
    }
  }
  hooks.markDirty()
  hooks.clearTextProjectionCache()
  hooks.scheduleRender()
}

function ctxItem(action: string, label: string, shortcut: string, danger = false): string {
  return `<button class="ctx-item${danger ? ' danger' : ''}" data-ctx-action="${action}"><span>${escapeHtml(label)}</span>${shortcut ? `<kbd>${escapeHtml(shortcut)}</kbd>` : ''}</button>`
}
