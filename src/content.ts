import { IMAGE_MAX_EDGE } from './schema.ts'
import { convertVectorJsonToSvg, svgTextToDataUrl } from './vector-json.ts'

export function stripHtmlToText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return collectTextWithBreaks(doc.body)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function collectTextWithBreaks(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement || node instanceof HTMLBodyElement)) return ''

  if (node.tagName === 'BR') return '\n'
  const blockTags = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'])
  const childText = Array.from(node.childNodes).map(collectTextWithBreaks).join('')
  if (!blockTags.has(node.tagName)) return childText
  return `\n${childText}\n`
}

export function sanitizeHtml(rawHtml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')
  const fragment = document.createDocumentFragment()
  for (const child of Array.from(doc.body.childNodes)) {
    const sanitized = sanitizeNode(child)
    if (sanitized !== null) fragment.append(sanitized)
  }
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '')
  if (!(node instanceof HTMLElement)) return null

  const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL'])
  if (!allowedTags.has(node.tagName)) {
    const fragment = document.createDocumentFragment()
    for (const child of Array.from(node.childNodes)) {
      const sanitizedChild = sanitizeNode(child)
      if (sanitizedChild !== null) fragment.append(sanitizedChild)
    }
    return fragment
  }

  const next = document.createElement(node.tagName.toLowerCase())
  const allowedAttributes = new Set(['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'colspan', 'rowspan'])
  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase()
    if (name.startsWith('on')) continue
    if (!allowedAttributes.has(name)) continue
    const value = attribute.value
    if (name === 'href' || name === 'src') {
      const safeUrl = normalizeSafeUrl(value, name)
      if (safeUrl === null) continue
      next.setAttribute(name, safeUrl)
      if (name === 'href') {
        next.setAttribute('target', '_blank')
        next.setAttribute('rel', 'noopener noreferrer')
      }
      continue
    }
    if (name === 'style') {
      const safeStyle = sanitizeStyle(value)
      if (safeStyle.length > 0) next.setAttribute('style', safeStyle)
      continue
    }
    next.setAttribute(name, value)
  }

  for (const child of Array.from(node.childNodes)) {
    const sanitizedChild = sanitizeNode(child)
    if (sanitizedChild !== null) next.append(sanitizedChild)
  }
  return next
}

function sanitizeStyle(styleText: string): string {
  const allowedProperties = new Set([
    'background',
    'background-color',
    'border',
    'border-bottom',
    'border-left',
    'border-radius',
    'border-right',
    'border-top',
    'color',
    'display',
    'font-size',
    'font-style',
    'font-weight',
    'line-height',
    'margin',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'margin-top',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'text-align',
    'text-decoration',
  ])

  return styleText
    .split(';')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const [property, ...valueParts] = chunk.split(':')
      if (property === undefined) return null
      const normalizedProperty = property.trim().toLowerCase()
      if (!allowedProperties.has(normalizedProperty)) return null
      const value = valueParts.join(':').trim()
      if (value.length === 0) return null
      if (/expression\s*\(|url\s*\(/i.test(value)) return null
      return `${normalizedProperty}:${value}`
    })
    .filter((value): value is string => value !== null)
    .join(';')
}

export function normalizeSafeUrl(url: string, kind: 'href' | 'src'): string | null {
  const trimmed = url.trim()
  if (trimmed.length === 0) return kind === 'href' ? null : ''
  if (trimmed.startsWith('data:image/')) return trimmed
  try {
    const parsed = new URL(trimmed, window.location.origin)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') return parsed.href
    return null
  } catch {
    return null
  }
}

export function toVideoEmbedUrl(url: string): string | null {
  const safeUrl = normalizeSafeUrl(url, 'href')
  if (safeUrl === null) return null
  try {
    const parsed = new URL(safeUrl)
    if (parsed.hostname.includes('youtube.com')) {
      const videoId = parsed.searchParams.get('v')
      return videoId === null ? null : `https://www.youtube.com/embed/${videoId}`
    }
    if (parsed.hostname.includes('youtu.be')) {
      const videoId = parsed.pathname.split('/').filter(Boolean).pop()
      return videoId === undefined ? null : `https://www.youtube.com/embed/${videoId}`
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const videoId = parsed.pathname.split('/').filter(Boolean).pop()
      return videoId === undefined ? null : `https://player.vimeo.com/video/${videoId}`
    }
    return null
  } catch {
    return null
  }
}

export async function optimizeImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (file.type === 'image/svg+xml') {
    return {
      dataUrl: await fileToDataUrl(file),
      width: 0,
      height: 0,
    }
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const context = offscreen.getContext('2d')
  if (context === null) throw new Error('Canvas 2D context unavailable for image optimization')
  context.drawImage(bitmap, 0, 0, width, height)
  const mime = file.type === 'image/png' ? 'image/png' : 'image/webp'
  return {
    dataUrl: offscreen.toDataURL(mime, mime === 'image/webp' ? 0.9 : undefined),
    width,
    height,
  }
}

export type UploadedVisualKind = 'image' | 'gif' | 'svg' | 'svg-json' | 'lottie-json'

export async function prepareUploadedVisualFile(file: File): Promise<{ dataUrl: string; width: number; height: number; kind: UploadedVisualKind }> {
  if (isJsonVectorFile(file)) {
    const vector = convertVectorJsonToSvg(await file.text(), file.name)
    return {
      dataUrl: svgTextToDataUrl(vector.svg),
      width: vector.width,
      height: vector.height,
      kind: vector.sourceKind,
    }
  }

  if (isGifFile(file) || isSvgFile(file)) {
    const dataUrl = await fileToDataUrl(file)
    try {
      const image = await loadImageElement(dataUrl)
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        kind: isGifFile(file) ? 'gif' : 'svg',
      }
    } catch {
      return {
        dataUrl,
        width: 0,
        height: 0,
        kind: isGifFile(file) ? 'gif' : 'svg',
      }
    }
  }

  return { ...await optimizeImageFile(file), kind: 'image' }
}

function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name)
}

function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

function isJsonVectorFile(file: File): boolean {
  return file.type === 'application/json' || /\.json$/i.test(file.name)
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = src
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob === null) {
        reject(new Error('Canvas export failed'))
        return
      }
      resolve(blob)
    }, mime)
  })
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}
