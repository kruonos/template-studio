export type BrowserDownloadHost = {
  document: Pick<Document, 'createElement'>
  url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
}

function getDefaultHost(): BrowserDownloadHost {
  return {
    document,
    url: URL,
  }
}

export function downloadBlob(blob: Blob, filename: string, host: BrowserDownloadHost = getDefaultHost()): void {
  const url = host.url.createObjectURL(blob)
  try {
    const anchor = host.document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    host.url.revokeObjectURL(url)
  }
}

export function downloadText(filename: string, content: string, mime: string, host?: BrowserDownloadHost): void {
  downloadBlob(new Blob([content], { type: mime }), filename, host)
}
