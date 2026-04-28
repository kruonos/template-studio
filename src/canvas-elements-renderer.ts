import { getButtonLabelFontSize } from './element-typography.ts'
import type { CanvasElement, DragState, ResizeState, StudioState, TextProjection } from './schema.ts'
import { getDefaultBorderRadius, getSurfacePalette } from './theme.ts'
import { roundTo, isTextBlock } from './utils.ts'

type RenderCanvasElementsHooks = {
  state: StudioState
  canvas: HTMLDivElement
  elementNodes: Map<string, HTMLDivElement>
  dragState: DragState | null
  resizeState: ResizeState | null
  projectTextElement: (element: CanvasElement) => TextProjection
  resolveVariables: (text: string) => string
  getImageSource: (element: CanvasElement) => string | null
  getAnimatedGifSource: (element: CanvasElement) => string | null
  getMascotVisualSource: (element: CanvasElement) => string
  getVideoEmbedSource: (element: CanvasElement) => string | null
  getElementTextColor: (element: CanvasElement) => string
  getElementFontFamily: (element: CanvasElement) => string
  getElementFontSize: (element: CanvasElement) => number
  getElementFontWeight: (element: CanvasElement) => number
  createPlaceholder: (title: string, detail: string) => HTMLDivElement
  sanitizeHtml: (html: string) => string
  renderMascotPathOverlay: (node: HTMLDivElement, element: CanvasElement) => void
  renderGifPathOverlay: (node: HTMLDivElement, element: CanvasElement) => void
  renderTableElement: (frame: HTMLDivElement, node: HTMLDivElement, element: CanvasElement) => void
}

export function renderCanvasElements(hooks: RenderCanvasElementsHooks): void {
  const seen = new Set<string>()
  for (const element of hooks.state.elements) {
    let node = hooks.elementNodes.get(element.id)
    if (node === undefined) {
      node = document.createElement('div')
      node.className = 'canvas-element'
      node.dataset['elementId'] = element.id
      hooks.elementNodes.set(element.id, node)
    }
    updateCanvasElementNode(node, element, hooks)
    hooks.canvas.append(node)
    seen.add(element.id)
  }
  for (const [elementId, node] of hooks.elementNodes) {
    if (seen.has(elementId)) continue
    node.remove()
    hooks.elementNodes.delete(elementId)
  }
}

