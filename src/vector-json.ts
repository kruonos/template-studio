export type VectorJsonSvgResult = {
  svg: string
  width: number
  height: number
  sourceKind: 'svg-json' | 'lottie-json'
}

type LottiePoint = {
  x: number
  y: number
}

const DEFAULT_VECTOR_SIZE = 512

export function svgTextToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function extractSvgFromJsonValue(value: unknown, depth = 0): string | null {
  if (depth > 8) return null
  if (typeof value === 'string') return extractSvgFromString(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const svg = extractSvgFromJsonValue(item, depth + 1)
      if (svg !== null) return svg
    }
    return null
  }
  if (!isRecord(value)) return null

  for (const key of ['svg', 'markup', 'content', 'source', 'data', 'body']) {
    if (key in value) {
      const svg = extractSvgFromJsonValue(value[key], depth + 1)
      if (svg !== null) return svg
    }
  }
  for (const child of Object.values(value)) {
    const svg = extractSvgFromJsonValue(child, depth + 1)
    if (svg !== null) return svg
  }
  return null
}

export function convertVectorJsonToSvg(jsonText: string, fallbackName = 'vector.json'): VectorJsonSvgResult {
  const parsed = JSON.parse(jsonText) as unknown
  const embeddedSvg = extractSvgFromJsonValue(parsed)
  if (embeddedSvg !== null) {
    const dimensions = getSvgDimensions(embeddedSvg)
    return {
      svg: ensureSvgNamespace(embeddedSvg, fallbackName),
      width: dimensions.width,
      height: dimensions.height,
      sourceKind: 'svg-json',
    }
  }

  const lottieSvg = convertLottieToSvg(parsed, fallbackName)
  if (lottieSvg !== null) return lottieSvg
  throw new Error('JSON file does not contain SVG markup or supported Lottie vector shapes')
}

function convertLottieToSvg(value: unknown, fallbackName: string): VectorJsonSvgResult | null {
  if (!isRecord(value)) return null
  const layers = arrayFrom(value['layers'])
  if (layers.length === 0) return null

  const width = Math.max(1, Math.round(numberFrom(value['w'], DEFAULT_VECTOR_SIZE)))
  const height = Math.max(1, Math.round(numberFrom(value['h'], DEFAULT_VECTOR_SIZE)))
  const frameStart = numberFrom(value['ip'], 0)
  const frameEnd = numberFrom(value['op'], frameStart + 1)
  const posterFrame = frameStart + Math.max(0, frameEnd - frameStart) * 0.5
  const body: string[] = []

  for (const layerValue of [...layers].reverse()) {
    const layer = asRecord(layerValue)
    if (layer === null) continue
    if (layer['hd'] === true) continue
    if (numberFrom(layer['ty'], -1) !== 4) continue
    if ('td' in layer) continue
    const ip = numberFrom(layer['ip'], frameStart)
    const op = numberFrom(layer['op'], frameEnd)
    if (posterFrame < ip || posterFrame >= op) continue
    const shapes = arrayFrom(layer['shapes'])
    const content = renderLottieItems(shapes, posterFrame)
    if (content.length === 0) continue
    const transform = transformFromKs(asRecord(layer['ks']), posterFrame)
    const opacity = opacityFromKs(asRecord(layer['ks']), posterFrame)
    body.push(wrapSvgGroup(content, transform, opacity))
  }

  if (body.length === 0) return null
  const title = escapeXml(fallbackName.replace(/\.json$/i, ''))
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">${body.join('')}</svg>`,
    width,
    height,
    sourceKind: 'lottie-json',
  }
}

function renderLottieItems(items: unknown[], frame: number): string {
  const rendered: string[] = []
  const fill = findFillStyle(items, frame)
  const stroke = findStrokeStyle(items, frame)
  const transform = findTransform(items, frame)
  const opacity = findTransformOpacity(items, frame)
  const paint = `${fill}${stroke}`

  for (const itemValue of items) {
    const item = asRecord(itemValue)
    if (item === null || item['hd'] === true) continue
    const type = String(item['ty'] ?? '')
    if (type === 'gr') {
      const group = renderLottieItems(arrayFrom(item['it']), frame)
      if (group.length > 0) rendered.push(group)
      continue
    }
    if (type === 'sh') {
      const path = pathDataFromShape(resolveAnimatedValue(asRecord(item['ks']), frame))
      if (path.length > 0) rendered.push(`<path d="${path}"${paint}/>`)
      continue
    }
    if (type === 'el') {
      const ellipse = ellipseFromItem(item, frame, paint)
      if (ellipse.length > 0) rendered.push(ellipse)
      continue
    }
    if (type === 'rc') {
      const rect = rectFromItem(item, frame, paint)
      if (rect.length > 0) rendered.push(rect)
    }
  }

  return wrapSvgGroup(rendered.join(''), transform, opacity)
}

