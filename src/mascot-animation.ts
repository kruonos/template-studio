import type { CanvasElement, StudioState } from './schema.ts'
import type { MascotAnimState, MascotWaypoint } from './mascots.ts'
import { parseMascotPath } from './animation-paths.ts'
import { clamp } from './utils.ts'

type MascotAnimationHooks = {
  state: StudioState
  getAnimStates: () => Map<string, MascotAnimState>
  getFrameId: () => number | null
  setFrameId: (frameId: number | null) => void
  getLastFrameTime: () => number
  setLastFrameTime: (time: number) => void
  canvasWidth: () => number
  renderAnimatedCanvasFrame: () => void
}

type MascotPositionHooks = Pick<MascotAnimationHooks, 'state' | 'getAnimStates' | 'canvasWidth'>

function getMascotAnimState(element: CanvasElement, hooks: MascotPositionHooks): MascotAnimState {
  let animState = hooks.getAnimStates().get(element.id)
  if (animState === undefined) {
    animState = {
      elementId: element.id,
      pathProgress: 0,
      currentWaypoint: 0,
      direction: 1,
      bobPhase: Math.random() * Math.PI * 2,
      baseX: element.x,
      baseY: element.y,
    }
    hooks.getAnimStates().set(element.id, animState)
  }
  return animState
}

