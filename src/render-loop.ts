import type { Store, Unsubscribe } from './store.ts'

export type RenderLoop = {
  requestRender: () => void
  dispose: () => void
}

type RenderLoopOptions = {
  render: () => void
  onError?: (context: string, error: unknown) => void
}

export function initRenderLoop(store: Store, options: RenderLoopOptions): RenderLoop {
  let frameId: number | null = null
  let disposed = false

  function flush(): void {
    frameId = null
    if (disposed) return
    try {
      options.render()
    } catch (error) {
      if (options.onError !== undefined) options.onError('Render failed', error)
      else throw error
    }
  }

  function requestRender(): void {
    if (disposed || frameId !== null) return
    frameId = requestAnimationFrame(flush)
  }

  const unsubscribe = store.onChange(() => {
    requestRender()
  })

  return {
    requestRender,
    dispose() {
      disposed = true
      unsubscribe()
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
    },
  }
}

export function requestRender(store: Store): void {
  store.dispatch({ type: 'render/request' })
}

export function combineDisposers(disposers: Unsubscribe[]): Unsubscribe {
  return () => {
    for (const dispose of disposers) dispose()
  }
}
