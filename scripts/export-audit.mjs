#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const textDecoder = new TextDecoder()

const outDir = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'pretext-export-audit'))
const appUrl = process.argv[3] ?? 'http://127.0.0.1:3000/?preset=investor-update'

const EXPECTED_TEXT = {
  appendix: 'Appendix: leading indicators',
  tablePrimary: 'Export completion rate',
  tableSecondary: 'Weekly active templates',
  routed: 'The public launch should lead with proof',
}

async function main() {
  const { chromium } = loadPlaywright()
  await fs.mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const failures = []

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    page.on('console', message => {
      if (message.type() === 'warning' || message.type() === 'error') {
        console.log(`[browser:${message.type()}] ${message.text()}`)
      }
    })

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page.locator('#canvas').waitFor({ state: 'visible' })
    await page.locator('#canvas').screenshot({ path: path.join(outDir, 'editor-canvas.png') })
    await page.locator('#canvas-shell').screenshot({ path: path.join(outDir, 'editor-visible.png') })

    const exported = {
      html: path.join(outDir, 'investor-update.html'),
      pdf: path.join(outDir, 'investor-update.pdf'),
      docx: path.join(outDir, 'investor-update.docx'),
      odt: path.join(outDir, 'investor-update.odt'),
      emailLegacy: path.join(outDir, 'investor-update-email-legacy.html'),
      emailMjml: path.join(outDir, 'investor-update-email-mjml.html'),
    }

    const suggestions = {}
    suggestions.html = await exportDownload(page, 'html', exported.html)
    suggestions.pdf = await exportDownload(page, 'pdf', exported.pdf)
    suggestions.docx = await exportDownload(page, 'docx', exported.docx)
    suggestions.odt = await exportDownload(page, 'odt', exported.odt)

    await page.locator('[data-template-prop="emailFormat"]').selectOption('legacy')
    suggestions.emailLegacy = await exportDownload(page, 'email-html', exported.emailLegacy)
    await page.locator('[data-template-prop="emailFormat"]').selectOption('mjml')
    suggestions.emailMjml = await exportDownload(page, 'email-html', exported.emailMjml)

    const checks = {
      htmlDesktop: await screenshotHtml(context, exported.html, 'html-desktop', { width: 900, height: 1100 }),
      emailLegacyDesktop: await screenshotHtml(context, exported.emailLegacy, 'email-legacy-desktop', { width: 820, height: 1100 }),
      emailLegacyMobile: await screenshotHtml(context, exported.emailLegacy, 'email-legacy-mobile', { width: 390, height: 900 }),
      emailMjmlDesktop: await screenshotHtml(context, exported.emailMjml, 'email-mjml-desktop', { width: 820, height: 1100 }),
      emailMjmlMobile: await screenshotHtml(context, exported.emailMjml, 'email-mjml-mobile', { width: 390, height: 900 }),
    }

    await collectVisualFailures(checks, failures)
    await validateFileSize(exported.html, 10_000, failures)
    await validateFileSize(exported.pdf, 20_000, failures)
    await validateFileSize(exported.docx, 20_000, failures)
    await validateFileSize(exported.odt, 20_000, failures)
    await validatePdf(exported.pdf, failures)
    const pdfScreenshots = await renderPdfScreenshots(exported.pdf, failures)
    await validateDocx(exported.docx, failures)
    await validateOdt(exported.odt, failures)

    const summary = {
      ok: failures.length === 0,
      appUrl,
      outDir,
      suggestions,
      exported,
      pdfScreenshots,
      checks,
      failures,
    }
    await fs.writeFile(path.join(outDir, 'audit-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary, null, 2))

    if (failures.length > 0) {
      process.exitCode = 1
      console.error(`Export audit failed with ${failures.length} issue(s). See ${path.join(outDir, 'audit-summary.json')}`)
    }
  } finally {
    await browser.close()
  }
}

function loadPlaywright() {
  try {
    return require('playwright')
  } catch {
    console.error('Playwright is required for the export audit. Install it with `bun add -d playwright` or run with NODE_PATH pointing at an existing Playwright install.')
    process.exit(1)
  }
}

async function exportDownload(page, format, targetPath) {
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await page.locator('#btn-export-menu').click()
  await page.locator(`[data-export-format="${format}"]`).click()
  const download = await downloadPromise
  await download.saveAs(targetPath)
  return download.suggestedFilename()
}

async function screenshotHtml(context, filePath, name, viewport) {
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  await page.setViewportSize(viewport)
  await page.goto(pathToFileURL(filePath).href, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true })
  const checks = await page.evaluate(expected => {
    const text = document.body.innerText
    const images = [...document.images].map(image => ({
      src: image.currentSrc || image.src,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: Math.round(image.getBoundingClientRect().width),
      renderedHeight: Math.round(image.getBoundingClientRect().height),
    }))
    return {
      hasAppendix: text.includes(expected.appendix),
      hasTableText: text.includes(expected.tablePrimary) && text.includes(expected.tableSecondary),
      hasRoutedText: text.includes(expected.routed),
      imageCount: images.length,
      loadedImageCount: images.filter(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length,
      images,
      bodyWidth: Math.round(document.body.scrollWidth),
      viewportWidth: window.innerWidth,
    }
  }, EXPECTED_TEXT)
  await page.close()
  return checks
}

async function collectVisualFailures(checks, failures) {
  for (const [label, check] of Object.entries(checks)) {
    if (!check.hasAppendix) failures.push(`${label}: missing appendix heading`)
    if (!check.hasTableText) failures.push(`${label}: missing table text`)
    if (!check.hasRoutedText) failures.push(`${label}: missing routed body text`)
    if (check.imageCount < 1) failures.push(`${label}: expected at least one image`)
    if (check.loadedImageCount !== check.imageCount) failures.push(`${label}: ${check.loadedImageCount}/${check.imageCount} images loaded`)
  }
}

async function validateFileSize(filePath, minimumBytes, failures) {
  const stats = await fs.stat(filePath).catch(() => null)
  if (stats === null) {
    failures.push(`${path.basename(filePath)}: file was not written`)
    return
  }
  if (stats.size < minimumBytes) failures.push(`${path.basename(filePath)}: unexpectedly small (${stats.size} bytes)`)
}

async function validatePdf(filePath, failures) {
  const bytes = await fs.readFile(filePath)
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) failures.push('PDF: missing PDF header')
}