function lerpPoint(a: MascotWaypoint, b: MascotWaypoint, t: number): MascotWaypoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function waypointDistance(a: MascotWaypoint, b: MascotWaypoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

function hasMascotAnimation(hooks: Pick<MascotAnimationHooks, 'state'>): boolean {
  for (const element of hooks.state.elements) {
    if (element.type === 'mascot' && (element.styles.mascotBehavior ?? 'idle') !== 'idle') return true
  }
  return false
}

function mascotAnimLoop(time: number, hooks: MascotAnimationHooks): void {
  const lastFrameTime = hooks.getLastFrameTime()
  const delta = lastFrameTime > 0 ? Math.min(time - lastFrameTime, 100) : 16
  hooks.setLastFrameTime(time)

  const moved = updateMascotPositions(delta, hooks)
  if (moved) {
    hooks.renderAnimatedCanvasFrame()
  }

  if (hasMascotAnimation(hooks)) {
    hooks.setFrameId(requestAnimationFrame(nextTime => mascotAnimLoop(nextTime, hooks)))
  } else {
    hooks.setFrameId(null)
    hooks.setLastFrameTime(0)
  }
}

function startMascotAnimation(hooks: MascotAnimationHooks): void {
  if (hooks.getFrameId() !== null) return
  if (!hasMascotAnimation(hooks)) return
  hooks.setLastFrameTime(0)
  hooks.setFrameId(requestAnimationFrame(time => mascotAnimLoop(time, hooks)))
}

export function stopMascotAnimation(hooks: Pick<MascotAnimationHooks, 'getFrameId' | 'setFrameId' | 'setLastFrameTime'>): void {
  const frameId = hooks.getFrameId()
  if (frameId !== null) {
    cancelAnimationFrame(frameId)
    hooks.setFrameId(null)
    hooks.setLastFrameTime(0)
  }
}

export function updateMascotPositions(deltaMs: number, hooks: MascotPositionHooks): boolean {
  let anyMoved = false
  for (const element of hooks.state.elements) {
    if (element.type !== 'mascot') continue
    const behavior = element.styles.mascotBehavior ?? 'idle'
    if (behavior === 'idle') continue
    if (hooks.state.selectedId === element.id || hooks.state.selectedIds.has(element.id)) continue

    const animState = getMascotAnimState(element, hooks)
    const speed = (element.styles.mascotSpeed ?? 1) * 80
    const path = parseMascotPath(element)
    const deltaSec = deltaMs / 1000
    animState.bobPhase += deltaSec * 3

    if (behavior === 'orbit') {
      animState.pathProgress += deltaSec * (element.styles.mascotSpeed ?? 1) * 0.8
      const centerX = animState.baseX
      const centerY = animState.baseY
      const radius = Math.max(element.width, 60)
      const newX = centerX + Math.cos(animState.pathProgress) * radius
      const newY = centerY + Math.sin(animState.pathProgress) * radius * 0.6
      const bob = Math.sin(animState.bobPhase) * 3
      element.x = clamp(Math.round(newX), 0, hooks.canvasWidth() - element.width)
      element.y = clamp(Math.round(newY + bob), 0, Math.max(0, hooks.state.canvasHeight - element.height))
      anyMoved = true
      continue
    }

    if (behavior === 'wander') {
      animState.pathProgress += deltaSec
      const wanderX = Math.sin(animState.pathProgress * 0.7) * 120 + Math.sin(animState.pathProgress * 1.3) * 60
      const wanderY = Math.cos(animState.pathProgress * 0.5) * 80 + Math.cos(animState.pathProgress * 1.1) * 40
      const bob = Math.sin(animState.bobPhase) * 2
      element.x = clamp(Math.round(animState.baseX + wanderX), 0, hooks.canvasWidth() - element.width)
      element.y = clamp(Math.round(animState.baseY + wanderY + bob), 0, Math.max(0, hooks.state.canvasHeight - element.height))
      anyMoved = true
      continue
    }

    if (path.length < 2) continue

    const segmentDistances: number[] = []
    let totalLength = 0
    for (let index = 0; index < path.length - 1; index += 1) {
      const distance = waypointDistance(path[index]!, path[index + 1]!)
      segmentDistances.push(distance)
      totalLength += distance
    }
    if (totalLength < 1) continue

    const travelDist = speed * deltaSec
    animState.pathProgress += (travelDist / totalLength) * animState.direction

    if (behavior === 'bounce') {
      if (animState.pathProgress >= 1) {
        animState.pathProgress = 1
        animState.direction = -1
      }
      if (animState.pathProgress <= 0) {
        animState.pathProgress = 0
        animState.direction = 1
      }
    } else {
      while (animState.pathProgress >= 1) animState.pathProgress -= 1
      while (animState.pathProgress < 0) animState.pathProgress += 1
    }

    let remaining = animState.pathProgress * totalLength
    let segIndex = 0
    while (segIndex < segmentDistances.length - 1 && remaining > segmentDistances[segIndex]!) {
      remaining -= segmentDistances[segIndex]!
      segIndex += 1
    }
    const segLength = segmentDistances[segIndex]!
    const segT = segLength > 0 ? remaining / segLength : 0
    const pos = lerpPoint(path[segIndex]!, path[segIndex + 1]!, clamp(segT, 0, 1))
    const bob = Math.sin(animState.bobPhase) * 3

    element.x = clamp(Math.round(pos.x), 0, hooks.canvasWidth() - element.width)
    element.y = clamp(Math.round(pos.y + bob), 0, Math.max(0, hooks.state.canvasHeight - element.height))
    anyMoved = true
  }
  return anyMoved
}

export function syncMascotAnimation(hooks: MascotAnimationHooks): void {
  const liveIds = new Set<string>(hooks.state.elements.filter(element => element.type === 'mascot').map(element => element.id))
  for (const id of hooks.getAnimStates().keys()) {
    if (!liveIds.has(id)) hooks.getAnimStates().delete(id)
  }
  if (hasMascotAnimation(hooks)) {
    startMascotAnimation(hooks)
  } else {
    stopMascotAnimation(hooks)
  }
}

export function resetMascotBasePositions(hooks: Pick<MascotAnimationHooks, 'state' | 'getAnimStates'>): void {
  for (const element of hooks.state.elements) {
    if (element.type !== 'mascot') continue
    const animState = hooks.getAnimStates().get(element.id)
    if (animState !== undefined) {
      animState.baseX = element.x
      animState.baseY = element.y
    }
  }
}
