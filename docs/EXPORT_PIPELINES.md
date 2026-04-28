# Export Pipelines Guide

**Detailed reference for all 5 export formats: HTML, Email (MJML), PDF, DOCX, and GIF.**

---

## Overview

Page-builder supports exporting documents to 5 distinct formats, each with different strengths and target use cases:

| Format | Technology | Use Case | Output |
|--------|-----------|----------|--------|
| **HTML** | CSS absolute positioning | Web, print-to-PDF, email | Single `.html` file |
| **Email** | Nested tables + MJML | Email clients (Outlook) | `.html` + test send |
| **PDF** | jsPDF canvas | Print, archive, download | Single `.pdf` file |
| **DOCX** | ZIP + XML structure | Microsoft Word | Single `.docx` file |
| **GIF** | Canvas 2D + omggif encoder | Social media, web animation | Single `.gif` file |

Export-only modules are lazy-loaded. The initial editor shell does not eagerly load PDF, DOCX, GIF, email, MJML, jsPDF, html2canvas, or omggif code. Each heavy exporter enters the browser only when the user chooses the relevant export path.

DOCX prioritizes structured output: text lines become positioned Word text boxes, images are embedded as media relationships, and simple canvas blocks become positioned Word/VML shapes. It should not flatten an entire page into one screenshot.

Email table export uses the projected Pretext line slots rather than the full source text boxes. That matters for obstacle-aware layouts: routed text can sit near an image without causing the image to be treated as an overlapping block and dropped from the email table.

All formats share a **common snapshot architecture**:

```
Document State
    ↓
buildExportSnapshot() [Render all pages/elements]
    ↓
ExportSnapshot {pages[], images[], metadata}
    ↓
Format-specific serializer
    ↓
Blob (downloadable file)
```

---

## Unified Pipeline: buildExportSnapshot()

### Purpose

Capture current document state into a serialization-ready format. This is called **once** at export time; format handlers then process it.

### Function Signature

```typescript
function buildExportSnapshot(doc: Document): ExportSnapshot

interface ExportSnapshot {
  pages: ExportPage[]
  images: Map<string, ImageData | Blob>
  metadata: {
    title: string
    author: string
    createdAt: Date
    keywords?: string
  }
}

interface ExportPage {
  items: ExportItem[]
  width: number
  height: number
  paperSize: string
}

interface ExportItem {
  type: 'text' | 'image' | 'shape' | 'table'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  styles: Styles
  content: TextProjection | ImageData | TableExport
  zIndex: number
}
```

### Implementation

```typescript
function buildExportSnapshot(doc: Document): ExportSnapshot {
  const pages: ExportPage[] = []
  const images = new Map<string, ImageData | Blob>()
  
  // For each page in document
  for (const page of doc.pages) {
    // 1. Get all elements on this page
    const items: ExportItem[] = []
    
    for (const element of page.elements) {
      // 2. Pre-process: resolve variables, render text
      let content
      
      if (element.type === 'text') {
        // Reuse text projection cache if possible
        content = projectTextElement(element)
      } else if (element.type === 'image') {
        // Load/encode image
        content = await encodeImage(element.content)
        images.set(element.id, content)
      } else if (element.type === 'table') {
        // Pre-render table structure
        content = renderTableForExport(element)
      } else {
        content = element.content
      }
      
      // 3. Build export item
      items.push({
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        styles: element.styles,
        content: content,
        zIndex: element.zIndex
      })
    }
    
    // 4. Add to snapshot
    pages.push({
      items: items,
      width: page.width,
      height: page.height,
      paperSize: page.paperSize
    })
  }
  
  return {
    pages,
    images,
    metadata: {
      title: doc.metadata?.title || 'Untitled',
      author: doc.metadata?.author || 'Author',
      createdAt: new Date(),
      keywords: doc.metadata?.keywords
    }
  }
}
```

### Performance Characteristics

- **Time**: 100-500ms depending on page count and image sizes
- **Memory**: Temporary allocations for all rendered content
- **Cache reuse**: Text projections reuse screen-render cache (70-80% hit rate)

---

## Export Format 1: HTML

### Purpose

