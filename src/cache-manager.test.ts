import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import type { PreparedText } from '@chenglou/pretext'
import { createCacheManager, createElementDependency } from './cache-manager.ts'
import type { TextProjection } from './schema.ts'
import { asElementId } from './schema.ts'

function createProjection(text: string): TextProjection {
  return {
    lines: [{ x: 0, y: 0, text, width: text.length * 10, slotWidth: 200 }],
    font: '400 16px Test Sans',
    lineHeight: 20,
    color: '#111111',
    textDecoration: 'none',
    truncated: false,
  }
}

describe('cache manager', () => {
  test('invalidates only the targeted element projection', () => {
    const cacheManager = createCacheManager()
    const alpha = createProjection('alpha')
    const beta = createProjection('beta')

    cacheManager.setTextProjection(asElementId('alpha'), alpha)
    cacheManager.setTextProjection(asElementId('beta'), beta)

    cacheManager.invalidateElement(asElementId('alpha'), 'element-content')

    expect(cacheManager.getTextProjection(asElementId('alpha'))).toBeUndefined()
    expect(cacheManager.getTextProjection(asElementId('beta'))).toBe(beta)
  })

  test('global invalidation drops all projection entries', () => {
    const cacheManager = createCacheManager()
    cacheManager.setTextProjection(asElementId('alpha'), createProjection('alpha'))
    cacheManager.setTextProjection(asElementId('beta'), createProjection('beta'))

    cacheManager.invalidateAll('variables')

    expect(cacheManager.getTextProjection(asElementId('alpha'))).toBeUndefined()
    expect(cacheManager.getTextProjection(asElementId('beta'))).toBeUndefined()
  })

  test('font invalidation clears prepared caches too', () => {
    const cacheManager = createCacheManager()

    cacheManager.preparedCache.fast.register('fast', [], () => ({}) as PreparedText)
    cacheManager.preparedCache.rich.register('rich', [], () => ({ segments: ['alpha'] }) as never)

    cacheManager.invalidateAll('fonts')

    expect(cacheManager.preparedCache.fast.size).toBe(0)
    expect(cacheManager.preparedCache.rich.size).toBe(0)
  })

  test('projection entries inherit prepared dependencies transitively', () => {
    const cacheManager = createCacheManager()
    const elementId = asElementId('alpha')

    cacheManager.registerTextProjection(elementId, () => {
      cacheManager.preparedCache.rich.register('shared', [createElementDependency(elementId)], () => ({ segments: ['alpha'] }) as never)
      return createProjection('alpha')
    })

    cacheManager.invalidateAll('fonts')

    expect(cacheManager.getTextProjection(elementId)).toBeUndefined()
  })

  test('evicts least recently used projection entries under memory pressure', () => {
    const cacheManager = createCacheManager({ maxProjectionBytes: 1700 })

    cacheManager.setTextProjection(asElementId('alpha'), createProjection('alpha'.repeat(40)))
    cacheManager.setTextProjection(asElementId('beta'), createProjection('beta'.repeat(40)))
    cacheManager.getTextProjection(asElementId('beta'))
    cacheManager.setTextProjection(asElementId('gamma'), createProjection('gamma'.repeat(40)))

    expect(cacheManager.getTextProjection(asElementId('alpha'))).toBeUndefined()
    expect(cacheManager.getTextProjection(asElementId('beta'))).toBeDefined()
    expect(cacheManager.getTextProjection(asElementId('gamma'))).toBeDefined()
  })
})
