# Roadmap

This roadmap keeps the project focused on the thing that makes it different: freeform placement with stable routed text and reliable exports.

## Now

- Keep the app fully local and offline by default.
- Preserve the standalone dependency model: `@chenglou/pretext` from npm, app-specific geometry in `src/wrap-geometry.ts`.
- Improve the first-run experience with a polished sample document and obvious drag/drop affordances.
- Add browser-level smoke tests for loading the studio, selecting an element, dragging media, switching preview widths, and opening export menus.
- Keep `src/app-controller.ts` shrinking by moving actions into focused, tested modules.
- Keep public documentation synchronized with current code boundaries so contributors do not learn stale architecture.

## Open-Source Readiness

- Maintain a clean `bun run verify` gate for outside contributors.
- Document known limitations instead of hiding product gaps.
- Keep optional services out of the default local workflow.
- Add issue-sized refactor targets for reducing the compatibility controller.
- Prefer sample templates and fixtures that demonstrate routed text, export behavior, and offline usage.
- Keep screenshots and README claims aligned with the current app.

## Export Fidelity

- Verify generated HTML, PDF, DOCX, JSON, GIF, and email output from automated fixtures.
- Add visual regression checks for canvas render versus exported output where practical.
- Expand the email compatibility matrix across Outlook desktop, Outlook web, Gmail, Apple Mail, iOS Mail, Android Gmail, and dark mode.
- Document known export tradeoffs, especially absolute-positioned HTML and fragmented text extraction in PDF.

## Text Layout

- Add more obstacle fixtures for images, buttons, HTML blocks, tables, GIFs, and mascot silhouettes.
- Strengthen tests around `layoutNextLine()` usage, wrap modes, CJK `keep-all`, soft hyphen behavior, and mixed-direction text.
- Explore richer obstacle shapes beyond rectangles: rounded rectangles, polygons, alpha silhouettes, and user-authored wrap paths.
- Investigate worker-based text projection for very large documents or animated obstacle scenes.

## Product Quality

- Improve component insertion affordances in the sidebar.
- Add keyboard-accessible canvas actions for common editing operations.
- Add import/export round-trip tests for saved templates.
- Add explicit document recovery flows when localStorage data is malformed.
- Improve performance telemetry for render time, cache hit rate, and export duration.
- Add browser smoke tests before treating the UI as release-ready.

## Optional Hosted/API Layer

The local editor should remain fully usable without a server. A hosted layer can add convenience rather than lock-in:

- Server-side export rendering.
- Email-client previews and compatibility reports.
- Asset hosting and image proxying.
- Batch template rendering through an API.
- Team storage, sharing, and collaboration.

## Not The Immediate Goal

- A full SaaS backend.
- A template marketplace.
- Real-time multiplayer editing.
- Replacing mature design tools.

Those can be explored later if the local editor and export story are already excellent.
