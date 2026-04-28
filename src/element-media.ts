import type { CanvasElement } from './schema.ts'
import { getMascotPresetSource } from './mascots.ts'
import {
  normalizeSafeUrl,
  toVideoEmbedUrl,
} from './content.ts'

type ResolveVariables = (text: string) => string

function resolveElementContent(element: CanvasElement, resolveVariables: ResolveVariables): string {
  return resolveVariables(element.content).trim()
}

export function getImageSource(element: CanvasElement, resolveVariables: ResolveVariables): string | null {
  if (element.type !== 'image') return null
  return normalizeSafeUrl(resolveElementContent(element, resolveVariables), 'src')
}

export function getAnimatedGifSource(element: CanvasElement, resolveVariables: ResolveVariables): string | null {
  if (element.type !== 'animated-gif') return null
  return normalizeSafeUrl(resolveElementContent(element, resolveVariables), 'src')
}

export function getMascotVisualSource(element: CanvasElement, resolveVariables: ResolveVariables): string {
  const preset = element.styles.mascotPreset ?? 'dragon'
  if (preset === 'custom') {
    return normalizeSafeUrl(resolveElementContent(element, resolveVariables), 'src') ?? ''
  }
  return getMascotPresetSource(preset)
}

export function getVideoHref(element: CanvasElement, resolveVariables: ResolveVariables): string | null {
  if (element.type !== 'video') return null
  return normalizeSafeUrl(resolveElementContent(element, resolveVariables), 'href')
}

export function getVideoEmbedSource(element: CanvasElement, resolveVariables: ResolveVariables): string | null {
  if (element.type !== 'video') return null
  return toVideoEmbedUrl(resolveElementContent(element, resolveVariables))
}
