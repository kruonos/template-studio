# Module Index

This index is a contributor map for the current Template Studio codebase. It favors ownership boundaries over exhaustive API listings so new contributors can find the right module before making changes.

Current shape:

- 64 production TypeScript modules in `src/`
- 10 test/support TypeScript files
- `src/main.ts` is a 3-line bootstrapper
- `src/app-controller.ts` is the largest remaining compatibility layer at about 2,535 lines

## Entry And Orchestration

| Module | Purpose | Change guidance |
| --- | --- | --- |
| `main.ts` | Browser entry point. Calls `bootstrapTemplateStudio()`. | Do not add feature logic here. |
| `app-controller.ts` | Transitional controller for DOM bootstrap, compatibility hooks, export actions, and feature wiring. | Extract focused modules when touching isolated behavior. |
| `store.ts` | Typed synchronous app store for document, history, interaction, runtime, and animation state. | Add actions when state transitions are shared or testable. |
| `render-loop.ts` | Store-driven requestAnimationFrame scheduling. | Keep render scheduling centralized. |
| `animation-loop.ts` | Subscribes animation systems to store changes. | Keep animation resync here rather than in UI handlers. |

## Document And State

| Module | Purpose |
| --- | --- |
| `schema.ts` | Core document, element, style, export, and UI types. |
| `document-schema.ts` | Runtime normalization and schema helpers. |
| `document-lifecycle.ts` | Initial load, reset, backup, template save/restore, history, and dirty state hooks. |
| `persistence.ts` | Versioned localStorage stores, document backups, import parsing, and normalization. |
| `content.ts` | Pages, surfaces, safe URLs, and HTML sanitization helpers. |
| `theme.ts` | Surface themes, UI theme persistence, and palette helpers. |
| `cache-manager.ts` | Dependency-aware prepared text and projection caches. |

## Canvas And Interaction

| Module | Purpose |
| --- | --- |
| `canvas-elements-renderer.ts` | DOM/canvas element rendering. |
| `canvas-viewport-ui.ts` | Canvas scale, page guide, zoom, and viewport controls. |
| `viewport-scale.ts` | Pure zoom and preview-width calculations. |
| `canvas-overlays.ts` | Grid, smart guides, marquee, measurement, drop indicators, and coordinate helpers. |
| `canvas-interactions.ts` | Pointer selection, dragging, resizing, marquee startup, and canvas double-click handling. |
| `context-menu.ts` | Context menu rendering and element actions. |
| `editor-shortcuts.ts` | Keyboard shortcuts for selection, history, duplication, alignment, and editing. |
| `inline-editor-ui.ts` | Inline text editor DOM. |
| `inspector-controller.ts` | Inspector input and click handling. |
| `properties-panel.ts` | Inspector view rendering. |
| `sidebar-ui.ts` | Variables, layers, templates, shortcuts modal, and toolbar state rendering. |
| `sidebar-actions.ts` | Sidebar list actions and mutations. |

## Elements, Media, And Text

| Module | Purpose |
| --- | --- |
| `element-factory.ts` | Element creation defaults for text, images, buttons, tables, GIFs, and media. |
| `element-media.ts` | Source resolution for images, GIFs, mascots, and videos. |
| `element-typography.ts` | Font family, size, weight, line height, and color helpers. |
| `text-projection.ts` | Pretext integration, prepared-text caching, obstacle-aware line layout, table-cell text projection, and text fitting. |
| `wrap-geometry.ts` | Obstacle interval carving and polygon band geometry. |
| `template-variables.ts` | Variable substitution. |
| `vector-json.ts` | SVG/Lottie-style JSON import helpers. |

## Tables

| Module | Purpose |
| --- | --- |
| `table-engine.ts` | Table model, cell access, merged cells, formulas, sizing, serialization, and parsing. |
| `table-ui.ts` | Table rendering, selection, editing, resize, and table action UI hooks. |

## Animation And GIF

| Module | Purpose |
| --- | --- |
| `animated-media.ts` | Animated media parsing and runtime state helpers. |
| `animation-paths.ts` | Path tracing, waypoint parsing, path overlays, and trace mode. |
| `mascots.ts` | Mascot presets and metadata. |
| `mascot-animation.ts` | Mascot animation frames, hull caches, and path resync. |
| `gif-animation.ts` | Animated GIF frame loop and base-position reset. |
| `gif-helpers.ts` | GIF upload and silhouette helpers. |
| `gif-exporter.ts` | GIF frame rendering and encoding pipeline. |
| `gif-export-ui.ts` | GIF export dialog, preview URL, and download actions. |
| `gif-encoder-worker.ts` | Worker-side GIF encoding entry. |

## Export Pipeline

| Module | Purpose |
| --- | --- |
| `export-assembly.ts` | Central adapter from app hooks to format-specific exporters. |
| `export-snapshot.ts` | Stable render snapshot used by all export formats. |
| `export-controller.ts` | Email export fallback coordination. |
| `export-pages.ts` | Page slicing helpers. |
| `flow-export.ts` | Flow block extraction for email/DOCX-style output. |
| `html-export.ts` | Absolute-positioned HTML export. |
| `email-layout.ts` | Email layout primitives. |
| `email-export.ts` | Sliced table email HTML and plain-text email output. |
| `snapshot-to-mjml.ts` | MJML-style table wrapper generation. |
| `mjml-compiler.ts` | Browser MJML compilation wrapper. |
| `pdf-export.ts` | jsPDF export. |
| `docx-export.ts` | DOCX ZIP/XML export. |
| `browser-download.ts` | Testable browser download helper used by export actions. |
| `email-test.ts` | Test-email dialog controller. |
| `email-proxy.ts` | Optional local SparkPost development proxy. |

## Utilities

| Module | Purpose |
| --- | --- |
| `dom.ts` | Required DOM element lookup and typed DOM bundle. |
| `utils.ts` | Generic escaping, IDs, cloning, parsing, rounding, slugs, and type guards. |
| `paper-size.ts` | Paper presets and dimensions. |
| `errors.ts` | User-facing error type and guard. |
| `sample-templates.ts` | Public sample template definitions. |
| `templates.ts` | Blank and launch-brief document templates. |

## Tests

Tests sit beside the modules they cover and import `src/test-setup.ts`. Current coverage focuses on deterministic logic:

- Cache behavior
- Element defaults
- Email export
- Export fallback controller
- Browser download helper
- HTML export
- Persistence and import normalization
- Table engine
- Text projection
- Vector JSON import

Browser-level smoke tests are still needed for first load, element selection, drag/resize, export menu opening, and preview-width switching.

## Migration Notes

The long-term direction is to keep `app-controller.ts` shrinking:

1. Extract pure logic first.
2. Add tests around the extracted module.
3. Keep browser side effects behind small adapters.
4. Leave the controller as wiring, not as a new home for business logic.
5. Update this index whenever a module boundary changes.
