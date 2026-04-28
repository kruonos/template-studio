import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { createElement } from './element-factory.ts'
import { asElementId } from './schema.ts'
import { parseTableData, computeTableHeight } from './table-engine.ts'
import type { ElementType, SurfacePalette } from './schema.ts'

const palette: SurfacePalette = {
  pageBackground: '#fffdf8',
  workbenchBackground: '#ece7df',
  heading: '#1a2b3a',
  body: '#354a5a',
  divider: 'rgba(13, 33, 48, 0.2)',
  buttonBackground: '#17384f',
  buttonText: '#f8fffd',
  exportFrame: '#f2f2ef',
}

const hooks = {
  createId: (_prefix: 'el') => asElementId('el-test-id'),
  paperSize: { id: 'email' as const, width: 720, height: 980, margin: 40 },
  surfacePalette: palette,
  clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
}

describe('element factory', () => {
  test('creates every supported element inside the canvas bounds', () => {
    const types: ElementType[] = ['heading', 'text', 'image', 'button', 'divider', 'spacer', 'html', 'video', 'mascot', 'animated-gif', 'table']

    for (const type of types) {
      const element = createElement(type, 999, 24, hooks)
      expect(element.id).toBe('el-test-id')
      expect(element.x).toBeLessThanOrEqual(hooks.paperSize.width - 36)
      expect(element.y).toBe(24)
      expect(element.width).toBeGreaterThan(0)
      expect(element.height).toBeGreaterThan(0)
    }
  })

  test('table elements carry a serializable table model whose height matches the engine', () => {
    const element = createElement('table', 40, 80, hooks)
    const data = parseTableData(element.content)

    expect(data).not.toBeNull()
    expect(element.height).toBe(computeTableHeight(data!))
  })

  test('heading elements span the printable width by default', () => {
    const element = createElement('heading', 50, 12, hooks)

    expect(element.width).toBe(hooks.paperSize.width - hooks.paperSize.margin * 2)
    expect(element.styles.fontSize).toBe(36)
  })
})
