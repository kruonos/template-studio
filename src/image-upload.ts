import { prepareUploadedVisualFile } from './content.ts'
import type { UploadedVisualKind } from './content.ts'
import type { CanvasElement } from './schema.ts'

type ImageUploadHooks = {
  imageUploadInput: HTMLInputElement
  getUploadTargetId: () => string | null
  setUploadTargetId: (targetId: string | null) => void
  getElementById: (id: string) => CanvasElement | null
  recordState: () => void
  canvasWidth: () => number
  clamp: (value: number, min: number, max: number) => number
  deleteMascotHull: (src: string) => void
  resetMascotBasePositions: () => void
  syncMascotAnimation: () => void
  maybeExtendPages: (requiredBottom: number) => void
  markDirty: () => void
  scheduleRender: () => void
  showToast: (message: string) => void
}

export async function handleImageUpload(hooks: ImageUploadHooks): Promise<void> {
  const file = hooks.imageUploadInput.files?.[0]
  const targetId = hooks.getUploadTargetId()
  hooks.imageUploadInput.value = ''
  hooks.setUploadTargetId(null)
  if (file === undefined || targetId === null) return

  const element = hooks.getElementById(targetId)
  if (element === null || (element.type !== 'image' && element.type !== 'mascot')) return

  hooks.recordState()
  const result = await prepareUploadedVisualFile(file)
  element.content = result.dataUrl
  if (element.type === 'mascot') {
    element.styles.mascotPreset = 'custom'
  }

  const aspect = result.width > 0 && result.height > 0 ? result.height / result.width : element.height / element.width
  if (element.type === 'image') {
    element.width = Math.min(hooks.canvasWidth() - element.x, Math.max(120, Math.round(result.width * 0.45)))
    element.height = Math.max(90, Math.round(element.width * aspect))
  } else {
    const nextWidth = result.width > 0 ? hooks.clamp(Math.round(result.width * 0.35), 72, 240) : element.width
    element.width = Math.min(hooks.canvasWidth() - element.x, nextWidth)
    element.height = Math.max(64, Math.round(element.width * aspect))
    hooks.deleteMascotHull(result.dataUrl)
    hooks.resetMascotBasePositions()
    hooks.syncMascotAnimation()
  }

  hooks.maybeExtendPages(element.y + element.height)
  hooks.markDirty()
  hooks.scheduleRender()
  hooks.showToast(element.type === 'mascot' ? 'Mascot media imported' : `${visualKindLabel(result.kind)} placed`)
}

function visualKindLabel(kind: UploadedVisualKind): string {
  switch (kind) {
    case 'gif':
      return 'GIF'
    case 'svg':
      return 'SVG'
    case 'svg-json':
      return 'SVG JSON'
    case 'lottie-json':
      return 'Lottie JSON'
    case 'image':
      return 'Image'
  }
}
