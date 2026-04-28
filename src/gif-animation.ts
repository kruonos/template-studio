import { hasGifAnimation, syncGifAnimStates, updateGifPositions } from './animated-media.ts'
import type { CanvasElement, StudioState } from './schema.ts'

type GifAnimationHooks = {
  state: StudioState
  getFrameId: () => number | null
  setFrameId: (frameId: number | null) => void
  getLastFrameTime: () => number
  setLastFrameTime: (time: number) => void
  canvasWidth: () => number
  renderAnimatedCanvasFrame: () => void
}

function gifAnimLoop(time: number, hooks: GifAnimationHooks): void {
  const lastFrameTime = hooks.getLastFrameTime()
  const delta = lastFrameTime > 0 ? Math.min(time - lastFrameTime, 100) : 16
  hooks.setLastFrameTime(time)

  const moved = updateGifPositions(
    hooks.state.elements,
    delta,
    hooks.state.selectedId,
    hooks.state.selectedIds,
    hooks.canvasWidth(),
    hooks.state.canvasHeight,
  )
  if (moved) {
    hooks.renderAnimatedCanvasFrame()
  }

  if (hasGifAnimation(hooks.state.elements)) {
    hooks.setFrameId(requestAnimationFrame(nextTime => gifAnimLoop(nextTime, hooks)))
  } else {
    hooks.setFrameId(null)
    hooks.setLastFrameTime(0)
  }
}

function startGifAnimation(hooks: GifAnimationHooks): void {
  if (hooks.getFrameId() !== null) return
  if (!hasGifAnimation(hooks.state.elements)) return
  hooks.setLastFrameTime(0)
  hooks.setFrameId(requestAnimationFrame(time => gifAnimLoop(time, hooks)))
}

export function stopGifAnimation(hooks: Pick<GifAnimationHooks, 'getFrameId' | 'setFrameId' | 'setLastFrameTime'>): void {
  const frameId = hooks.getFrameId()
  if (frameId !== null) {
    cancelAnimationFrame(frameId)
    hooks.setFrameId(null)
    hooks.setLastFrameTime(0)
  }
}

export function syncGifAnimation(hooks: GifAnimationHooks): void {
  const liveIds = new Set(hooks.state.elements.filter((element: CanvasElement) => element.type === 'animated-gif').map(element => element.id))
  syncGifAnimStates(liveIds)
  if (hasGifAnimation(hooks.state.elements)) {
    startGifAnimation(hooks)
  } else {
    stopGifAnimation(hooks)
  }
}