Standalone, print-friendly HTML file. Uses absolute positioning to match canvas layout.

### Architecture

```
ExportSnapshot
    ↓
html-export.ts: htmlExport()
    ├─ buildHtmlDocument()
    │   ├─ <style> with print CSS
    │   ├─ <div class="page"> per page
    │   └─ <div class="element"> per item
    └─ Embed images as data URIs
    ↓
Single .html file
```

### Implementation

```typescript
async function htmlExport(snapshot: ExportSnapshot): Promise<Blob> {
  const html = buildHtmlDocument(snapshot)
  const blob = new Blob([html], {type: 'text/html'})
  return blob
}

function buildHtmlDocument(snapshot: ExportSnapshot): string {
  let html = '<!DOCTYPE html>\n<html>\n<head>\n'
  
  // 1. Metadata
  html += '<meta charset="UTF-8">\n'
  html += `<title>${snapshot.metadata.title}</title>\n`
  
  // 2. Print styles
  html += '<style>\n'
  html += `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .page {
      position: relative;
      width: ${snapshot.pages[0].width}px;
      height: ${snapshot.pages[0].height}px;
      margin: 0 auto 20px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      page-break-after: always;
    }
    .element {
      position: absolute;
      overflow: visible;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page { margin: 0; box-shadow: none; page-break-after: always; }
    }
  `
  html += '</style>\n</head>\n<body>\n'
  
  // 3. Pages
  for (const page of snapshot.pages) {
    html += `<div class="page" style="width: ${page.width}px; height: ${page.height}px;">\n`
    
    // Sort by z-index
    const sorted = page.items.sort((a, b) => a.zIndex - b.zIndex)
    
    for (const item of sorted) {
      html += serializeElementToHtml(item, snapshot.images)
    }
    
    html += '</div>\n'
  }
  
  html += '</body>\n</html>'
  return html
}

function serializeElementToHtml(
  item: ExportItem,
  images: Map<string, ImageData>
): string {
  const style = `
    position: absolute;
    left: ${item.x}px;
    top: ${item.y}px;
    width: ${item.width}px;
    height: ${item.height}px;
    transform: rotate(${item.rotation}deg);
    color: ${item.styles.color};
    font-family: ${item.styles.fontFamily};
    font-size: ${item.styles.fontSize}px;
    font-weight: ${item.styles.bold ? 'bold' : 'normal'};
    font-style: ${item.styles.italic ? 'italic' : 'normal'};
    text-align: ${item.styles.alignment};
    line-height: ${item.styles.lineHeight}px;
  `
  
  if (item.type === 'text') {
    // Render text lines
    const projection = item.content as TextProjection
    let html = `<div class="element" style="${style}">\n`
    for (const line of projection.lines) {
      html += `<div style="width: ${line.width}px;">${escapeHtml(line.text)}</div>\n`
    }
    html += '</div>\n'
    return html
  }
  
  if (item.type === 'image') {
    // Embed image as data URI
    const dataUri = await encodeImageAsDataUri(item.content)
    return `<img class="element" src="${dataUri}" style="${style}" />\n`
  }
  
  if (item.type === 'table') {
    // Serialize table as HTML
    return serializeTableToHtml(item, style)
  }
  
  return ''
}
```

### Output Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Document</title>
  <style>
    .page { position: relative; width: 816px; height: 1056px; }
    .element { position: absolute; }
  </style>
</head>
<body>
  <div class="page">
    <div class="element" style="left: 50px; top: 50px; width: 700px;">
      <div>This is the first line of text</div>
      <div>This is the second line of text</div>
    </div>
    <img src="data:image/png;base64,iVBORw0K..." style="left: 50px; top: 150px;" />
  </div>
</body>
</html>
```

### Pros & Cons

✅ **Pros**:
- Works in any browser
- Fully responsive (can adjust zoom)
- Easy to print (Cmd/Ctrl+P)
- No external dependencies
- Data URIs embed all resources

❌ **Cons**:
- Large file size (images embedded as base64)
- Absolute positioning breaks on narrow screens
- Limited styling (CSS subset)

---

## Export Format 2: Email (MJML)

### Purpose

Email-safe HTML using nested tables (Outlook compatibility) or MJML framework.

### Architecture

```
ExportSnapshot
    ↓
