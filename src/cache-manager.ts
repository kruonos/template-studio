import type { PreparedText, PreparedTextWithSegments } from '@chenglou/pretext'
import type { ElementId, TextProjection } from './schema.ts'

export type CacheInvalidationReason =
  | 'document'
  | 'fonts'
  | 'variables'
  | 'wrap-mode'
  | 'surface-theme'
  | 'paper-size'
  | 'obstacles'
  | 'element-content'
  | 'element-layout'

export type CacheDependency = string

type CacheCategory = 'prepared-fast' | 'prepared-rich' | 'projection'

type CacheEntryRecord<T> = {
  key: string
  value: T
  category: CacheCategory
  deps: Set<CacheDependency>
  sizeBytes: number
  accessCount: number
  hitCount: number
  missCount: number
  lastAccessTick: number
}

type CacheRegisterOptions<T> = {
  category: CacheCategory
  estimateSize: (value: T, key: string) => number
  equals?: (left: T, right: T) => boolean
  verifyConsistency?: boolean
}

type CacheStoreOptions<T> = Omit<CacheRegisterOptions<T>, 'verifyConsistency'>

type CacheComputationContext = {
  key: string
  deps: Set<CacheDependency>
}

type CacheInvalidationTrace = {
  dependency: CacheDependency
  keys: string[]
}

export type CacheMetrics = {
  hits: number
  misses: number
  entries: number
  projectionBytes: number
}

export type PreparedCacheBucket<T> = {
  register: (key: string, deps: CacheDependency[], compute: () => T) => T
  clear: () => void
  readonly size: number
}

export type PreparedCacheEntry = {
  fast: PreparedCacheBucket<PreparedText>
  rich: PreparedCacheBucket<PreparedTextWithSegments>
}

type CacheManagerOptions = {
  enableMetrics?: boolean
  assertConsistency?: boolean
  maxProjectionBytes?: number
}

const PROJECTION_PREFIX = 'projection:'
const PREPARED_FAST_PREFIX = 'prepared-fast:'
const PREPARED_RICH_PREFIX = 'prepared-rich:'
const DEFAULT_MAX_PROJECTION_BYTES = 50 * 1024 * 1024
const RECENT_INVALIDATION_LIMIT = 16

function queryFlag(name: string): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).has(name)
}

export function createReasonDependency(reason: CacheInvalidationReason): CacheDependency {
  return `reason:${reason}`
}

export function createElementDependency(elementId: string | ElementId): CacheDependency {
  return `element:${elementId}`
}

function createEntryDependency(key: string): CacheDependency {
  return `entry:${key}`
}

function createProjectionKey(elementId: string | ElementId): string {
  return `${PROJECTION_PREFIX}${elementId}`
}

function estimatePreparedFastSize(_value: PreparedText, key: string): number {
  return 256 + key.length * 2
}

function estimatePreparedRichSize(value: PreparedTextWithSegments, key: string): number {
  const segmentBytes = value.segments.reduce((total, segment) => total + segment.length * 2, 0)
  return 384 + key.length * 2 + segmentBytes
}

function estimateTextProjectionSize(value: TextProjection, key: string): number {
  let bytes = 256 + key.length * 2 + value.font.length * 2 + value.color.length * 2 + value.textDecoration.length * 2
  for (const line of value.lines) bytes += 64 + line.text.length * 2
  return bytes
}

function projectionsEqual(left: TextProjection, right: TextProjection): boolean {
  if (
    left.font !== right.font ||
    left.lineHeight !== right.lineHeight ||
    left.color !== right.color ||
    left.textDecoration !== right.textDecoration ||
    left.truncated !== right.truncated ||
    left.lines.length !== right.lines.length
  ) return false
  for (let index = 0; index < left.lines.length; index += 1) {
    const leftLine = left.lines[index]
    const rightLine = right.lines[index]
    if (leftLine === undefined || rightLine === undefined) return false
    if (
      leftLine.x !== rightLine.x ||
      leftLine.y !== rightLine.y ||
      leftLine.text !== rightLine.text ||
      leftLine.width !== rightLine.width ||
      leftLine.slotWidth !== rightLine.slotWidth
    ) return false
  }
  return true
}

