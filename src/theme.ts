import {
  MANAGED_BUTTON_BACKGROUNDS,
  MANAGED_BUTTON_TEXT_COLORS,
  MANAGED_DIVIDER_COLORS,
  MANAGED_TEXT_COLORS,
  SURFACE_PALETTES,
  UI_THEME_STORAGE_KEY,
  type CanvasElement,
  type ElementType,
  type StudioState,
  type SurfacePalette,
  type SurfaceTheme,
  type UiTheme,
} from './schema.ts'

export function getSurfacePalette(surfaceTheme: SurfaceTheme): SurfacePalette {
  return surfaceTheme === 'dark' ? SURFACE_PALETTES.dark : SURFACE_PALETTES.light
}

export function applySurfaceTheme(
  state: StudioState,
  surfaceTheme: SurfaceTheme,
  recordState: () => void,
  markDirty: () => void,
  clearTextProjectionCache: () => void,
  scheduleRender: () => void,
): void {
  if (surfaceTheme === state.surfaceTheme) return
  recordState()
  const palette = getSurfacePalette(surfaceTheme)
  for (const element of state.elements) {
    applyManagedSurfaceColor(element, palette)
  }
  state.surfaceTheme = surfaceTheme
  markDirty()
  clearTextProjectionCache()
  scheduleRender()
}

function applyManagedSurfaceColor(element: CanvasElement, palette: SurfacePalette): void {
  if (element.type === 'heading' && shouldReplaceManagedValue(element.styles.color, MANAGED_TEXT_COLORS)) {
    element.styles.color = palette.heading
    return
  }
  if (element.type === 'text' && shouldReplaceManagedValue(element.styles.color, MANAGED_TEXT_COLORS)) {
    element.styles.color = palette.body
    return
  }
  if (element.type === 'button') {
    if (shouldReplaceManagedValue(element.styles.background, MANAGED_BUTTON_BACKGROUNDS)) {
      element.styles.background = palette.buttonBackground
    }
    if (shouldReplaceManagedValue(element.styles.color, MANAGED_BUTTON_TEXT_COLORS)) {
      element.styles.color = palette.buttonText
    }
    return
  }
  if (element.type === 'divider' && shouldReplaceManagedValue(element.styles.color, MANAGED_DIVIDER_COLORS)) {
    element.styles.color = palette.divider
  }
}

export function shouldReplaceManagedValue(value: string | undefined, candidates: readonly string[]): boolean {
  if (value === undefined) return true
  const normalizedValue = value.trim().toLowerCase()
  return candidates.some(candidate => candidate.trim().toLowerCase() === normalizedValue)
}

export function readStoredUiTheme(): UiTheme {
  try {
    const stored = localStorage.getItem(UI_THEME_STORAGE_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getActiveUiTheme(): UiTheme {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark'
}

export function applyUiTheme(theme: UiTheme): void {
  document.documentElement.dataset['theme'] = theme
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage failures and keep the in-memory theme active.
  }
}

export function getDefaultBackground(type: ElementType, surfaceTheme: SurfaceTheme): string {
  switch (type) {
    case 'button':
      return getSurfacePalette(surfaceTheme).buttonBackground
    case 'html':
      return '#edf8f6'
    default:
      return 'transparent'
  }
}

export function getDefaultBorderRadius(type: ElementType): number {
  switch (type) {
    case 'button':
      return 999
    case 'image':
    case 'video':
      return 20
    case 'html':
      return 16
    default:
      return 0
  }
}