email-export.ts: emailExport()
    ├─ snapshot-to-mjml.ts: snapshotToMjml()
    │   └─ Convert to MJML format
    ├─ mjml-compiler.ts: compileMjml()
    │   └─ MJML → responsive HTML
    └─ email-layout.ts: buildEmailTableLayout()
        └─ Nested 50px table bands
    ↓
.html file (send via email provider)
```

### Strategy: 50px Table Bands

Most email clients support nested HTML tables. We divide the layout into 50px horizontal bands:

```
Document Layout:           → Table Layout:
┌─────────────────────┐
│ Heading (0-100px)   │      <tr><td height=50>...</td></tr>
│                     │      <tr><td height=50>...</td></tr>  ← Heading
├─────────────────────┤
│ Image (100-300px)   │      <tr><td height=50>...</td></tr>
│                     │      <tr><td height=50>...</td></tr>  ← Image
│                     │      <tr><td height=50>...</td></tr>
├─────────────────────┤
│ Body (300-600px)    │      <tr><td height=50>...</td></tr>
│                     │      <tr><td height=50>...</td></tr>  ← Body
│                     │      <tr><td height=50>...</td></tr>
│                     │      <tr><td height=50>...</td></tr>
└─────────────────────┘
```

### Implementation

```typescript
async function emailExport(snapshot: ExportSnapshot): Promise<Blob> {
  // Approach 1: MJML compilation (recommended)
  const mjml = snapshotToMjml(snapshot)
  const html = await compileMjml(mjml)
  
  // Approach 2: Direct table layout (fallback)
  // const html = buildEmailTableLayout(snapshot)
  
  const blob = new Blob([html], {type: 'text/html'})
  return blob
}

function buildEmailTableLayout(snapshot: ExportSnapshot): string {
  const page = snapshot.pages[0]  // Email = single page
  const bandHeight = 50
  const totalHeight = Math.ceil(page.height / bandHeight)
  
  let html = '<table cellpadding="0" cellspacing="0" width="100%">\n'
  
  for (let band = 0; band < totalHeight; band++) {
    const bandY = band * bandHeight
    const bandEndY = bandY + bandHeight
    
    // Find items that overlap this band
    const itemsInBand = page.items.filter(item =>
      item.y < bandEndY && item.y + item.height > bandY
    )
    
    html += '<tr>\n'
    html += `<td height="${bandHeight}" valign="top">\n`
    
    // Render items in band (simplified)
    for (const item of itemsInBand) {
      const topOffset = Math.max(0, item.y - bandY)
      const bottomOffset = Math.max(0, bandEndY - (item.y + item.height))
      
      html += `<div style="margin-top: ${topOffset}px; margin-bottom: ${bottomOffset}px;">`
      html += serializeItemForEmail(item)
      html += '</div>\n'
    }
    
    html += '</td>\n</tr>\n'
  }
  
  html += '</table>'
  return html
}

function serializeItemForEmail(item: ExportItem): string {
  // Inline styles only (no <style> tag in email)
  // Limited CSS support
  
  if (item.type === 'text') {
    const projection = item.content as TextProjection
    let html = '<p style="margin: 0; padding: 0;">'
    for (const line of projection.lines) {
      html += `<div style="font-family: ${projection.font}; font-size: ${projection.fontSize}px; color: ${projection.color}; line-height: ${projection.lineHeight}px;">`
      html += escapeHtml(line.text)
      html += '</div>'
    }
    html += '</p>'
    return html
  }
  
  if (item.type === 'image') {
    // Embed or reference image
    const src = generateImageSrc(item.content, 'email')
    return `<img src="${src}" width="${item.width}" height="${item.height}" style="display: block;" />`
  }
  
  return ''
}
```

### MJML Output Example

```xml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="24px" font-family="Arial">
          Welcome to Our Newsletter
        </mj-text>
        <mj-divider border-color="#e0e0e0"></mj-divider>
        <mj-image src="https://..." width="300px"></mj-image>
        <mj-text font-size="14px">
          This is the email body content...
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### Compiled HTML Example

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial; }
    table { border-collapse: collapse; }
    td { padding: 0; }
  </style>