export function createCacheManager(options: CacheManagerOptions = {}) {
  const metricsEnabled = options.enableMetrics ?? queryFlag('cacheDebug')
  const assertConsistency = options.assertConsistency ?? queryFlag('cacheAssert')
  const maxProjectionBytes = options.maxProjectionBytes ?? DEFAULT_MAX_PROJECTION_BYTES

  const entries = new Map<string, CacheEntryRecord<unknown>>()
  const depIndex = new Map<CacheDependency, Set<string>>()
  const categoryIndex = new Map<CacheCategory, Set<string>>([
    ['prepared-fast', new Set<string>()],
    ['prepared-rich', new Set<string>()],
    ['projection', new Set<string>()],
  ])
  const recentInvalidations: CacheInvalidationTrace[] = []
  const computationStack: CacheComputationContext[] = []

  let accessTick = 0
  let hitCount = 0
  let missCount = 0
  let projectionBytes = 0

  function recordInvalidation(dependency: CacheDependency, keys: string[]): void {
    recentInvalidations.unshift({ dependency, keys })
    if (recentInvalidations.length > RECENT_INVALIDATION_LIMIT) recentInvalidations.length = RECENT_INVALIDATION_LIMIT
  }

  function touchEntry(entry: CacheEntryRecord<unknown>, hit: boolean): void {
    accessTick += 1
    entry.lastAccessTick = accessTick
    entry.accessCount += 1
    if (metricsEnabled) {
      if (hit) {
        hitCount += 1
        entry.hitCount += 1
      } else {
        missCount += 1
        entry.missCount += 1
      }
    }
  }

  function addDependencyIndex(dependency: CacheDependency, key: string): void {
    const keys = depIndex.get(dependency)
    if (keys !== undefined) {
      keys.add(key)
      return
    }
    depIndex.set(dependency, new Set([key]))
  }

  function removeDependencyIndex(dependency: CacheDependency, key: string): void {
    const keys = depIndex.get(dependency)
    if (keys === undefined) return
    keys.delete(key)
    if (keys.size === 0) depIndex.delete(dependency)
  }

  function linkParentDependency(key: string): void {
    const parent = computationStack[computationStack.length - 1]
    if (parent !== undefined && parent.key !== key) parent.deps.add(createEntryDependency(key))
  }

  function mergeDependencies(entry: CacheEntryRecord<unknown>, deps: Iterable<CacheDependency>): void {
    for (const dependency of deps) {
      if (entry.deps.has(dependency)) continue
      entry.deps.add(dependency)
      addDependencyIndex(dependency, entry.key)
    }
  }

  function removeEntry(key: string): CacheEntryRecord<unknown> | undefined {
    const entry = entries.get(key)
    if (entry === undefined) return undefined
    entries.delete(key)
    for (const dependency of entry.deps) removeDependencyIndex(dependency, key)
    categoryIndex.get(entry.category)?.delete(key)
    if (entry.category === 'projection') projectionBytes = Math.max(0, projectionBytes - entry.sizeBytes)
    return entry
  }

  function storeEntry<T>(
    key: string,
    value: T,
    deps: Iterable<CacheDependency>,
    options: CacheStoreOptions<T>,
  ): T {
    removeEntry(key)
    const record: CacheEntryRecord<T> = {
      key,
      value,
      category: options.category,
      deps: new Set(deps),
      sizeBytes: options.estimateSize(value, key),
      accessCount: 0,
      hitCount: 0,
      missCount: 0,
      lastAccessTick: 0,
    }
    entries.set(key, record)
    categoryIndex.get(options.category)?.add(key)
    for (const dependency of record.deps) addDependencyIndex(dependency, key)
    if (record.category === 'projection') projectionBytes += record.sizeBytes
    touchEntry(record, false)
    linkParentDependency(key)
    return value
  }

  function cascadeInvalidation(initialDependencies: CacheDependency[]): string[] {
    const queue = [...initialDependencies]
    const seenDependencies = new Set<CacheDependency>()
    const removedKeys: string[] = []
    while (queue.length > 0) {
      const dependency = queue.shift()
      if (dependency === undefined || seenDependencies.has(dependency)) continue
      seenDependencies.add(dependency)
      const dependentKeys = depIndex.get(dependency)
      if (dependentKeys === undefined || dependentKeys.size === 0) continue
      for (const key of [...dependentKeys]) {
        const removed = removeEntry(key)
        if (removed === undefined) continue
        removedKeys.push(key)
        queue.push(createEntryDependency(key))
      }
    }
    return removedKeys
  }

  function invalidateCategory(category: CacheCategory): string[] {
    const keys = categoryIndex.get(category)
    if (keys === undefined || keys.size === 0) return []
    const removedKeys: string[] = []
    const queue: CacheDependency[] = []
    for (const key of [...keys]) {
      const removed = removeEntry(key)
      if (removed === undefined) continue
      removedKeys.push(key)
      queue.push(createEntryDependency(key))
    }
    removedKeys.push(...cascadeInvalidation(queue))
    return removedKeys
  }

  function evictLRU(maxBytes: number): void {
    if (projectionBytes <= maxBytes) return
    const projectionKeys = [...(categoryIndex.get('projection') ?? [])]
      .map(key => entries.get(key))
      .filter((entry): entry is CacheEntryRecord<unknown> => entry !== undefined)
      .sort((left, right) => left.lastAccessTick - right.lastAccessTick)
    const removedKeys: string[] = []
    for (const entry of projectionKeys) {
      if (projectionBytes <= maxBytes) break
      const removed = removeEntry(entry.key)
      if (removed === undefined) continue
      removedKeys.push(entry.key)
    }
    if (removedKeys.length > 0) recordInvalidation('evict:lru:projection', removedKeys)
  }

  function register<T>(
    key: string,
    compute: () => T,
    deps: CacheDependency[],
    options: CacheRegisterOptions<T>,
  ): T {
    const cached = entries.get(key) as CacheEntryRecord<T> | undefined
    if (cached !== undefined) {
      mergeDependencies(cached, deps)
      if ((options.verifyConsistency ?? assertConsistency) && options.equals !== undefined) {
        const recomputed = compute()
        if (!options.equals(cached.value, recomputed)) {
          throw new Error(`Cache consistency assertion failed for ${key}`)
        }
      }
      touchEntry(cached, true)
      linkParentDependency(key)
      return cached.value
    }

    const context: CacheComputationContext = {
      key,
      deps: new Set(deps),
    }
    const parent = computationStack[computationStack.length - 1]
    computationStack.push(context)
    try {
      const value = compute()
      return storeEntry(key, value, context.deps, options)
    } finally {
      computationStack.pop()
      if (parent !== undefined && parent.key !== key) parent.deps.add(createEntryDependency(key))
    }
  }

  function get<T>(key: string): T | undefined {
    const cached = entries.get(key) as CacheEntryRecord<T> | undefined
    if (cached === undefined) return undefined
    touchEntry(cached, true)
    linkParentDependency(key)
    return cached.value
  }

  function debug(key?: string): string {
    if (key === undefined) {
      return [
        `entries=${entries.size}`,
        `prepared-fast=${categoryIndex.get('prepared-fast')?.size ?? 0}`,
        `prepared-rich=${categoryIndex.get('prepared-rich')?.size ?? 0}`,
        `projection=${categoryIndex.get('projection')?.size ?? 0}`,
        `projection-bytes=${projectionBytes}`,
        `hits=${hitCount}`,
        `misses=${missCount}`,
        `recent-invalidations=${recentInvalidations.length}`,
      ].join('\n')
    }
    const entry = entries.get(key)
    if (entry === undefined) return `missing:${key}`
    const dependents = [...(depIndex.get(createEntryDependency(key)) ?? [])]
    const invalidationTrace = recentInvalidations.filter(trace => trace.keys.includes(key)).map(trace => `${trace.dependency} -> ${trace.keys.join(', ')}`)
    return [
      `key=${entry.key}`,
      `category=${entry.category}`,
      `deps=${[...entry.deps].join(', ')}`,
      `dependents=${dependents.join(', ')}`,
      `size-bytes=${entry.sizeBytes}`,
      `accesses=${entry.accessCount}`,
      `hits=${entry.hitCount}`,
      `misses=${entry.missCount}`,
      `last-access=${entry.lastAccessTick}`,
      `invalidations=${invalidationTrace.join(' | ')}`,
    ].join('\n')
  }

  const preparedFastDeps = [createReasonDependency('document'), createReasonDependency('fonts')]
  const preparedRichDeps = [createReasonDependency('document'), createReasonDependency('fonts')]

  const preparedCache: PreparedCacheEntry = {
    fast: {
      register(key, deps, compute) {
        return register(`${PREPARED_FAST_PREFIX}${key}`, compute, [...preparedFastDeps, ...deps], {
          category: 'prepared-fast',
          estimateSize: estimatePreparedFastSize,
        })
      },
      clear() {
        const removedKeys = invalidateCategory('prepared-fast')
        if (removedKeys.length > 0) recordInvalidation('category:prepared-fast', removedKeys)
      },
      get size() {
        return categoryIndex.get('prepared-fast')?.size ?? 0
      },
    },
    rich: {
      register(key, deps, compute) {
        return register(`${PREPARED_RICH_PREFIX}${key}`, compute, [...preparedRichDeps, ...deps], {
          category: 'prepared-rich',
          estimateSize: estimatePreparedRichSize,
        })
      },
      clear() {
        const removedKeys = invalidateCategory('prepared-rich')
        if (removedKeys.length > 0) recordInvalidation('category:prepared-rich', removedKeys)
      },
      get size() {
        return categoryIndex.get('prepared-rich')?.size ?? 0
      },
    },
  }

  return {
    preparedCache,
    register<T>(key: string, compute: () => T, deps: CacheDependency[], options: CacheRegisterOptions<T>): T {
      return register(key, compute, deps, options)
    },
    get<T>(key: string): T | undefined {
      return get<T>(key)
    },
    invalidate(dep: CacheDependency): void {
      const removedKeys = cascadeInvalidation([dep])
      if (removedKeys.length > 0) recordInvalidation(dep, removedKeys)
    },
    evictLRU(maxSize: number): void {
      evictLRU(maxSize)
    },
    debug(key?: string): string {
      return debug(key)
    },
    getTextProjection(elementId: string | ElementId): TextProjection | undefined {
      return get<TextProjection>(createProjectionKey(elementId))
    },
    registerTextProjection(elementId: string | ElementId, compute: () => TextProjection): TextProjection {
      const projection = register(createProjectionKey(elementId), compute, [
        createReasonDependency('document'),
        createReasonDependency('fonts'),
        createReasonDependency('variables'),
        createReasonDependency('wrap-mode'),
        createReasonDependency('surface-theme'),
        createReasonDependency('paper-size'),
        createReasonDependency('obstacles'),
        createElementDependency(elementId),
      ], {
        category: 'projection',
        estimateSize: estimateTextProjectionSize,
        equals: projectionsEqual,
      })
      evictLRU(maxProjectionBytes)
      return projection
    },
    setTextProjection(elementId: string | ElementId, projection: TextProjection): void {
      storeEntry(createProjectionKey(elementId), projection, [
        createReasonDependency('document'),
        createReasonDependency('fonts'),
        createReasonDependency('variables'),
        createReasonDependency('wrap-mode'),
        createReasonDependency('surface-theme'),
        createReasonDependency('paper-size'),
        createReasonDependency('obstacles'),
        createElementDependency(elementId),
      ], {
        category: 'projection',
        estimateSize: estimateTextProjectionSize,
        equals: projectionsEqual,
      })
      evictLRU(maxProjectionBytes)
    },
    invalidateAll(reason: CacheInvalidationReason): void {
      const dependency = createReasonDependency(reason)
      const removedKeys = cascadeInvalidation([dependency])
      if (removedKeys.length > 0) recordInvalidation(dependency, removedKeys)
    },
    invalidateElement(elementId: string | ElementId, _reason: Extract<CacheInvalidationReason, 'element-content' | 'element-layout'>): void {
      const dependency = createElementDependency(elementId)
      const removedKeys = cascadeInvalidation([dependency])
      if (removedKeys.length > 0) recordInvalidation(dependency, removedKeys)
    },
    clearPrepared(reason: CacheInvalidationReason): void {
      if (reason !== 'document' && reason !== 'fonts') return
      const removedKeys = [
        ...invalidateCategory('prepared-fast'),
        ...invalidateCategory('prepared-rich'),
      ]
      if (removedKeys.length > 0) recordInvalidation(`prepared:${reason}`, removedKeys)
    },
    getMetrics(): CacheMetrics {
      return {
        hits: hitCount,
        misses: missCount,
        entries: entries.size,
        projectionBytes,
      }
    },
    getDebugState() {
      return {
        preparedFastEntries: categoryIndex.get('prepared-fast')?.size ?? 0,
        preparedRichEntries: categoryIndex.get('prepared-rich')?.size ?? 0,
        projectionEntries: categoryIndex.get('projection')?.size ?? 0,
        projectionBytes,
        entries: entries.size,
        hits: hitCount,
        misses: missCount,
        recentInvalidations: recentInvalidations.slice(),
      }
    },
  }
}
