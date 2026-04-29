# Launch Notes

Use this file as the public-release checklist and announcement scratchpad.

## Same-Day Release Checklist

- [ ] Confirm `bun run verify` passes.
- [ ] Start the app with `bun start` and open `http://localhost:3000/`.
- [ ] Run `bun run export:audit` when Playwright is available, then inspect `audit-summary.json` and screenshots.
- [ ] Open `http://localhost:3000/?preset=product-one-pager`.
- [ ] Try HTML, PDF, email HTML, and ODT from a sample template.
- [ ] Confirm screenshots in `samples/screenshots/` still match the current UI.
- [ ] Set the GitHub repository description.
- [ ] Add topics such as `pretext`, `template-editor`, `canvas`, `email-builder`, `pdf`, `docx`, `local-first`, and `typescript`.
- [ ] Enable GitHub private vulnerability reporting if available.
- [ ] Add the repository URL to the LinkedIn post before publishing.

## GitHub Repository Description

Local-first visual template studio with freeform canvas editing, routed text around obstacles, and exports to HTML, email, PDF, ODT/DOCX, JSON, and GIF.

## LinkedIn Post Draft

I am open-sourcing Pretext Template Studio.

It is a local-first visual editor for designed documents, landing pages, and email templates. The main idea is geometry-first editing: place content freely on a canvas, then route text around images, tables, buttons, HTML blocks, and animated media instead of forcing everything into a rigid block layout.

The project uses `@chenglou/pretext` for text measurement and line layout, vanilla TypeScript for the editor UI, Vite/Bun for development, jsPDF for PDF export, MJML/email table output for email, OpenDocument/DOCX package generation for editable document exports, and omggif for GIF output.

What works today:

- Freeform canvas editing with drag, resize, selection, layers, variables, templates, and inspector controls.
- Multi-page sample documents that demonstrate routed text around positioned media.
- Local browser persistence through `localStorage`.
- Exports for HTML, PDF, ODT/DOCX, email HTML, plain-text email, JSON, and GIF.
- Focused tests around layout, persistence, tables, exports, downloads, and document package structure.
- A Playwright export audit that downloads real exports from the UI, screenshots HTML/email output, renders PDF pages when `pdftoppm` is available, and validates ODT/DOCX package contents.

The current local verification passes `bun run verify` and the export audit on the investor-update sample. That means the public repo can show the core idea working: authored canvas layout, routed text, tables, images, and multi-format exports from the same document model.

This is still an early pre-1.0 release. Bugs are expected. Layout edge cases are expected. Email clients and document editors will disagree in places. The goal of open-sourcing it now is to make the code, tradeoffs, tests, and roadmap visible while the project is still small enough for contributors to shape.

I would especially appreciate feedback from people who care about canvas editors, local-first software, text layout, document generation, PDF/email export, or open-source product architecture.

Repository: [add link]

## Shorter LinkedIn Version

I am open-sourcing Pretext Template Studio today.

It is a local-first visual editor for documents, landing pages, and email templates, built around a geometry-first idea: place content freely, then route text deterministically around it with `@chenglou/pretext`.

The repo includes canvas editing, variables, tables, animated media, sample templates, local persistence, and exports to HTML, email, PDF, ODT/DOCX, JSON, and GIF. The current local checks pass `bun run verify` plus a Playwright export audit that validates real generated files from the UI.

It is still pre-1.0, so bugs and layout edge cases are expected. The next priorities are export fidelity, browser smoke tests, accessibility, and continued cleanup of the remaining compatibility controller.

Feedback is welcome, especially from people who work on editors, layout engines, document generation, or email tooling.

Repository: [add link]