</head>
<body>
  <table width="600" align="center">
    <tr>
      <td>
        <h1 style="font-size: 24px;">Welcome to Our Newsletter</h1>
        <hr style="border: none; border-top: 1px solid #e0e0e0;">
        <img src="..." width="300">
        <p style="font-size: 14px;">This is the email body content...</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Pros & Cons

✅ **Pros**:
- Outlook-safe (nested tables)
- Responsive design (MJML framework)
- Works in all email clients
- Preview in test sender UI

❌ **Cons**:
- Complex nested table structure
- Limited styling (no floats, flexbox, etc.)
- MJML compilation overhead
- Images may not load (blocked by clients)

### Email Test Sender

```typescript
// email-test.ts
async function sendTestEmail(to: string, html: string): Promise<void> {
  // WARNING: email-proxy.ts not production-hardened
  const response = await fetch('http://localhost:3001/send-email', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({to, html})
  })
  
  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`)
  }
  
  // Email sent to development mailbox
  console.log(`Test email sent to ${to}`)
}
```

---

## Export Format 3: PDF

### Purpose

Vector PDF document for printing and archival.

### Architecture

```
ExportSnapshot
    ↓
pdf-export.ts: pdfExport()
    ├─ Lazy import jsPDF
    ├─ For each page:
    │   ├─ jsPDF.addPage()
    │   └─ For each item: drawElement()
    └─ Export PDF Blob
    ↓
Single .pdf file
```

### Implementation

```typescript
async function pdfExport(snapshot: ExportSnapshot): Promise<Blob> {
  // Lazy import for bundle size
  const jsPDF = await import('jspdf')
  const PDF = jsPDF.jsPDF
  
  const pages = snapshot.pages
  if (pages.length === 0) return new Blob()
  
  // 1. Create PDF document
  const [page0] = pages
  const pdf = new PDF({
    orientation: page0.width > page0.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [page0.width, page0.height]
  })
  
  // 2. For each page
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage([pages[i].width, pages[i].height])
    
    const page = pages[i]
    
    // 3. For each item on page
    const sorted = page.items.sort((a, b) => a.zIndex - b.zIndex)
    for (const item of sorted) {
      serializeElementToPdf(pdf, item, snapshot.images)
    }
  }
  
  // 4. Export PDF
  const pdfBlob = pdf.output('blob')
  return pdfBlob
}

function serializeElementToPdf(
  pdf: jsPDF,
  item: ExportItem,
  images: Map<string, ImageData>
): void {
  const DPI_RATIO = 72 / 96  // PDF is 72 DPI, canvas is 96 DPI
  
  if (item.type === 'text') {
    const projection = item.content as TextProjection
    
    // Set text properties
    pdf.setFont(projection.font, item.styles.bold ? 'bold' : 'normal')
    pdf.setFontSize(projection.fontSize * DPI_RATIO)
    pdf.setTextColor(item.styles.color)
    
    // Draw each line
    for (const line of projection.lines) {
      const x = (item.x + line.x) * DPI_RATIO
      const y = (item.y + line.y + projection.fontSize) * DPI_RATIO
      
      pdf.text(line.text, x, y, {align: item.styles.alignment})
    }
  }
  
  if (item.type === 'image') {
    const imageData = images.get(item.id)
    if (!imageData) return
    
    const x = item.x * DPI_RATIO
    const y = item.y * DPI_RATIO
    const width = item.width * DPI_RATIO
    const height = item.height * DPI_RATIO
    
    pdf.addImage(imageData, 'PNG', x, y, width, height)
  }
  
  if (item.type === 'table') {
    // Draw table borders and cells
    serializeTableToPdf(pdf, item, DPI_RATIO)
  }
}
```

### DPI Conversion

Screen rendering uses **96 DPI**, but PDF standard is **72 DPI**.

```
Screen: 96 pixels per inch
PDF:    72 pixels per inch
Ratio:  72 / 96 = 0.75