async function renderPdfScreenshots(filePath, failures) {
  const outputPrefix = path.join(outDir, 'pdf-page')
  return new Promise(resolve => {
    const child = spawn('pdftoppm', ['-png', '-f', '1', '-l', '2', '-r', '120', filePath, outputPrefix], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      if (error.code === 'ENOENT') {
        resolve({ ok: false, skipped: true, reason: 'pdftoppm not found', files: [] })
        return
      }
      failures.push(`PDF screenshots: ${error.message}`)
      resolve({ ok: false, skipped: false, reason: error.message, files: [] })
    })

    child.on('close', async code => {
      if (code !== 0) {
        const reason = stderr.trim() || `pdftoppm exited with ${code}`
        failures.push(`PDF screenshots: ${reason}`)
        resolve({ ok: false, skipped: false, reason, files: [] })
        return
      }

      const files = (await fs.readdir(outDir))
        .filter(name => /^pdf-page-\d+\.png$/.test(name))
        .sort()
        .map(name => path.join(outDir, name))
      resolve({ ok: files.length > 0, skipped: false, files })
    })
  })
}

async function validateDocx(filePath, failures) {
  const entries = await readStoredZipEntries(filePath)
  const documentXml = zipText(entries, 'word/document.xml', failures)
  zipText(entries, 'word/_rels/document.xml.rels', failures)
  requireZipEntries(entries, ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml'], failures, 'DOCX')
  if (documentXml.length === 0) return

  assertText(documentXml, EXPECTED_TEXT.appendix, failures, 'DOCX document.xml')
  assertText(documentXml, EXPECTED_TEXT.tablePrimary, failures, 'DOCX document.xml')
  assertText(documentXml, EXPECTED_TEXT.routed, failures, 'DOCX document.xml')

  const mediaEntries = [...entries.keys()].filter(name => name.startsWith('word/media/'))
  if (mediaEntries.length < 1) failures.push('DOCX: expected embedded media entries')
  if (!documentXml.includes('<w:txbxContent>')) failures.push('DOCX: expected editable textbox content')
  if (documentXml.includes('full-page') || documentXml.includes('page-screenshot')) failures.push('DOCX: found full-page screenshot marker')
}

async function validateOdt(filePath, failures) {
  const bytes = await fs.readFile(filePath)
  const mimetypePrefix = 'PK\x03\x04'
  if (bytes.subarray(0, 4).toString('binary') !== mimetypePrefix) failures.push('ODT: missing ZIP local header')

  const entries = await readStoredZipEntries(filePath)
  const contentXml = zipText(entries, 'content.xml', failures)
  const manifestXml = zipText(entries, 'META-INF/manifest.xml', failures)
  requireZipEntries(entries, ['mimetype', 'styles.xml', 'meta.xml'], failures, 'ODT')
  if (contentXml.length === 0) return

  assertText(contentXml, EXPECTED_TEXT.appendix, failures, 'ODT content.xml')
  assertText(contentXml, EXPECTED_TEXT.tablePrimary, failures, 'ODT content.xml')
  assertText(contentXml, EXPECTED_TEXT.tableSecondary, failures, 'ODT content.xml')
  assertText(contentXml, EXPECTED_TEXT.routed, failures, 'ODT content.xml')
  if (!contentXml.includes('<table:table')) failures.push('ODT: expected real table:table markup')
  if (!contentXml.includes('<draw:frame')) failures.push('ODT: expected positioned draw frames')

  const pictureEntries = [...entries.keys()].filter(name => name.startsWith('Pictures/'))
  if (pictureEntries.length < 1) failures.push('ODT: expected embedded Pictures entries')
  if (!manifestXml.includes('application/vnd.oasis.opendocument.text')) failures.push('ODT: missing OpenDocument MIME manifest entry')
  for (const picture of pictureEntries) {
    if (!manifestXml.includes(picture)) failures.push(`ODT: manifest missing ${picture}`)
  }
}

async function readStoredZipEntries(filePath) {
  const bytes = await fs.readFile(filePath)
  const entries = new Map()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50) break

    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.length) throw new Error(`${filePath}: invalid ZIP entry length at offset ${offset}`)
    if (method !== 0) throw new Error(`${filePath}: ZIP entry ${offset} is compressed; audit only supports stored entries`)

    const name = textDecoder.decode(bytes.subarray(nameStart, nameEnd))
    entries.set(name, bytes.subarray(dataStart, dataEnd))
    offset = dataEnd
  }

  return entries
}

function zipText(entries, name, failures) {
  const bytes = entries.get(name)
  if (bytes === undefined) {
    failures.push(`ZIP: missing ${name}`)
    return ''
  }
  return textDecoder.decode(bytes)
}

function requireZipEntries(entries, names, failures, label) {
  for (const name of names) {
    if (!entries.has(name)) failures.push(`${label}: missing ${name}`)
  }
}

function assertText(haystack, needle, failures, label) {
  if (!haystack.includes(needle)) failures.push(`${label}: missing "${needle}"`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
