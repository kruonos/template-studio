import type { PathTraceState } from './animation-paths.ts'
import type { MascotAnimState } from './mascots.ts'
import type {
  CanvasElement,
  ContextMenuState,
  DragState,
  ElementId,
  ElementType,
  InlineEditorState,
  MarqueeState,
  ResizeState,
  SidebarTab,
  StoredDocument,
  StudioState,
  ViewMode,
  WrapMode,
  ZoomMode,
} from './schema.ts'
import type { TableCellEditingState, TableCellSelectionState } from './table-ui.ts'
import type { Point } from './wrap-geometry.ts'
import type { createCacheManager } from './cache-manager.ts'

export type HistoryState = {
  past: StoredDocument[]
  future: StoredDocument[]
}

export type TableInteractionState = {
  selection: TableCellSelectionState | null
  editing: TableCellEditingState | null
  colResize: { elementId: string; colIndex: number; startX: number } | null
  rowResize: { elementId: string; rowIndex: number; startY: number } | null
  pendingClick: { elementId: string; localX: number; localY: number; shiftKey: boolean } | null
}

export type InteractionState = {
  inlineEditorState: InlineEditorState | null
  paletteDragType: ElementType | null
  dragState: DragState | null
  resizeState: ResizeState | null
  focusHistoryTarget: EventTarget | null
  contextMenuState: ContextMenuState | null
  marqueeState: MarqueeState | null
  marqueeNode: HTMLDivElement | null
  measurementNode: HTMLDivElement | null
  pathTraceState: PathTraceState | null
  pathTraceMode: boolean
  table: TableInteractionState
}

export type RuntimeState = {
  renderVersion: number
  toastTimer: number | null
  autoSaveTimer: number | null
  imageUploadTargetId: string | null
  clipboard: CanvasElement | null
  elementNodes: Map<string, HTMLDivElement>
  cacheManager: ReturnType<typeof createCacheManager>
  gifExportPreviewUrl: string | null
}

export type AnimationState = {
  mascotAnimStates: Map<string, MascotAnimState>
  mascotAnimFrameId: number | null
  mascotLastFrameTime: number
  mascotHullCache: Map<string, Point[] | null>
  mascotHullPending: Set<string>
  gifAnimFrameId: number | null
  gifLastFrameTime: number
  gifHullCache: Map<string, { x: number; y: number }[] | null>
  gifHullPending: Set<string>
}

export type AppState = {
  document: StudioState
  history: HistoryState
  interaction: InteractionState
  runtime: RuntimeState
  animation: AnimationState
}

export type Action =
  | { type: 'render/request' }
  | { type: 'document/apply'; payload: Partial<StudioState> }
  | { type: 'document/markDirty'; payload?: { dirty?: boolean } }
  | { type: 'element/select'; payload: { id: ElementId | null; ids?: ElementId[] } }
  | { type: 'element/move'; payload: { id: ElementId; x: number; y: number } }
  | { type: 'element/patch'; payload: { id: ElementId; patch: Partial<CanvasElement> } }
  | { type: 'ui/setSidebarTab'; payload: SidebarTab }
  | { type: 'ui/setViewMode'; payload: ViewMode }
  | { type: 'ui/setZoom'; payload: number }
  | { type: 'ui/setZoomMode'; payload: ZoomMode }
  | { type: 'ui/setShowGrid'; payload: boolean }
  | { type: 'ui/setWrapMode'; payload: WrapMode }
  | { type: 'interaction/setInlineEditor'; payload: InlineEditorState | null }
  | { type: 'interaction/setDragState'; payload: DragState | null }
  | { type: 'interaction/setResizeState'; payload: ResizeState | null }
  | { type: 'interaction/setContextMenu'; payload: ContextMenuState | null }
  | { type: 'interaction/setMarquee'; payload: MarqueeState | null }
  | { type: 'history/record'; payload: StoredDocument }
  | { type: 'history/clear' }
  | { type: 'history/undo' }
  | { type: 'history/redo' }

type Selector<T> = (state: Readonly<AppState>) => T
type Subscriber<T> = (next: T, previous: T, action: Action) => void
type ChangeSubscriber = (state: Readonly<AppState>, action: Action) => void
export type Unsubscribe = () => void