Example:
  Canvas width: 816px @ 96 DPI = 8.5 inches
  PDF width:   816px * 0.75 = 612 PDF points @ 72 DPI = 8.5 inches
```

### Pros & Cons

✅ **Pros**:
- Vector output (crisp text, scalable)
- DPI-independent (prints at any resolution)
- Professional archival format
- Works in all PDF readers
- Print-ready

❌ **Cons**:
- jsPDF library overhead (~200KB)
- Limited text styling (no rich formatting)
- Images embedded as raster (no vector conversion)
- Rotation/transform support limited

---

## Export Format 4: DOCX

### Purpose

Microsoft Word document (.docx format = ZIP + XML).

### Architecture

```
ExportSnapshot
    ↓
docx-export.ts: docxExport()
    ├─ Lazy import JSZip
    ├─ Build XML structure
    │   ├─ [Content_Types].xml
    │   ├─ word/document.xml (content)
    │   ├─ word/media/ (images)
    │   └─ docProps/ (metadata)
    └─ Create ZIP blob
    ↓
Single .docx file
```

### DOCX Structure

```
document.docx (ZIP file)
├── [Content_Types].xml          # MIME type mappings
├── _rels/.rels                   # ZIP relationships
├── word/
│   ├── document.xml              # Main content
│   ├── styles.xml                # Named styles
│   ├── numbering.xml             # List formatting
│   ├── media/
│   │   ├── image1.png
│   │   ├── image2.jpg
│   │   └── ...
│   └── _rels/document.xml.rels   # Content relationships
└── docProps/
    ├── core.xml                  # Title, author, created date
    └── app.xml                   # App name, word count
```

### Implementation

```typescript
async function docxExport(snapshot: ExportSnapshot): Promise<Blob> {
  // Lazy import for bundle size
  const JSZip = await import('jszip')
  const zip = new JSZip()
  
  // 1. Create directory structure
  zip.file('[Content_Types].xml', buildContentTypesXml())
  zip.folder('_rels').file('.rels', buildRelsXml())
  zip.folder('word').folder('media')
  zip.folder('docProps')
  
  // 2. Build document.xml (main content)
  const docXml = buildDocumentXml(snapshot)
  zip.folder('word').file('document.xml', docXml)
  
  // 3. Add images to word/media/
  let imageIndex = 1
  for (const [id, imageData] of snapshot.images) {
    const filename = `image${imageIndex}.png`
    zip.folder('word').folder('media').file(filename, imageData)
    imageIndex++
  }
  
  // 4. Add metadata
  zip.folder('docProps').file('core.xml', buildCoreXml(snapshot))
  zip.folder('docProps').file('app.xml', buildAppXml(snapshot))
  
  // 5. Create ZIP blob
  const blob = await zip.generateAsync({type: 'blob'})
  return blob
}

