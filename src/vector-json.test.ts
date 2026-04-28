import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { convertVectorJsonToSvg, extractSvgFromJsonValue, svgTextToDataUrl } from './vector-json.ts'

describe('vector JSON import', () => {
  test('extracts SVG markup nested inside JSON', () => {
    const svg = '<svg width="24" height="12"><rect width="24" height="12"/></svg>'
    const result = convertVectorJsonToSvg(JSON.stringify({ asset: { svg } }), 'badge.json')

    expect(result.sourceKind).toBe('svg-json')
    expect(result.width).toBe(24)
    expect(result.height).toBe(12)
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  test('converts common Lottie shape layers into an SVG poster frame', () => {
    const lottie = {
      w: 120,
      h: 80,
      ip: 0,
      op: 60,
      layers: [{
        ty: 4,
        ip: 0,
        op: 60,
        ks: {
          p: { k: [60, 40, 0] },
          a: { k: [0, 0, 0] },
          s: { k: [100, 100, 100] },
          r: { k: 0 },
          o: { k: 100 },
        },
        shapes: [{
          ty: 'gr',
          it: [
            {
              ty: 'sh',
              ks: {
                k: {
                  c: true,
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                  v: [[0, 0], [40, 0], [20, 30]],
                },
              },
            },
            { ty: 'fl', c: { k: [0, 0.8, 0.3, 1] }, o: { k: 100 } },
            {
              ty: 'tr',
              p: { k: [0, 0] },
              a: { k: [0, 0] },
              s: { k: [100, 100] },
              r: { k: 0 },
              o: { k: 100 },
            },
          ],
        }],
      }],
    }

    const result = convertVectorJsonToSvg(JSON.stringify(lottie), 'eye.json')

    expect(result.sourceKind).toBe('lottie-json')
    expect(result.width).toBe(120)
    expect(result.height).toBe(80)
    expect(result.svg).toContain('viewBox="0 0 120 80"')
    expect(result.svg).toContain('<path')
    expect(result.svg).toContain('fill="#00cc4d"')
  })

  test('finds SVG data URLs in JSON values', () => {
    const dataUrl = svgTextToDataUrl('<svg viewBox="0 0 1 1"></svg>')
    expect(extractSvgFromJsonValue({ source: dataUrl })).toContain('<svg')
  })
})