type SelectorSubscription<T> = {
  selector: Selector<T>
  callback: Subscriber<T>
  value: T
}

export type Store = {
  getState: () => Readonly<AppState>
  /**
   * Transitional escape hatch used by the legacy controller while feature
   * modules are migrated from mutation hooks to reducer actions.
   */
  getMutableState: () => AppState
  dispatch: (action: Action) => void
  subscribe: <T>(selector: Selector<T>, callback: Subscriber<T>) => Unsubscribe
  onChange: (callback: ChangeSubscriber) => Unsubscribe
}

export function createStore(initialState: AppState): Store {
  const state = initialState
  const selectorSubscriptions: Array<SelectorSubscription<unknown>> = []
  const changeSubscribers = new Set<ChangeSubscriber>()

  function dispatch(action: Action): void {
    reduce(state, action)
    for (const subscription of selectorSubscriptions) {
      const nextValue = subscription.selector(state)
      if (Object.is(nextValue, subscription.value)) continue
      const previousValue = subscription.value
      subscription.value = nextValue
      subscription.callback(nextValue, previousValue, action)
    }
    for (const callback of changeSubscribers) callback(state, action)
  }

  return {
    getState: () => state,
    getMutableState: () => state,
    dispatch,
    subscribe<T>(selector: Selector<T>, callback: Subscriber<T>): Unsubscribe {
      const subscription: SelectorSubscription<T> = {
        selector,
        callback,
        value: selector(state),
      }
      selectorSubscriptions.push(subscription as SelectorSubscription<unknown>)
      return () => {
        const index = selectorSubscriptions.indexOf(subscription as SelectorSubscription<unknown>)
        if (index >= 0) selectorSubscriptions.splice(index, 1)
      }
    },
    onChange(callback: ChangeSubscriber): Unsubscribe {
      changeSubscribers.add(callback)
      return () => {
        changeSubscribers.delete(callback)
      }
    },
  }
}

function reduce(state: AppState, action: Action): void {
  switch (action.type) {
    case 'render/request':
      state.runtime.renderVersion += 1
      return
    case 'document/apply':
      Object.assign(state.document, action.payload)
      return
    case 'document/markDirty':
      state.document.dirty = action.payload?.dirty ?? true
      return
    case 'element/select':
      state.document.selectedId = action.payload.id
      state.document.selectedIds = new Set(action.payload.ids ?? (action.payload.id === null ? [] : [action.payload.id]))
      return
    case 'element/move': {
      const element = state.document.elements.find(item => item.id === action.payload.id)
      if (element === undefined) return
      element.x = action.payload.x
      element.y = action.payload.y
      return
    }
    case 'element/patch': {
      const element = state.document.elements.find(item => item.id === action.payload.id)
      if (element === undefined) return
      Object.assign(element, action.payload.patch)
      return
    }
    case 'ui/setSidebarTab':
      state.document.sidebarTab = action.payload
      return
    case 'ui/setViewMode':
      state.document.viewMode = action.payload
      return
    case 'ui/setZoom':
      state.document.zoom = action.payload
      return
    case 'ui/setZoomMode':
      state.document.zoomMode = action.payload
      return
    case 'ui/setShowGrid':
      state.document.showGrid = action.payload
      return
    case 'ui/setWrapMode':
      state.document.wrapMode = action.payload
      return
    case 'interaction/setInlineEditor':
      state.interaction.inlineEditorState = action.payload
      return
    case 'interaction/setDragState':
      state.interaction.dragState = action.payload
      return
    case 'interaction/setResizeState':
      state.interaction.resizeState = action.payload
      return
    case 'interaction/setContextMenu':
      state.interaction.contextMenuState = action.payload
      return
    case 'interaction/setMarquee':
      state.interaction.marqueeState = action.payload
      return
    case 'history/record':
      state.history.past.push(action.payload)
      state.history.future = []
      return
    case 'history/clear':
      state.history.past = []
      state.history.future = []
      return
    case 'history/undo': {
      const snapshot = state.history.past.pop()
      if (snapshot !== undefined) state.history.future.push(snapshot)
      return
    }
    case 'history/redo': {
      const snapshot = state.history.future.pop()
      if (snapshot !== undefined) state.history.past.push(snapshot)
      return
    }
  }
}
