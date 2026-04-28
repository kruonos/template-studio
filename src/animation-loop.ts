import type { Store, Unsubscribe } from './store.ts'

type AnimationLoopHooks = {
  syncMascotAnimation: () => void
  syncGifAnimation: () => void
}

export function initAnimationLoop(store: Store, hooks: AnimationLoopHooks): Unsubscribe {
  return store.subscribe(
    state => state.document.elements
      .map(element => `${element.id}:${element.type}:${element.x}:${element.y}:${element.width}:${element.height}:${element.content.length}`)
      .join('|'),
    () => {
      hooks.syncMascotAnimation()
      hooks.syncGifAnimation()
    },
  )
}