function findFillStyle(items: unknown[], frame: number): string {
  for (const itemValue of items) {
    const item = asRecord(itemValue)
    if (item === null || item['ty'] !== 'fl') continue
    const color = colorFromValue(resolveAnimatedValue(asRecord(item['c']), frame), '#000000')
    const opacity = clamp01(numberFrom(resolveAnimatedValue(asRecord(item['o']), frame), 100) / 100)
    return ` fill="${color}"${opacity < 1 ? ` fill-opacity="${formatNumber(opacity)}"` : ''}`
  }
  return ' fill="none"'
}

function findStrokeStyle(items: unknown[], frame: number): string {
  for (const itemValue of items) {
    const item = asRecord(itemValue)
    if (item === null || item['ty'] !== 'st') continue
    const color = colorFromValue(resolveAnimatedValue(asRecord(item['c']), frame), '#000000')
    const opacity = clamp01(numberFrom(resolveAnimatedValue(asRecord(item['o']), frame), 100) / 100)
    const width = Math.max(0, numberFrom(resolveAnimatedValue(asRecord(item['w']), frame), 1))
    if (width <= 0) return ' stroke="none"'
    return ` stroke="${color}" stroke-width="${formatNumber(width)}"${opacity < 1 ? ` stroke-opacity="${formatNumber(opacity)}"` : ''}`
  }
  return ''
}

function findTransform(items: unknown[], frame: number): string {
  for (const itemValue of items) {
    const item = asRecord(itemValue)
    if (item?.['ty'] === 'tr') return transformFromKs(item, frame)
  }
  return ''
}

function findTransformOpacity(items: unknown[], frame: number): number {
  for (const itemValue of items) {
    const item = asRecord(itemValue)
    if (item?.['ty'] === 'tr') return opacityFromKs(item, frame)
  }
  return 1
}

function transformFromKs(ks: Record<string, unknown> | null, frame: number): string {
  if (ks === null) return ''
  const position = pointFromValue(resolveAnimatedValue(asRecord(ks['p']), frame), { x: 0, y: 0 }) ?? { x: 0, y: 0 }
  const anchor = pointFromValue(resolveAnimatedValue(asRecord(ks['a']), frame), { x: 0, y: 0 }) ?? { x: 0, y: 0 }
  const scale = pointFromValue(resolveAnimatedValue(asRecord(ks['s']), frame), { x: 100, y: 100 }) ?? { x: 100, y: 100 }
  const rotation = numberFrom(resolveAnimatedValue(asRecord(ks['r']), frame), numberFrom(resolveAnimatedValue(asRecord(ks['rz']), frame), 0))
  const transforms: string[] = []
  if (position.x !== 0 || position.y !== 0) transforms.push(`translate(${formatNumber(position.x)} ${formatNumber(position.y)})`)
  if (rotation !== 0) transforms.push(`rotate(${formatNumber(rotation)})`)
  if (scale.x !== 100 || scale.y !== 100) transforms.push(`scale(${formatNumber(scale.x / 100)} ${formatNumber(scale.y / 100)})`)
  if (anchor.x !== 0 || anchor.y !== 0) transforms.push(`translate(${formatNumber(-anchor.x)} ${formatNumber(-anchor.y)})`)
  return transforms.join(' ')
}

function opacityFromKs(ks: Record<string, unknown> | null, frame: number): number {
  if (ks === null) return 1
  return clamp01(numberFrom(resolveAnimatedValue(asRecord(ks['o']), frame), 100) / 100)
}

function pathDataFromShape(shapeValue: unknown): string {
  const shape = asRecord(shapeValue)
  if (shape === null) return ''
  const vertices = arrayFrom(shape['v']).map(value => pointFromValue(value, null)).filter((point): point is LottiePoint => point !== null)
  const ins = arrayFrom(shape['i']).map(value => pointFromValue(value, { x: 0, y: 0 }))
  const outs = arrayFrom(shape['o']).map(value => pointFromValue(value, { x: 0, y: 0 }))
  if (vertices.length === 0) return ''

  const segments: string[] = [`M${formatNumber(vertices[0]!.x)} ${formatNumber(vertices[0]!.y)}`]
  const closed = shape['c'] === true
  const count = closed ? vertices.length : vertices.length - 1
  for (let index = 0; index < count; index += 1) {
    const current = vertices[index]!
    const nextIndex = (index + 1) % vertices.length
    const next = vertices[nextIndex]!
    const out = outs[index] ?? { x: 0, y: 0 }
    const inn = ins[nextIndex] ?? { x: 0, y: 0 }
    const c1 = { x: current.x + out.x, y: current.y + out.y }
    const c2 = { x: next.x + inn.x, y: next.y + inn.y }
    segments.push(`C${formatNumber(c1.x)} ${formatNumber(c1.y)} ${formatNumber(c2.x)} ${formatNumber(c2.y)} ${formatNumber(next.x)} ${formatNumber(next.y)}`)
  }
  if (closed) segments.push('Z')
  return segments.join(' ')
}

function ellipseFromItem(item: Record<string, unknown>, frame: number, paint: string): string {
  const size = pointFromValue(resolveAnimatedValue(asRecord(item['s']), frame), null)
  const position = pointFromValue(resolveAnimatedValue(asRecord(item['p']), frame), { x: 0, y: 0 }) ?? { x: 0, y: 0 }
  if (size === null) return ''
  return `<ellipse cx="${formatNumber(position.x)}" cy="${formatNumber(position.y)}" rx="${formatNumber(Math.abs(size.x) / 2)}" ry="${formatNumber(Math.abs(size.y) / 2)}"${paint}/>`
}