function updateCanvasElementNode(
  node: HTMLDivElement,
  element: CanvasElement,
  hooks: RenderCanvasElementsHooks,
): void {
  node.className = `canvas-element canvas-element--${element.type}`
  if (hooks.state.selectedId === element.id) node.classList.add('selected')
  if (hooks.state.selectedIds.has(element.id) && hooks.state.selectedId !== element.id) node.classList.add('multi-selected')
  if (hooks.dragState?.id === element.id) node.classList.add('dragging')
  if (hooks.resizeState?.id === element.id) node.classList.add('resizing')
  if (element.locked) node.classList.add('locked')
  node.style.opacity = element.styles.opacity !== undefined ? String(element.styles.opacity) : ''
  node.style.left = `${Math.round(element.x)}px`
  node.style.top = `${Math.round(element.y)}px`
  node.style.width = `${Math.round(element.width)}px`
  node.style.height = `${Math.round(element.height)}px`
  node.replaceChildren()

  const frame = document.createElement('div')
  frame.className = 'canvas-element__frame'
  node.append(frame)

  if (element.type !== 'spacer') {
    const badge = document.createElement('div')
    badge.className = 'canvas-element__badge'
    badge.textContent = element.type
    node.append(badge)
  }

  if (isTextBlock(element.type)) {
    const projection = hooks.projectTextElement(element)
    for (const line of projection.lines) {
      const lineNode = document.createElement('span')
      lineNode.className = 'canvas-text-line'
      lineNode.style.left = `${roundTo(line.x, 2)}px`
      lineNode.style.top = `${roundTo(line.y, 2)}px`
      lineNode.style.font = projection.font
      lineNode.style.color = projection.color
      lineNode.style.textDecoration = projection.textDecoration
      lineNode.style.whiteSpace = 'pre'
      lineNode.style.lineHeight = `${projection.lineHeight}px`
      if (element.styles.letterSpacing !== undefined && element.styles.letterSpacing !== 0) {
        lineNode.style.letterSpacing = `${element.styles.letterSpacing}px`
      }
      lineNode.textContent = line.text
      frame.append(lineNode)
    }
    if (projection.truncated) {
      const warning = document.createElement('div')
      warning.className = 'canvas-element__warning'
      warning.textContent = 'Clipped'
      node.append(warning)
    }
  } else if (element.type === 'image') {
    const src = hooks.getImageSource(element)
    if (src !== null && src.length > 0) {
      const image = document.createElement('img')
      image.className = 'canvas-element__image'
      image.src = src
      image.alt = ''
      image.draggable = false
      frame.append(image)
    } else {
      frame.append(hooks.createPlaceholder('Drop or upload an image', 'Optimized in-browser before it lands on canvas.'))
    }
  } else if (element.type === 'button') {
    frame.style.background = element.styles.background ?? getSurfacePalette(hooks.state.surfaceTheme).buttonBackground
    frame.style.borderRadius = `${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}px`
    const label = document.createElement('div')
    label.className = 'canvas-element__button-label'
      label.style.color = hooks.getElementTextColor(element)
      label.style.fontFamily = hooks.getElementFontFamily(element)
      label.style.fontWeight = String(element.styles.fontWeight ?? 700)
      label.style.fontStyle = element.styles.fontStyle ?? 'normal'
      label.style.fontSize = `${getButtonLabelFontSize(element)}px`
      label.style.textDecoration = element.styles.textDecoration ?? 'none'
      label.textContent = hooks.resolveVariables(element.content)
      frame.append(label)
  } else if (element.type === 'divider') {
    const divider = document.createElement('div')
    divider.className = 'canvas-element__divider-line'
    divider.style.background = element.styles.color ?? getSurfacePalette(hooks.state.surfaceTheme).divider
    frame.append(divider)
  } else if (element.type === 'spacer') {
    frame.append(hooks.createPlaceholder('Spacer', 'Preserves vertical rhythm in exports and page flow.'))
  } else if (element.type === 'html') {
    const content = document.createElement('div')
    content.className = 'canvas-element__html-content'
    content.innerHTML = hooks.sanitizeHtml(hooks.resolveVariables(element.content))
    frame.append(content)
  } else if (element.type === 'video') {
    const embedUrl = hooks.getVideoEmbedSource(element)
    if (embedUrl !== null) {
      const iframe = document.createElement('iframe')
      iframe.className = 'canvas-element__video-frame'
      iframe.src = embedUrl
      iframe.allowFullscreen = true
      frame.append(iframe)
    } else {
      frame.append(hooks.createPlaceholder('Paste YouTube or Vimeo URL', 'Video blocks export as links in email and DOCX flows.'))
    }
  } else if (element.type === 'mascot') {
    const src = hooks.getMascotVisualSource(element)
    if (src.length > 0) {
      const img = document.createElement('img')
      img.className = 'canvas-element__mascot-image'
      img.src = src
      img.alt = 'Mascot'
      img.draggable = false
      frame.append(img)
    } else {
      frame.append(hooks.createPlaceholder('Upload a mascot', 'Use a GIF, PNG, SVG, or pick a preset to make the layout feel alive.'))
    }
    const speech = element.styles.mascotSpeech ?? ''
    if (speech.trim().length > 0) {
      const bubble = document.createElement('div')
      bubble.className = 'canvas-element__mascot-speech'
      bubble.textContent = hooks.resolveVariables(speech)
      node.append(bubble)
    }
    const behavior = element.styles.mascotBehavior ?? 'idle'
    if (behavior !== 'idle') node.classList.add('mascot-animated')
    if (hooks.state.selectedId === element.id) hooks.renderMascotPathOverlay(node, element)
  } else if (element.type === 'animated-gif') {
    const src = hooks.getAnimatedGifSource(element)
    if (src !== null && src.length > 0) {
      const img = document.createElement('img')
      img.className = 'canvas-element__image'
      img.src = src
      img.alt = 'Animated visual'
      img.draggable = false
      frame.append(img)
    } else {
      frame.append(hooks.createPlaceholder('Upload an animated visual', 'GIF, SVG, and vector JSON elements follow traced paths and act as dynamic obstacles.'))
    }
    const behavior = element.styles.gifBehavior ?? 'static'
    if (behavior !== 'static') node.classList.add('gif-animated')
    if (hooks.state.selectedId === element.id) hooks.renderGifPathOverlay(node, element)
  } else if (element.type === 'table') {
    hooks.renderTableElement(frame, node, element)
  }

  if (hooks.state.selectedId === element.id) {
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      const handleNode = document.createElement('div')
      handleNode.className = 'resize-handle'
      handleNode.dataset['handle'] = handle
      node.append(handleNode)
    }
  }
}
