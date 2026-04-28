import type { CanvasElement, StudioState, TracedPathPoint } from './schema.ts'
import { freehandToTracedPath, parseTracedPath, resetGifAnimState, tracedPathToSvgPath } from './animated-media.ts'
import type { MascotWaypoint } from './mascots.ts'

export type PathTraceState = {
  targetElementId: string
  rawPoints: TracedPathPoint[]
  drawing: boolean
}

type PathTraceHooks = {
  state: StudioState
  pathOverlay: SVGSVGElement
  tracePathButton: HTMLButtonElement
  getPathTraceMode: () => boolean
  setPathTraceMode: (enabled: boolean) => void
  getPathTraceState: () => PathTraceState | null
  setPathTraceState: (state: PathTraceState | null) => void
  getSelectedElement: () => CanvasElement | null
  getElementById: (id: string) => CanvasElement | null
  recordState: () => void
  markDirty: (showChanged?: boolean) => void
  clearTextProjectionCache: () => void
  scheduleRender: () => void
  showToast: (message: string) => void
  resetGifBasePositions: () => void
  syncGifAnimation: () => void
  resetMascotAnimState: (elementId: string) => void
  resetMascotBasePositions: () => void
  syncMascotAnimation: () => void
  canvasWidth: () => number
}

export function parseMascotPath(element: CanvasElement): MascotWaypoint[] {
  const raw = element.styles.mascotPath
  if (raw === undefined || raw.length === 0) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((point: unknown): point is MascotWaypoint =>
      typeof point === 'object' && point !== null && typeof (point as MascotWaypoint).x === 'number' && typeof (point as MascotWaypoint).y === 'number'
    )
  } catch {
    return []
  }
}

export function renderMascotPathOverlay(
  node: HTMLDivElement,
  element: CanvasElement,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const path = parseMascotPath(element)
  if (path.length < 2) return
  const overlay = document.createElement('div')
  overlay.className = 'mascot-path-overlay'
  overlay.style.pointerEvents = 'none'

  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('class', 'mascot-path-svg')
  svg.style.position = 'absolute'
  svg.style.overflow = 'visible'
  svg.style.left = `${-element.x}px`
  svg.style.top = `${-element.y}px`
  svg.style.width = `${canvasWidth}px`
  svg.style.height = `${canvasHeight}px`
  svg.style.pointerEvents = 'none'

  const polyline = document.createElementNS(svgNs, 'polyline')
  const pointsStr = path.map(point => `${point.x + element.width / 2},${point.y + element.height / 2}`).join(' ')
  polyline.setAttribute('points', pointsStr)
  polyline.setAttribute('fill', 'none')
  polyline.setAttribute('stroke', '#2dd4e0')
  polyline.setAttribute('stroke-width', '2')
  polyline.setAttribute('stroke-dasharray', '6 4')
  polyline.setAttribute('opacity', '0.7')
  svg.append(polyline)

  for (let index = 0; index < path.length; index++) {
    const waypoint = path[index]!
    const circle = document.createElementNS(svgNs, 'circle')
    circle.setAttribute('cx', String(waypoint.x + element.width / 2))
    circle.setAttribute('cy', String(waypoint.y + element.height / 2))
    circle.setAttribute('r', '6')
    circle.setAttribute('fill', index === 0 ? '#2dd4e0' : '#f59f6c')
    circle.setAttribute('stroke', '#fff')
    circle.setAttribute('stroke-width', '2')
    circle.setAttribute('opacity', '0.9')
    svg.append(circle)
  }

  overlay.append(svg)
  node.append(overlay)
}

export function renderGifPathOverlay(
  node: HTMLDivElement,
  element: CanvasElement,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const path = parseTracedPath(element.styles.gifPath)
  if (path === null || path.points.length < 2) return
  const svgNs = 'http://www.w3.org/2000/svg'
  const overlay = document.createElement('div')
  overlay.className = 'mascot-path-overlay'
  overlay.style.pointerEvents = 'none'

  const svg = document.createElementNS(svgNs, 'svg')
  svg.style.position = 'absolute'
  svg.style.overflow = 'visible'
  svg.style.left = `${-element.x}px`
  svg.style.top = `${-element.y}px`
  svg.style.width = `${canvasWidth}px`
  svg.style.height = `${canvasHeight}px`
  svg.style.pointerEvents = 'none'

  const pathEl = document.createElementNS(svgNs, 'path')
  pathEl.setAttribute('d', tracedPathToSvgPath(path))
  pathEl.setAttribute('fill', 'none')
  pathEl.setAttribute('stroke', '#f472b6')
  pathEl.setAttribute('stroke-width', '2')
  pathEl.setAttribute('stroke-dasharray', '6 4')
  pathEl.setAttribute('opacity', '0.7')
  svg.append(pathEl)

  for (let index = 0; index < path.points.length; index++) {
    const controlPoint = path.points[index]!
    const circle = document.createElementNS(svgNs, 'circle')
    circle.setAttribute('cx', String(controlPoint.anchor.x))
    circle.setAttribute('cy', String(controlPoint.anchor.y))
    circle.setAttribute('r', '5')
    circle.setAttribute('fill', index === 0 ? '#f472b6' : '#a78bfa')
    circle.setAttribute('stroke', '#fff')
    circle.setAttribute('stroke-width', '2')
    circle.setAttribute('opacity', '0.9')
    svg.append(circle)
  }

  overlay.append(svg)
  node.append(overlay)
}

export function toggleTracePathMode(hooks: PathTraceHooks): void {
  if (hooks.getPathTraceMode()) {
    cancelPathTrace(hooks)
    return
  }
  const element = hooks.getSelectedElement()
  if (element === null || !isPathTraceTarget(element)) {
    hooks.showToast('Select an animated visual or mascot first')
    return
  }
  startPathTrace(element.id, hooks)
}