function rectFromItem(item: Record<string, unknown>, frame: number, paint: string): string {
  const size = pointFromValue(resolveAnimatedValue(asRecord(item['s']), frame), null)
  const position = pointFromValue(resolveAnimatedValue(asRecord(item['p']), frame), { x: 0, y: 0 }) ?? { x: 0, y: 0 }
  if (size === null) return ''
  const radius = Math.max(0, numberFrom(resolveAnimatedValue(asRecord(item['r']), frame), 0))
  const x = position.x - size.x / 2
  const y = position.y - size.y / 2
  return `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(Math.abs(size.x))}" height="${formatNumber(Math.abs(size.y))}"${radius > 0 ? ` rx="${formatNumber(radius)}" ry="${formatNumber(radius)}"` : ''}${paint}/>`
}

function resolveAnimatedValue(prop: Record<string, unknown> | null, frame: number): unknown {
  if (prop === null) return undefined
  const k = prop['k']
  if (Array.isArray(k) && k.length > 0 && isRecord(k[0]) && 's' in k[0]) {
    let selected = k[0] as Record<string, unknown>
    for (const keyframeValue of k) {
      const keyframe = asRecord(keyframeValue)
      if (keyframe === null) continue
      if (numberFrom(keyframe['t'], -Infinity) <= frame) selected = keyframe
    }
    const startValue = selected['s']
    return Array.isArray(startValue) && startValue.length === 1 ? startValue[0] : startValue
  }
  return k
}

function getSvgDimensions(svg: string): { width: number; height: number } {
  const width = parseSvgLength(svg.match(/\bwidth=["']([^"']+)["']/i)?.[1])
  const height = parseSvgLength(svg.match(/\bheight=["']([^"']+)["']/i)?.[1])
  if (width > 0 && height > 0) return { width, height }
  const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1]?.trim().split(/\s+|,/).map(Number)
  if (viewBox !== undefined && viewBox.length >= 4 && Number.isFinite(viewBox[2]) && Number.isFinite(viewBox[3])) {
    return { width: Math.max(1, Math.round(viewBox[2]!)), height: Math.max(1, Math.round(viewBox[3]!)) }
  }
  return { width: DEFAULT_VECTOR_SIZE, height: DEFAULT_VECTOR_SIZE }
}

function parseSvgLength(raw: string | undefined): number {
  if (raw === undefined) return 0
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function ensureSvgNamespace(svg: string, fallbackName: string): string {
  const trimmed = svg.trim()
  if (!/^<svg[\s>]/i.test(trimmed)) return trimmed
  const namespaced = /\sxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(trimmed)
    ? trimmed
    : trimmed.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (/\brole=["']img["']/i.test(namespaced)) return namespaced
  const title = escapeXml(fallbackName.replace(/\.json$/i, ''))
  return namespaced.replace(/^<svg\b/i, `<svg role="img" aria-label="${title}"`)
}

function extractSvgFromString(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.startsWith('data:image/svg+xml')) return decodeSvgDataUrl(trimmed)
  const fullMatch = trimmed.match(/<svg[\s\S]*<\/svg>/i)
  if (fullMatch !== null) return fullMatch[0]
  return /^<svg[\s>]/i.test(trimmed) ? trimmed : null
}

function decodeSvgDataUrl(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) return null
  const metadata = dataUrl.slice(0, commaIndex).toLowerCase()
  const payload = dataUrl.slice(commaIndex + 1)
  try {
    if (metadata.includes(';base64')) return atob(payload)
    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

function colorFromValue(value: unknown, fallback: string): string {
  if (!Array.isArray(value) || value.length < 3) return fallback
  const channels = value.slice(0, 3).map(channel => numberFrom(channel, 0))
  const scale = channels.some(channel => channel > 1) ? 1 : 255
  const [r, g, b] = channels.map(channel => Math.max(0, Math.min(255, Math.round(channel * scale))))
  return `#${toHex(r!)}${toHex(g!)}${toHex(b!)}`
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function pointFromValue(value: unknown, fallback: LottiePoint | null): LottiePoint | null {
  if (Array.isArray(value) && value.length >= 2) {
    return {
      x: numberFrom(value[0], fallback?.x ?? 0),
      y: numberFrom(value[1], fallback?.y ?? 0),
    }
  }
  if (isRecord(value)) {
    return {
      x: numberFrom(value['x'], fallback?.x ?? 0),
      y: numberFrom(value['y'], fallback?.y ?? 0),
    }
  }
  return fallback
}

function wrapSvgGroup(content: string, transform: string, opacity: number): string {
  if (content.length === 0) return ''
  if (transform.length === 0 && opacity >= 1) return content
  const attrs = `${transform.length > 0 ? ` transform="${transform}"` : ''}${opacity < 1 ? ` opacity="${formatNumber(opacity)}"` : ''}`
  return `<g${attrs}>${content}</g>`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.parseFloat(value.toFixed(3)).toString()
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
