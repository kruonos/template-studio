import type { CanvasElement, InlineEditorState, StudioState } from './schema.ts'
import { isInlineEditableType } from './utils.ts'

type InlineEditorHooks = {
  state: StudioState
  inlineEditorLayer: HTMLDivElement
  getInlineEditorState: () => InlineEditorState | null
  setInlineEditorState: (state: InlineEditorState | null) => void
  getElementById: (id: string) => CanvasElement | null
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  getElementLineHeight: (element: CanvasElement) => number
  insertTokenIntoTextArea: (textarea: HTMLTextAreaElement, token: string) => void
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionFor: (elementId: string) => void
  scheduleRender: () => void
}

export function renderInlineEditor(hooks: InlineEditorHooks): void {
  hooks.inlineEditorLayer.replaceChildren()
  const inlineEditorState = hooks.getInlineEditorState()
  if (inlineEditorState === null) return
  const element = hooks.getElementById(inlineEditorState.elementId)
  if (element === null || !isInlineEditableType(element.type)) {
    hooks.setInlineEditorState(null)
    return
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'inline-editor'
  wrapper.style.left = `${element.x}px`
  wrapper.style.top = `${element.y}px`
  wrapper.style.width = `${element.width}px`
  wrapper.style.height = `${Math.max(element.height, 180)}px`
  wrapper.style.fontFamily = hooks.getElementFontFamily(element)
  wrapper.style.fontSize = `${hooks.getElementFontSize(element)}px`
  wrapper.style.fontWeight = String(hooks.getElementFontWeight(element))
  wrapper.style.fontStyle = element.styles.fontStyle ?? 'normal'
  wrapper.style.lineHeight = `${hooks.getElementLineHeight(element)}px`

  const textarea = document.createElement('textarea')
  textarea.value = inlineEditorState.draft
  textarea.dataset['inlineEditor'] = 'true'
  textarea.addEventListener('input', () => {
    const nextState = hooks.getInlineEditorState()
    if (nextState !== null) nextState.draft = textarea.value
  })
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      hooks.setInlineEditorState(null)
      hooks.scheduleRender()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commitInlineEditor(hooks)
    }
  })
  wrapper.append(textarea)

  const variablesRow = document.createElement('div')
  variablesRow.className = 'inline-editor__variables'
  for (const variable of hooks.state.variables) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'inline-editor__chip'
    chip.textContent = `{{${variable.name}}}`
    chip.addEventListener('click', () => {
      hooks.insertTokenIntoTextArea(textarea, `{{${variable.name}}}`)
      const nextState = hooks.getInlineEditorState()
      if (nextState !== null) nextState.draft = textarea.value
    })
    variablesRow.append(chip)
  }
  wrapper.append(variablesRow)

  const actions = document.createElement('div')
  actions.className = 'inline-editor__actions'
  const hint = document.createElement('span')
  hint.className = 'helper'
  hint.textContent = 'Cmd/Ctrl+Enter saves · Escape cancels'
  actions.append(hint)
  const buttons = document.createElement('div')
  buttons.className = 'row'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'surface-chip warning'
  cancelButton.textContent = 'Cancel'
  cancelButton.addEventListener('click', () => {
    hooks.setInlineEditorState(null)
    hooks.scheduleRender()
  })
  const saveButton = document.createElement('button')
  saveButton.type = 'button'
  saveButton.className = 'surface-chip success'
  saveButton.textContent = 'Apply'
  saveButton.addEventListener('click', () => {
    commitInlineEditor(hooks)
  })
  buttons.append(cancelButton, saveButton)
  actions.append(buttons)
  wrapper.append(actions)

  hooks.inlineEditorLayer.append(wrapper)
  queueMicrotask(() => {
    textarea.focus()
    textarea.select()
  })
}

export function commitInlineEditor(hooks: InlineEditorHooks): void {
  const inlineEditorState = hooks.getInlineEditorState()
  if (inlineEditorState === null) return
  const element = hooks.getElementById(inlineEditorState.elementId)
  if (element === null) return
  hooks.recordState()
  element.content = inlineEditorState.draft
  hooks.setInlineEditorState(null)
  hooks.markDirty()
  hooks.clearTextProjectionFor(element.id)
  hooks.scheduleRender()
}
