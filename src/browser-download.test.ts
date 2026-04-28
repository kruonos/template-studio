import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { downloadBlob, downloadText, type BrowserDownloadHost } from './browser-download.ts'

function createHost() {
  const clicks: string[] = []
  const anchors: Array<{ href: string; download: string }> = []
  const revokedUrls: string[] = []

  const host: BrowserDownloadHost = {
    document: {
      createElement(tagName: string) {
        expect(tagName).toBe('a')
        const anchor = {
          href: '',
          download: '',
          click() {
            clicks.push(`${anchor.download}:${anchor.href}`)
            anchors.push({ href: anchor.href, download: anchor.download })
          },
        }
        return anchor as HTMLAnchorElement
      },
    },
    url: {
      createObjectURL() {
        return 'blob:test-url'
      },
      revokeObjectURL(url: string) {
        revokedUrls.push(url)
      },
    },
  }

  return { anchors, clicks, host, revokedUrls }
}

describe('browser download helpers', () => {
  test('downloads a blob through a temporary anchor and always revokes the URL', () => {
    const { anchors, clicks, host, revokedUrls } = createHost()

    downloadBlob(new Blob(['hello'], { type: 'text/plain' }), 'example.txt', host)

    expect(anchors).toEqual([{ href: 'blob:test-url', download: 'example.txt' }])
    expect(clicks).toEqual(['example.txt:blob:test-url'])
    expect(revokedUrls).toEqual(['blob:test-url'])
  })

  test('wraps text content in a typed blob before downloading', () => {
    const { anchors, host, revokedUrls } = createHost()

    downloadText('example.html', '<p>Hello</p>', 'text/html', host)

    expect(anchors[0]?.download).toBe('example.html')
    expect(revokedUrls).toEqual(['blob:test-url'])
  })
})