export function startPathTrace(elementId: string, hooks: PathTraceHooks): void {
  const element = hooks.getElementById(elementId)
  if (element === null || !isPathTraceTarget(element)) {
    hooks.showToast('Select an animated visual or mascot first')
    return
  }
  hooks.setPathTraceMode(true)
  hooks.setPathTraceState({ targetElementId: elementId, rawPoints: [], drawing: false })
  document.body.classList.add('trace-path-mode')
  hooks.tracePathButton.classList.add('active')
  hooks.showToast(`Click and drag on the canvas to draw ${traceTargetLabel(element)} path. Press Escape to cancel.`)
  renderPathOverlay(hooks)
}

export function cancelPathTrace(hooks: PathTraceHooks): void {
  hooks.setPathTraceMode(false)
  hooks.setPathTraceState(null)
  document.body.classList.remove('trace-path-mode')
  hooks.tracePathButton.classList.remove('active')
  renderPathOverlay(hooks)
}

export function commitPathTrace(hooks: PathTraceHooks): void {
  const pathTraceState = hooks.getPathTraceState()
  if (pathTraceState === null) return
  const element = hooks.getElementById(pathTraceState.targetElementId)
  if (element === null || !isPathTraceTarget(element)) {
    cancelPathTrace(hooks)
    return
  }
  if (pathTraceState.rawPoints.length < 2) {
    cancelPathTrace(hooks)
    return
  }

  hooks.recordState()
  if (element.type === 'animated-gif') {
    const tracedPath = freehandToTracedPath(pathTraceState.rawPoints, false)
    element.styles.gifPath = JSON.stringify(tracedPath)
    resetGifAnimState(element.id)
    hooks.resetGifBasePositions()
  } else {
    element.styles.mascotPath = JSON.stringify(pathTraceState.rawPoints.map(point => ({
      x: clamp(point.x - element.width / 2, 0, Math.max(0, hooks.canvasWidth() - element.width)),
      y: clamp(point.y - element.height / 2, 0, Math.max(0, hooks.state.canvasHeight - element.height)),
    })))
    if ((element.styles.mascotBehavior ?? 'idle') === 'idle') element.styles.mascotBehavior = 'patrol'
    hooks.resetMascotAnimState(element.id)
    hooks.resetMascotBasePositions()
  }
  hooks.markDirty()
  hooks.clearTextProjectionCache()

  hooks.setPathTraceMode(false)
  hooks.setPathTraceState(null)
  document.body.classList.remove('trace-path-mode')
  hooks.tracePathButton.classList.remove('active')

  if (element.type === 'animated-gif') {
    hooks.syncGifAnimation()
  } else {
    hooks.syncMascotAnimation()
  }
  hooks.scheduleRender()
  hooks.showToast(element.type === 'animated-gif' ? 'Path traced - set behavior to animate along it' : 'Mascot path traced')
}

export function renderPathOverlay(hooks: Pick<PathTraceHooks, 'state' | 'pathOverlay' | 'getPathTraceMode' | 'getPathTraceState' | 'canvasWidth'>): void {
  const svgNs = 'http://www.w3.org/2000/svg'
  while (hooks.pathOverlay.firstChild) hooks.pathOverlay.removeChild(hooks.pathOverlay.firstChild)

  const pathTraceState = hooks.getPathTraceState()
  if (!hooks.getPathTraceMode() || pathTraceState === null || pathTraceState.rawPoints.length < 2) {
    hooks.pathOverlay.style.display = 'none'
    return
  }

  hooks.pathOverlay.style.display = ''
  hooks.pathOverlay.setAttribute('width', String(hooks.canvasWidth()))
  hooks.pathOverlay.setAttribute('height', String(hooks.state.canvasHeight))

  const polyline = document.createElementNS(svgNs, 'polyline')
  const pointsStr = pathTraceState.rawPoints.map(point => `${point.x},${point.y}`).join(' ')
  polyline.setAttribute('points', pointsStr)
  polyline.setAttribute('fill', 'none')
  const element = hooks.state.elements.find(candidate => candidate.id === pathTraceState.targetElementId)
  const isMascot = element?.type === 'mascot'
  polyline.setAttribute('stroke', isMascot ? '#2dd4e0' : '#f472b6')
  polyline.setAttribute('stroke-width', '2.5')
  polyline.setAttribute('stroke-dasharray', '8 4')
  polyline.setAttribute('opacity', '0.8')
  hooks.pathOverlay.append(polyline)

  const first = pathTraceState.rawPoints[0]!
  const last = pathTraceState.rawPoints[pathTraceState.rawPoints.length - 1]!
  for (const point of [first, last]) {
    const circle = document.createElementNS(svgNs, 'circle')
    circle.setAttribute('cx', String(point.x))
    circle.setAttribute('cy', String(point.y))
    circle.setAttribute('r', '6')
    circle.setAttribute('fill', point === first ? (isMascot ? '#2dd4e0' : '#f472b6') : (isMascot ? '#f59f6c' : '#a78bfa'))
    circle.setAttribute('stroke', '#fff')
    circle.setAttribute('stroke-width', '2')
    circle.setAttribute('opacity', '0.9')
    hooks.pathOverlay.append(circle)
  }
}

function isPathTraceTarget(element: CanvasElement): boolean {
  return element.type === 'animated-gif' || element.type === 'mascot'
}

function traceTargetLabel(element: CanvasElement): string {
  return element.type === 'mascot' ? 'a mascot walking' : 'an animated visual'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
