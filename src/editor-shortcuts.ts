import type { CanvasElement, ElementId, InlineEditorState, StudioState } from './schema.ts'
import type { TableCellEditingState, TableCellSelectionState } from './table-ui.ts'

type EditorShortcutHooks = {
  state: StudioState
  getPathTraceMode: () => boolean
  cancelPathTrace: () => void
  hasContextMenu: () => boolean
  closeContextMenu: () => void
  inlineEditorLayer: HTMLDivElement
  getTableEditing: () => TableCellEditingState | null
  setTableEditing: (editing: TableCellEditingState | null) => void
  getInlineEditorState: () => InlineEditorState | null
  setInlineEditorState: (state: InlineEditorState | null) => void
  getTableSelection: () => TableCellSelectionState | null
  setTableSelection: (selection: TableCellSelectionState | null) => void
  exportMenu: HTMLDivElement
  errorBanner: HTMLDivElement
  scheduleRender: () => void
  saveCurrentTemplate: () => void
  undo: () => void
  redo: () => void
  duplicateSelectedElement: () => void
  getSelectedElement: () => CanvasElement | null
  getClipboard: () => CanvasElement | null
  setClipboard: (element: CanvasElement | null) => void
  cloneElement: (element: CanvasElement) => CanvasElement
  showToast: (message: string) => void
  recordState: () => void
  createId: (prefix: 'el') => ElementId
  canvasWidth: () => number
  maybeExtendPages: (requiredBottom: number) => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionCache: () => void
  removeSelectedElements: () => void
  getSelectedElements: () => CanvasElement[]
  toggleLockSelected: () => void
  selectAll: () => void
}

export function handleKeyboardShortcut(event: KeyboardEvent, hooks: EditorShortcutHooks): void {
  const state = hooks.state

  if (event.key === 'Escape') {
    if (hooks.getPathTraceMode()) {
      hooks.cancelPathTrace()
      return
    }
    if (hooks.hasContextMenu()) {
      hooks.closeContextMenu()
      return
    }
    if (state.showShortcuts) {
      state.showShortcuts = false
      hooks.scheduleRender()
      return
    }
    if (hooks.getTableEditing() !== null) {
      hooks.setTableEditing(null)
      const editor = hooks.inlineEditorLayer.querySelector('.table-cell-editor')
      if (editor !== null) editor.remove()
      hooks.scheduleRender()
      return
    }
    if (hooks.getInlineEditorState() !== null) {
      hooks.setInlineEditorState(null)
      hooks.scheduleRender()
      return
    }
    if (hooks.getTableSelection() !== null) {
      hooks.setTableSelection(null)
      hooks.scheduleRender()
      return
    }
    hooks.exportMenu.classList.remove('open')
    hooks.errorBanner.style.display = 'none'
    return
  }

  const target = event.target
  const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    hooks.saveCurrentTemplate()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault()
    hooks.undo()
    return
  }
  if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault()
    hooks.redo()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && !editingText) {
    event.preventDefault()
    hooks.duplicateSelectedElement()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !editingText) {
    event.preventDefault()
    const selected = hooks.getSelectedElement()
    if (selected !== null) {
      hooks.setClipboard(hooks.cloneElement(selected))
      hooks.showToast('Copied to clipboard')
    }
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !editingText) {
    event.preventDefault()
    const clipboard = hooks.getClipboard()
    if (clipboard !== null) {
      hooks.recordState()
      const pasted = hooks.cloneElement(clipboard)
      pasted.id = hooks.createId('el')
      pasted.x = Math.max(0, Math.min(pasted.x + 20, Math.max(0, hooks.canvasWidth() - pasted.width)))
      pasted.y = Math.max(0, pasted.y + 20)
      pasted.locked = false
      state.elements.push(pasted)
      state.selectedId = pasted.id
      state.selectedIds = new Set([pasted.id])
      hooks.maybeExtendPages(pasted.y + pasted.height)
      hooks.markDirty()
      hooks.clearTextProjectionCache()
      hooks.scheduleRender()
      hooks.showToast('Pasted from clipboard')
    }
    return
  }
  if (editingText) return

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (state.selectedIds.size > 0 || state.selectedId !== null) {
      event.preventDefault()
      hooks.removeSelectedElements()
    }
    return
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const targets = hooks.getSelectedElements()
    if (targets.length === 0) return
    if (targets.every(element => element.locked)) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    hooks.recordState()
    for (const element of targets) {
      if (element.locked) continue
      switch (event.key) {
        case 'ArrowUp':
          element.y = Math.max(0, element.y - step)
          break
        case 'ArrowDown':
          element.y = element.y + step
          break
        case 'ArrowLeft':
          element.x = Math.max(0, element.x - step)
          break
        case 'ArrowRight':
          element.x = Math.min(hooks.canvasWidth() - element.width, element.x + step)
          break
      }
      hooks.maybeExtendPages(element.y + element.height)
    }
    hooks.markDirty(false)
    hooks.clearTextProjectionCache()
    hooks.scheduleRender()
    return
  }

  if (event.key.toLowerCase() === 'g') {
    state.showGrid = !state.showGrid
    hooks.scheduleRender()
    return
  }
  if (event.key.toLowerCase() === 'l') {
    hooks.toggleLockSelected()
    return
  }
  if (event.key === '?') {
    state.showShortcuts = !state.showShortcuts
    hooks.scheduleRender()
    return
  }
  if (event.key === 'Tab') {
    if (state.elements.length === 0) return
    event.preventDefault()
    const currentIndex = state.selectedId === null ? -1 : state.elements.findIndex(element => element.id === state.selectedId)
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? state.elements.length - 1 : currentIndex - 1)
      : (currentIndex >= state.elements.length - 1 ? 0 : currentIndex + 1)
    const nextElement = state.elements[nextIndex]
    if (nextElement !== undefined) {
      state.selectedId = nextElement.id
      state.selectedIds = new Set([nextElement.id])
    }
    hooks.scheduleRender()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    hooks.selectAll()
  }
}
