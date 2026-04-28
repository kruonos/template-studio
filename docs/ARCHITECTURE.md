    # Pretext Template Studio Architecture

    ## Overview

    The Pretext Template Studio is a universal template studio for creating multi-page layouts with rich text composition and multi-format exports (HTML, email, PDF, DOCX, GIF). It's a production-quality dogfood application for Pretext's layout engine, exercising real-world text projection, obstacle-aware wrapping, and table cell text rendering.

    **Key stats:**
    - 64 production TypeScript modules
    - ~19,900 lines of TypeScript including tests and declarations
    - Zero external UI framework (vanilla TypeScript + Canvas API)
    - Imports the published `@chenglou/pretext` package plus local `src/wrap-geometry.ts` helpers
    - Open-source preparation target: keep the local editor useful, documented, and verifiable without service credentials

    ---

    ## System Architecture

    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │ User Interface Layer (Canvas, DOM, Inspector)                   │
    ├─────────────────────────────────────────────────────────────────┤
    │  Sidebar UI           Canvas Interactions      Properties Panel  │
    │  (variables,          (drag, resize, select)   (element props)  │
    │   layers, templates)  Canvas Overlays (guides) Inspector Control│
    └─────────────────────────────────────────────────────────────────┘
                                 ↕
    ┌─────────────────────────────────────────────────────────────────┐
    │ Orchestration Layer                                               │
    ├─────────────────────────────────────────────────────────────────┤
    │  main.ts bootstraps app-controller.ts                            │
    │  app-controller.ts owns legacy compatibility wiring              │
    │  store.ts owns AppState, history, interaction, runtime caches    │
    │  render-loop.ts owns requestAnimationFrame scheduling            │
    │  animation-loop.ts resyncs animation systems from store changes  │
    └─────────────────────────────────────────────────────────────────┘
                                 ↕
    ┌─────────────────────────────────────────────────────────────────┐
    │ Document & State Layer                                           │
    ├─────────────────────────────────────────────────────────────────┤
    │  Document Lifecycle    Content Layer    Persistence             │
    │  (init, reset, undo)   (pages, surfaces)(localStorage + versions)│
    │  Schema & Types        Theme Management Document-scoped State    │
    └─────────────────────────────────────────────────────────────────┘
                                 ↕
    ┌─────────────────────────────────────────────────────────────────┐
    │ Element & Rendering Layer                                        │
    ├─────────────────────────────────────────────────────────────────┤
    │  Element Factory      Canvas Rendering       Text Projection     │
    │  (create elements)    (DOM pipeline)         (Pretext layout)    │
    │  Element Styling      Viewport Controls      Obstacle-Aware Text │
    │  Typography Utils     Viewport Scale         Table Cell Layout   │
    └─────────────────────────────────────────────────────────────────┘
                                 ↕
    ┌─────────────────────────────────────────────────────────────────┐
    │ Feature Layers                                                   │
    ├─────────────────────────────────────────────────────────────────┤
    │ Tables               Animation & Media        Exports            │
    │ (table-engine.ts)    (animated-media.ts)     (5 formats)        │
    │ (table-ui.ts)        (animation-paths.ts)    (export-assembly.ts)│
    │                      (gif-exporter.ts)       (HTML/email/PDF/   │
    │                      (mascot-animation.ts)    DOCX/GIF)          │
    └─────────────────────────────────────────────────────────────────┘
                                 ↕
    ┌─────────────────────────────────────────────────────────────────┐
    │ External Dependencies                                            │
    ├─────────────────────────────────────────────────────────────────┤
    │  Pretext (text layout)  Canvas 2D API  localStorage             │
    │  jsPDF (PDF export)     omggif (GIF)   DOM APIs                 │
    │  Wrap-geometry (obstacles)  html2canvas Intl APIs               │
    └─────────────────────────────────────────────────────────────────┘
    ```

    ---

    ## Data Flow: From Edit to Render

    ### Critical Path: Text Edit → Canvas Display

    ```
    User edits text in inline editor
             ↓
    Feature event handler or legacy controller catches input event
             ↓
    State is updated through store actions or compatibility state refs
             ↓
    Invalidate caches:
      • textProjectionCache.delete(elementId)
      • preparedCache.clear() [optional, if fonts change]
             ↓
    store.dispatch({ type: 'render/request' })
             ↓
    render-loop.ts schedules one RAF
             ↓
    render():
      • For each visible element:
        - If text element: projectTextElement(element)
        - If table: renderTableCells()
        - Else: drawImage/drawRect/etc
             ↓
    projectTextElement(element):
      • resolveVariables(text) → final text
      • getPreparedRich() → Pretext.prepareWithSegments() [cached]
      • If obstacles present: projectObstacleAwareText()
        - carveTextLineSlots() → geometry
        - layoutNextLine() per slot
      • Else: layoutWithLines() [fast path]
             ↓
    Canvas context rendered, DOM updated
             ↓
    Display on screen @ 60fps
    ```

    **Latency budget:**
    - Text edit → render: 16ms (one RAF frame)
    - Render → canvas display: immediate
    - Obstacle animation: 16ms per frame (cache miss every frame)

    ---

    ## Data Flow: From Element to Export

    ### Export Pipeline: Render → File

    ```
    User clicks "Export to [format]"
             ↓
    exportController routes to format handler:
      • HTML → buildExportSnapshot() → htmlExport()
      • Email → buildExportSnapshot() → emailExport()
      • PDF → buildExportSnapshot() → pdfExport()
      • DOCX → buildExportSnapshot() → docxExport()
      • GIF → buildExportSnapshot() → gifExport() + animation
             ↓
    buildExportSnapshot():
      • For each page:
        - Clone document + theme
        - Re-render all elements
        - Capture text projections (reuse cache from screen render)
        - Collect metadata (variables, styles, images)
      • Return ExportSnapshot { pages, images, metadata }
             ↓
    Format-specific serializer:
      • HTML: Absolute positioning, inline styles, image data URIs
      • Email: Nested 50px table bands (Outlook compatibility)
      • PDF: jsPDF vector canvas, 96→72 DPI conversion
      • DOCX: ZIP + XML + media refs, Word-compatible structure
      • GIF: Canvas 2D render per frame + omggif encoding
             ↓
    Blob created → download / send
    ```

    ---

    ## Module Inventory

    ### Core Orchestration

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **main.ts** | 3 | Bootstrap entry | `bootstrapTemplateStudio()` |
    | **app-controller.ts** | ~2,535 | Transitional compatibility controller during migration | DOM bootstrap, feature wiring, render pipeline callbacks |
    | **store.ts** | ~250 | Central synchronous AppState store | `createStore()`, `dispatch()`, `subscribe()`, `onChange()` |
    | **render-loop.ts** | ~60 | Store-driven RAF scheduler | `initRenderLoop()`, `requestRender()` |
    | **animation-loop.ts** | ~20 | Store-driven animation resync | `initAnimationLoop()` |
    | **schema.ts** | 502 | Type definitions for document model | `StudioState`, `CanvasElement`, `Styles` |

    ### State Management

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **document-lifecycle.ts** | 287 | Document init, reset, versioning | `initDocument()`, `resetDocument()`, `getVersions()` |
    | **persistence.ts** | 170 | localStorage layer + template storage | `save()`, `load()`, `listTemplates()` |
    | **content.ts** | 231 | Content layer for pages/surfaces | `getActivePage()`, `addSurface()`, `deletePage()` |
    | **theme.ts** | 114 | Theme/surface management | `setTheme()`, `getThemeColors()` |

    ### Canvas Rendering

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **canvas-elements-renderer.ts** | 199 | Element rendering pipeline | `renderElements()`, format-specific drawers |
    | **canvas-viewport-ui.ts** | 67 | Viewport scaling, zoom controls | `setZoom()`, `fitToScreen()` |
    | **canvas-overlays.ts** | 252 | Guides, selection handles, indicators | `drawGuides()`, `drawSelectionBox()` |
    | **viewport-scale.ts** | 33 | Zoom & scale calculations | `calculateViewportScale()` |

    ### User Interactions

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **canvas-interactions.ts** | 517 | Pointer events, drag, resize, select | `handlePointerDown()`, `handleDragMove()` |
    | **context-menu.ts** | 341 | Right-click menus | `showContextMenu()`, menu item handlers |
    | **editor-shortcuts.ts** | 207 | Keyboard shortcuts | Cmd/Ctrl+Z, Cmd/Ctrl+C, Delete, etc. |
    | **inspector-controller.ts** | 418 | Properties panel input handling | `handlePropertyChange()`, value parsers |
    | **properties-panel.ts** | 412 | Properties UI rendering & state | `renderPropertyPanel()`, input UI builders |
    | **sidebar-ui.ts** | 231 | Sidebar panels (variables, layers, templates) | `renderSidebar()`, list rendering |
    | **sidebar-actions.ts** | ~188 | Sidebar action handlers | Variable/layer/template/version list ops |
    | **inline-editor-ui.ts** | 125 | Text inline editing UI | `showInlineEditor()`, input handling |

    ### Elements & Styling

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **element-factory.ts** | 166 | Element creation helpers | `createTextElement()`, `createImageElement()`, etc. |
    | **element-media.ts** | 40 | Image/media handling | `loadImage()`, media type detection |
    | **element-typography.ts** | 41 | Text style utilities | `parseFontFamily()`, `getLineHeightPx()` |
    | **paper-size.ts** | 41 | Paper presets | `PAPER_SIZES`, `getPaperDimensions()` |
    | **dom.ts** | 115 | DOM utility helpers | `createElement()`, `setStyle()`, event helpers |

    ### Text & Layout (Pretext Integration)

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **text-projection.ts** | 417 | **KEY**: Pretext integration, text measurement | `projectTextElement()`, `projectObstacleAwareText()` |
    | **template-variables.ts** | 10 | Variable substitution | `resolveVariables()` |

    **text-projection.ts Deep Dive:**

    This module is the bridge to Pretext. It orchestrates:

    ```typescript
    projectTextElement(element) → TextProjection
    ├─ resolveVariables(text) → final text with vars substituted
    ├─ getPreparedRich() → Pretext.prepareWithSegments() [cached]
    │  └─ Input: text, font, fontSize, { wordBreak: 'keep-all'?, ... }
    │  └─ Output: segments array with break metadata
    ├─ No obstacles → layoutWithLines() [fast path]
    │  └─ Input: width, lineHeight
    │  └─ Output: lines[] with text, width per line
    └─ WITH obstacles → projectObstacleAwareText() [streaming]
       ├─ getMascotSilhouettes() → [{y, height, width}]
       ├─ getGifSilhouettes() → frame-dependent silhouettes
       ├─ carveTextLineSlots() → safe regions for text per line
       ├─ layoutNextLine() [Pretext streaming API]
       │  └─ Per-line, per-slot layout with cursor state
       └─ Three wrap modes: strict/normal/freedom

    Output: TextProjection {
      lines: {text, width, x, y}[]
      font, fontSize, lineHeight, color
    }
    ```

    Caching strategy (2-layer):
    - **Fast cache** (`preparedCache`): `Map<font+fontSize, Prepared>` — opaque handle for measurement
    - **Rich cache** (`textProjectionCache`): `Map<elementId, TextProjection>` — full layout result
    - Cache invalidation: on text/font/size/obstacle change

    ---

    ### Tables

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **table-engine.ts** | 906 | **LARGE**: Table model, grid logic | `parseTableData()`, `getCellRect()`, `evaluateFormulas()` |
    | **table-ui.ts** | 441 | Table editing UI | `renderTableCell()`, `handleTableCellEdit()` |

    **Table Architecture:**

    ```
    Table element { content: TableData }
      ├─ TableData: JSON-serialized 2D grid
      ├─ Merged cells: sparse storage (e.g., row 0-2, col 1 = single cell)
      ├─ Column widths: per-column size array
      ├─ Row heights: dynamic based on content
      ├─ Per-cell styles: {color, background, bold, etc.}
      ├─ Per-cell content: {text, formula}
      └─ Per-cell text → projectTableCellText() → Pretext layout

    Cell rendering:
      ├─ getTableCellRect() → bounds + padding
      ├─ evaluateFormulas(cellContent) → final text
      ├─ projectTableCellText() → TextProjection in cell bounds
      ├─ Format-specific rendering:
      │  ├─ HTML: <table><tr><td>
      │  ├─ Email: nested 50px bands with cell text
      │  ├─ PDF: cell borders + text in jsPDF
      │  └─ DOCX: table XML + cell content
      └─ GIF: canvas cell render per frame
    ```

    ---

    ### Exports (5 Formats)

    | Module | Lines | Purpose |
    |--------|-------|---------|
    | **export-assembly.ts** | 224 | Unified export orchestration |
    | **export-controller.ts** | 44 | Export menu wiring |
    | **export-snapshot.ts** | 85 | Snapshot capture |
    | **export-pages.ts** | 12 | Multi-page export helper |
    | **html-export.ts** | 168 | HTML serialization (absolute positioning) |
    | **email-export.ts** | 264 | Email template export wrapper |
    | **email-layout.ts** | 239 | Email layout logic (50px bands) |
    | **email-proxy.ts** | 119 | Local email proxy (test only; not production-hardened) |
    | **email-test.ts** | 92 | Email test sender UI |
    | **pdf-export.ts** | 422 | PDF generation (jsPDF) |
    | **docx-export.ts** | 496 | DOCX generation (ZIP + XML) |
    | **snapshot-to-mjml.ts** | 499 | Snapshot-to-MJML conversion (email) |
    | **mjml-compiler.ts** | 41 | MJML-to-HTML compiler |
    | **flow-export.ts** | 102 | Flow/outline export (development aid) |

    **Export Format Comparison:**

    | Format | Technology | Architecture | Use Case |
    |--------|-----------|--------------|----------|
    | HTML | CSS absolute positioning | `<style>` + `<div>` | Print-friendly, responsive |
    | Email | Nested tables (50px bands) | Outlook-safe, inline styles | Email clients |
    | PDF | jsPDF vector canvas | 96→72 DPI conversion | Print, archive, download |
    | DOCX | ZIP + XML + image refs | Word-compatible structure | Microsoft Office |
    | GIF | Canvas 2D + omggif encoder | Frame-based animation | Social media, web |

    ---

    ### Animation & Media

    | Module | Lines | Purpose | Key Functions |
    |--------|-------|---------|---|
    | **animated-media.ts** | 949 | **LARGEST**: Animation model, silhouettes | `updateGifPositions()`, `getMascotSilhouettes()` |
    | **animation-paths.ts** | 241 | Keyframe paths & easing | `TracedPath`, interpolation helpers |
    | **gif-animation.ts** | 63 | Animation primitives | `AnimationFrame` type, frame logic |
    | **gif-exporter.ts** | 584 | GIF encoding orchestration | `encodeGif()`, frame capture |
    | **gif-export-ui.ts** | 153 | GIF export UI | `showGifExportPanel()` |
    | **gif-helpers.ts** | 123 | GIF utility functions | `captureCanvasFrame()`, palette utils |
    | **gif-encoder-worker.ts** | 110 | Worker-based encoding | GIF encoding in background thread |
    | **mascot-animation.ts** | 191 | UI mascot animations | Bounce, spin, wave animations |
    | **mascots.ts** | 66 | Mascot asset definitions | Asset paths, metadata |

    **Animation Data Flow:**

    ```
    Animation loop (RAF):
    ├─ updateGifPositions(deltaMs)
    │  └─ Move GIF along traced path → new position
    ├─ updateMascotPositions(deltaMs)
    │  └─ Move mascot via keyframes
    ├─ Compute silhouettes:
    │  ├─ getMascotSilhouettes() → alpha hull from image
    │  └─ getGifSilhouettes() → frame-dependent outline
    ├─ Set obstacles for text elements:
    │  └─ textElement.obstacles = [{x, y, width, height, ...}]
    ├─ Invalidate text projection cache
    │  └─ textProjectionCache.delete(elementId)
    └─ store.dispatch({ type: 'render/request' })
       └─ render-loop.ts redraws text around new obstacle positions

    Text wrapping around obstacles:
    ├─ projectObstacleAwareText()
    ├─ carveTextLineSlots(obstacles, lineY, lineHeight)
    │  └─ Compute safe regions (polygon carving)
    ├─ layoutNextLine() per safe region
    │  └─ Streaming Pretext API with cursor state
    └─ TextProjection includes lines[] in safe regions
    ```

    **TracedPath Format:**

    ```typescript
    {
      keyframes: [
        { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        { time: 500, x: 100, y: 50, scaleX: 1.2, scaleY: 0.8, rotation: 45 },
        // ... cubic Bezier interpolation between keyframes
      ],
      closed: false // loop animation?
    }
    ```

    ---

    ### Utilities

    | Module | Lines | Purpose |
    |--------|-------|---------|
    | **utils.ts** | 155 | Shared helpers (color ops, math, etc.) |
    | **image-upload.ts** | 55 | Image file handling |
    | **templates.ts** | TBD | Template management (likely extracted from main) |

    ### Type Stubs & Build

    | Module | Lines | Purpose |
    |--------|-------|---------|
    | **mjml-browser.d.ts** | 21 | MJML type stubs |
    | **omggif.d.ts** | 18 | omggif type stubs |

    ---

    ## Critical Data Structures

    ### AppState (store.ts)

    ```typescript
    interface AppState {
      document: StudioState
      history: {
        past: StoredDocument[]
        future: StoredDocument[]
      }
      interaction: {
        inlineEditorState: InlineEditorState | null
        dragState: DragState | null
        resizeState: ResizeState | null
        contextMenuState: ContextMenuState | null
        table: TableInteractionState
      }
      runtime: {
        elementNodes: Map<string, HTMLDivElement>
        cacheManager: CacheManager
        clipboard: CanvasElement | null
      }
      animation: {
        mascotAnimStates: Map<string, MascotAnimState>
        gifHullCache: Map<string, Point[] | null>
      }
    }
    ```

    ### CanvasElement

    ```typescript
    interface CanvasElement {
      id: string
      type: 'text' | 'image' | 'shape' | 'table' | 'gif'
      
      // Geometry
      x: number
      y: number
      width: number
      height: number
      rotation: number
      
      // Content
      content: string | TableData | ImageData
      
      // Styling
      styles: Styles
      
      // Layout
      obstacles: Obstacle[]
      
      // Metadata
      name: string
      locked: boolean
    }

    interface Styles {
      // Text
      fontSize: number
      fontFamily: string
      bold: boolean
      italic: boolean
      underline: boolean
      color: string
      
      // Paragraph
      lineHeight: number
      alignment: 'left' | 'center' | 'right' | 'justify'
      wordBreak: 'normal' | 'keep-all'
      
      // Fill & stroke
      background: string
      borderColor: string
      borderWidth: number
      
      // Advanced
      opacity: number
    }
    ```

    ### TextProjection (text-projection.ts)

    ```typescript
    interface TextProjection {
      lines: {
        text: string
        width: number
        x: number
        y: number
      }[]
      
      font: string
      fontSize: number
      lineHeight: number
      color: string
      
      // Metadata for obstacles/wrapping
      wrappingMode?: 'strict' | 'normal' | 'freedom'
    }
    ```

    ### ExportSnapshot (export-snapshot.ts)

    ```typescript
    interface ExportSnapshot {
      pages: ExportPage[]
      images: Map<string, ImageData>
      metadata: {
        title: string
        author: string
        createdAt: Date
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
      styles: Styles
      content: TextProjection | ImageData | TableExport
    }
    ```

    ---

    ## Performance Characteristics

    ### Render Loop Timing

    | Operation | Time Budget | Optimization |
    |-----------|-------------|--------------|
    | Text edit → layout | 16ms | Cache prepared & projection |
    | Obstacle animation | 16ms | Silhouette cache, delta updates |
    | Export snapshot | 100-500ms | Reuse screen-render cache |
    | PDF export | 200-800ms | Lazy jsPDF import |
    | GIF export | 5-30s | Worker thread for encoding |
    | DOM/canvas update | 1-5ms | Batch repaints per RAF |

    ### Cache Invalidation

    | Cache | When Cleared | Effect |
    |-------|-------------|--------|
    | `preparedCache` | Font/size change | Recompute segment metrics |
    | `textProjectionCache` | Text/width/obstacle change | Recompute layout per line |
    | `elementNodes` | Element added/removed | Rebuild DOM tree |
    | Silhouette cache | GIF frame change, animation | Recompute alpha hull |

    ### Memory Baseline

    - Empty document: ~500 KB
    - 100 text elements: ~2-3 MB
    - Full screenshot with assets: ~5-10 MB (depends on image count)
    - GIF encoding: ~50 MB temporary (frames × resolution)

    ---

    ## Integration with Pretext

    Page-builder is a **first-class dogfood consumer** of Pretext's rich layout APIs.

    ### APIs Used

    1. **`prepare(text, font, opts)` → Prepared**
       - Fast opaque handle for text measurement
       - Called in `projectTextElement()` (cached)

    2. **`prepareWithSegments(text, font, opts)` → PreparedWithSegments**
       - Rich segment array with break metadata
       - Enables per-line rendering & bidi handling
       - Called when rendering inline (cached)

    3. **`layoutWithLines(prepared, width, lineHeight)` → Line[]**
       - Full paragraph layout, no obstacles
       - Fast path for simple text elements
       - Called in `projectTextElement()` when no obstacles

    4. **`layoutNextLine(prepared, cursor, width, opts)` → LayoutResult**
       - Streaming API for variable-width layout
       - Perfect for obstacle-aware wrapping
       - Called in `projectObstacleAwareText()` per text slot

    5. **`measureLineStats(prepared, start, end)` → LineStats**
       - Per-line width/ascender/descender metrics
       - Used for precise line height calculation

    6. **`{ wordBreak: 'keep-all' }` option**
       - Recently integrated for CJK text
       - Wired into schema, persistence, UI, text-projection cache key

    ### Dogfood Findings

    **Working well:**
    - Core `prepare()` + `layoutWithLines()` fast path is solid
    - `layoutNextLine()` streaming API enables creative obstacle layouts
    - Schema + caching pattern scales to 500+ elements per page

    **Areas for improvement:**
    - `layoutNextLine()` grapheme-cursor handling has edge cases with SHY + CJK
    - Bidi metadata on `prepareWithSegments()` should be decoupled from segment array (only needed for rendering)
    - `{ wordBreak: 'keep-all' }` rule-set syncing between preprocessing and core needs tighter integration

    ---

    ## Development Workflow

    ### Local Development

    ```bash
    # Start dev server
    bun start

    # Navigate to
    http://localhost:3000/

    # Run type check
    bun run check
    ```

    ### File Organization

    ```
    ./
    ├── index.html              # Vite HTML entry
    ├── src/
    │   ├── main.ts             # Bootstrap entry
    │   ├── app-controller.ts   # Legacy compatibility controller
    │   ├── store.ts            # Central AppState store
    │   ├── render-loop.ts      # Store-driven RAF scheduler
    │   ├── animation-loop.ts   # Animation resync subscription
    │   ├── schema.ts           # Document model types
    │   ├── text-projection.ts  # Pretext integration
    │   ├── wrap-geometry.ts    # Obstacle interval geometry
    │   ├── table-engine.ts     # Table model and formulas
    │   ├── browser-download.ts # Testable export download side effects
    │   ├── canvas-*.ts         # Rendering, interactions, overlays
    │   ├── *-export.ts         # HTML, email, PDF, DOCX, GIF exports
    │   └── *.test.ts           # Focused Vitest coverage
    ├── docs/
    │   ├── ARCHITECTURE.md
    │   ├── TEXT_LAYOUT_GUIDE.md
    │   ├── EXPORT_PIPELINES.md
    │   ├── MODULE_INDEX.md
    │   ├── OPEN_SOURCE.md
    │   └── ROADMAP.md
    ├── README.md
    ├── CONTRIBUTING.md
    ├── LICENSE
    └── package.json
    ```

    ---

    ## Testing & Profiling

    ### Current State

    - **Focused unit tests** — layout, exports, persistence, cache, browser downloads, and element factory coverage
    - **Build/type gate** — `bun run verify` runs type check, unit tests, and production build
    - **No performance profiling** — no heap snapshots or CPU budgets

    ### Recommended Approach

    1. **Unit tests** (Vitest/Bun test runner):
       - `element-factory.ts`: Element creation & type validation
       - `text-projection.ts`: Pretext layout integration
       - `persistence.ts`: localStorage round-trip
       - Export format handlers: Snapshot serialization
       - Browser side-effect adapters: downloads and optional network helpers

    2. **Integration tests**:
       - Document lifecycle: new → edit → save → load → export
       - Table formula evaluation & cell layout
       - Obstacle animation & text wrapping

    3. **Performance profiling**:
       - Chrome DevTools CPU profile during canvas render
       - Heap snapshots: baseline, after 100 elements, after 500 elements
       - Memory allocation hotspots in text-projection + table-engine

    ---

    ## Known Issues & Improvements

    ### Near-term (Weeks 1–2)

    - [ ] Keep shrinking `src/app-controller.ts` through focused, tested extractions
    - [ ] Add browser smoke tests for load, selection, drag/resize, preview widths, and export menus
    - [ ] Add export fixtures for HTML, email, PDF, DOCX, JSON, and GIF outputs
    - [ ] Add basic perf markers for canvas render time, projection cache hit rate, and export duration

    ### Medium-term (Weeks 3–6)

    - [ ] Expand integration tests around document lifecycle and export parity
    - [ ] Performance optimization (profile & optimize for 1,000+ elements)
    - [ ] Rich-inline integration (`@chenglou/pretext/rich-inline`)
    - [ ] Obstacle geometry editing UI
    - [ ] Centralize cache invalidation strategy

    ### Long-term (Months 4+)

    - [ ] Mobile responsiveness & touch interactions
    - [ ] Accessibility (ARIA, keyboard nav, screen readers)
    - [ ] Version control integration (git-based persistence)
    - [ ] Collaborative editing (multi-user, live cursors)
    - [ ] Plugin system (custom element types, export formats)

    ---

    ## References

    - [Pretext Layout API](https://www.npmjs.com/package/@chenglou/pretext)
    - [Wrap-geometry (Obstacle Carving)](../src/wrap-geometry.ts)
    - [Bootstrap entry](../src/main.ts)
    - [App controller](../src/app-controller.ts)
    - [Store](../src/store.ts)
    - [Render loop](../src/render-loop.ts)
    - [Text projection](../src/text-projection.ts)
    - [Table Engine](../src/table-engine.ts)
    - [Export Assembly](../src/export-assembly.ts)
    - [Browser Download Helper](../src/browser-download.ts)
    - [Open-Source Readiness Guide](./OPEN_SOURCE.md)

    ---

    ## Contributing

    ### Adding a New Feature

    1. **Identify the layer** (state, rendering, interaction, export)
    2. **Follow the module pattern**:
       - One module per feature / feature family
       - Export pure functions (no side effects)
       - Use TypeScript types from `schema.ts`
    3. **Thread state changes through the store**:
       - Dispatch a typed action when possible
       - Use compatibility hooks only for legacy modules not yet migrated
       - Let `render-loop.ts` schedule redraws from store changes
    4. **Invalidate caches** correctly:
       - Text change → `textProjectionCache.delete(id)`
       - Geometry change → full `render()`
    5. **Test manually**:
       - Verify in dev server
       - Check export formats if feature affects serialization

    ### Performance Checklist

    - [ ] Measure render time with DevTools profiler
    - [ ] Check memory baseline (heap snapshot)
    - [ ] Verify cache hit rates (add perf markers)
    - [ ] Profile with 500+ elements if feature affects rendering
    - [ ] Test with long text & complex obstacles if feature involves text layout

    ---

    **Last Updated**: Apr 28, 2026  
    **Architecture Version**: 1.1  
    **Production TypeScript Modules**: 64  
    **Total TypeScript Lines**: ~19,900 including tests and declarations