function buildDocumentXml(snapshot: ExportSnapshot): string {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  xml += `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  xml += `<w:body>`
  
  // For each page
  for (const page of snapshot.pages) {
    // For each item
    for (const item of page.items) {
      if (item.type === 'text') {
        xml += serializeTextToDocx(item)
      } else if (item.type === 'image') {
        xml += serializeImageToDocx(item)
      } else if (item.type === 'table') {
        xml += serializeTableToDocx(item)
      }
    }
    
    // Page break between pages
    xml += `<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>`
  }
  
  xml += `</w:body>`
  xml += `</w:document>`
  return xml
}

function serializeTextToDocx(item: ExportItem): string {
  const projection = item.content as TextProjection
  
  let xml = `<w:p>`
  xml += `<w:pPr>`
  xml += `<w:pStyle w:val="${getStyleName(item.styles)}"/>`
  xml += `<w:jc w:val="${alignmentToJustify(item.styles.alignment)}"/>`
  xml += `</w:pPr>`
  
  // Text as single run with styles
  xml += `<w:r>`
  xml += `<w:rPr>`
  xml += `<w:rFonts w:ascii="${projection.font}"/>`
  xml += `<w:sz w:val="${item.styles.fontSize * 2}"/>`  // Word uses half-points
  if (item.styles.bold) xml += `<w:b/>`
  if (item.styles.italic) xml += `<w:i/>`
  xml += `<w:color w:val="${colorToHex(item.styles.color)}"/>`
  xml += `</w:rPr>`
  
  // Combine all lines into one run
  const text = projection.lines.map(l => l.text).join('\n')
  xml += `<w:t>${escapeXml(text)}</w:t>`
  
  xml += `</w:r>`
  xml += `</w:p>`
  return xml
}

function serializeImageToDocx(item: ExportItem): string {
  // Reference embedded image
  let xml = `<w:p>`
  xml += `<w:r>`
  xml += `<w:drawing>`
  xml += `<wp:anchor><wp:extent cx="${Math.round(item.width * 914400)}" cy="${Math.round(item.height * 914400)}"/>`
  xml += `<blip r:embed="rId${getImageRelId(item.id)}"/>`
  xml += `</wp:anchor>`
  xml += `</w:drawing>`
  xml += `</w:r>`
  xml += `</w:p>`
  return xml
}

function buildContentTypesXml(): string {
  // Maps file extensions to MIME types
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
}
```

### Pros & Cons

✅ **Pros**:
- Native Word format (users expect .docx)
- Editable in Microsoft Office
- Preserves formatting reasonably well
- Good for document archival

❌ **Cons**:
- Complex ZIP + XML structure
- Word XML is verbose and strict
- Limited shape/positioning support
- JSZip library adds bundle size

---

## Export Format 5: GIF

### Purpose

Animated GIF with frame-by-frame rendering.

### Architecture

```
ExportSnapshot + Animation Data
    ↓
gif-exporter.ts: gifExport()
    ├─ For each animation frame:
    │   ├─ Update element positions
    │   ├─ Render to canvas
    │   ├─ Capture frame (ImageData)
    │   └─ Add to frame buffer
    ├─ Quantize palette
    ├─ Encode with omggif (worker thread)
    └─ Return GIF Blob
    ↓
Single .gif file (looping animation)
```

### Frame Capture Pipeline

```typescript
async function gifExport(snapshot: ExportSnapshot, animationOptions: {
  duration: number           // ms per frame
  loop: boolean
  quality: number            // 1-30, lower = better
}): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = snapshot.pages[0].width
  canvas.height = snapshot.pages[0].height
  const ctx = canvas.getContext('2d')!
  
  const frames: ImageData[] = []
  
  // 1. For each animation frame
  const frameCount = calculateFrameCount(animationOptions.duration)
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    // 2. Update animation state
    const t = frameIndex / frameCount  // 0 to 1
    updateAnimationFrame(t)
    
    // 3. Render to canvas
    for (const item of snapshot.pages[0].items) {
      renderItemToCanvas(ctx, item)
    }
    
    // 4. Capture frame
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    frames.push(imageData)
    
    // Report progress
    reportProgress(frameIndex / frameCount)
  }
  
  // 5. Quantize palette
  const palette = getOptimalPalette(frames)
  
  // 6. Encode to GIF (worker thread)
  const gifBlob = await encodeGifWithWorker(frames, {
    duration: animationOptions.duration,
    palette: palette,
    quality: animationOptions.quality,
    loop: animationOptions.loop
  })
  
  return gifBlob
}

function updateAnimationFrame(t: number): void {
  // For each animated element (GIF, mascot)
  // Interpolate position/rotation along path
  
  for (const gif of animatedGifs) {
    const newPos = gif.path.interpolate(t)
    gif.element.x = newPos.x
    gif.element.y = newPos.y
    gif.element.rotation = newPos.rotation
  }
}

function renderItemToCanvas(
  ctx: CanvasRenderingContext2D,
  item: ExportItem
): void {
  if (item.type === 'text') {
    renderTextToCanvas(ctx, item)
  } else if (item.type === 'image') {
    renderImageToCanvas(ctx, item)
  }
  // ... etc
}
```

### Frame Encoding (Worker Thread)

```typescript
// gif-encoder-worker.ts
self.onmessage = async (event) => {
  const {frames, options} = event.data
  
  // Use omggif to encode
  const gif = new GifWriter(
    new Uint8Array(frames[0].data.length * frames.length),
    frames[0].width,
    frames[0].height,
    {
      palette: options.palette,
      loop: options.loop ? 0 : -1
    }
  )
  
  for (let i = 0; i < frames.length; i++) {
    gif.addFrame(0, 0, frames[i].width, frames[i].height, frames[i].data, {
      delay: options.duration
    })
    
    // Report progress
    self.postMessage({
      type: 'progress',
      percent: (i + 1) / frames.length
    })
  }
  
  // Send result
  self.postMessage({
    type: 'done',
    blob: new Blob([gif.render()], {type: 'image/gif'})
  })
}
```

### GIF Options UI

```typescript
// gif-export-ui.ts
interface GifExportOptions {
  duration: number      // ms per frame (default: 100)
  loop: boolean         // loop animation (default: true)
  quality: number       // 1-30, lower = better (default: 10)
  fps: number           // frames per second (calculated from duration)
}

function showGifExportPanel(): void {
  // Show UI with controls:
  // - Duration slider (50-500ms)
  // - Loop toggle
  // - Quality slider (1-30)
  // - Preview (first frame)
  // - Export button
}
```

### Pros & Cons

✅ **Pros**:
- Universal support (all browsers, email, social)
- Compact file size (palette quantization)
- Animated (can show motion, transitions)
- No external players needed

❌ **Cons**:
- GIF quality limited (256 colors max)
- Large file size for long animations
- Palette quantization can cause banding
- Worker thread adds complexity
- Encoding time: 5-30 seconds depending on animation length

---

## Performance Characteristics

### Export Time Comparison

| Format | Time | Factors |
|--------|------|---------|
| **HTML** | 100-200ms | Page count, image embedding |
| **Email** | 150-300ms | MJML compilation, layout carving |
| **PDF** | 200-500ms | jsPDF lazy import, DPI conversion |
| **DOCX** | 300-700ms | JSZip compression, XML building |
| **GIF** | 5-30s | Animation length, palette quantization, encoding |

### File Size Comparison

| Format | Size | Factors |
|--------|------|---------|
| **HTML** | 200KB-2MB | Images (data URIs), text content |
| **Email** | 150KB-1.5MB | Table nesting overhead, images |
| **PDF** | 100KB-500KB | Vector compression, image embedding |
| **DOCX** | 100KB-600KB | ZIP compression, XML overhead |
| **GIF** | 50KB-5MB | Animation length, palette size |

### Memory Usage

```typescript
// Snapshot building: ~5-10MB temporary
// Format-specific:
// - HTML: 1-2MB
// - Email: 2-5MB
// - PDF: 5-10MB (jsPDF overhead)
// - DOCX: 2-5MB
// - GIF: 50-200MB (all frames in memory)
```

---

## Error Handling & Recovery

### Common Errors

```typescript
// Error 1: Image load failure
try {
  const img = await loadImage(element.imageSrc)
} catch (e) {
  console.warn(`Image failed to load: ${element.imageSrc}`)
  // Continue with placeholder or skip image
}

// Error 2: jsPDF lazy import failure
async function pdfExport(snapshot) {
  try {
    const jsPDF = await import('jspdf')
  } catch (e) {
    throw new Error(`PDF export unavailable: ${e.message}`)
  }
}

// Error 3: MJML compilation failure
async function emailExport(snapshot) {
  try {
    const html = await compileMjml(mjml)
  } catch (e) {
    console.warn(`MJML compilation failed, using fallback HTML`)
    return buildEmailTableLayout(snapshot)
  }
}
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System overview
- [MODULE_INDEX.md](./MODULE_INDEX.md#exports) — Export modules
- Export modules: `html-export.ts`, `email-export.ts`, `pdf-export.ts`, `docx-export.ts`, `gif-exporter.ts`

---

**Last Updated**: Apr 22, 2026
**Supported Formats**: HTML, Email (MJML), PDF (jsPDF), DOCX (JSZip), GIF (omggif)
**Performance Target**: < 1s for HTML/Email/PDF/DOCX, < 30s for GIF
**File Size Limit**: Depends on browser (typically 100MB+)
