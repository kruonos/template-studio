# Launch Notes

Use this file as the public-release checklist and announcement scratchpad.

## Same-Day Release Checklist

- [ ] Confirm `bun run verify` passes.
- [ ] Start the app with `bun start` and open `http://localhost:3000/`.
- [ ] Open `http://localhost:3000/?preset=product-one-pager`.
- [ ] Try one export path from a sample template.
- [ ] Confirm screenshots in `samples/screenshots/` still match the current UI.
- [ ] Set the GitHub repository description.
- [ ] Add topics such as `pretext`, `template-editor`, `canvas`, `email-builder`, `pdf`, `docx`, `local-first`, and `typescript`.
- [ ] Enable GitHub private vulnerability reporting if available.
- [ ] Add the repository URL to the LinkedIn post before publishing.

## GitHub Repository Description

Local-first visual template studio with freeform canvas editing, routed text around obstacles, and exports to HTML, email, PDF, DOCX, JSON, and GIF.

## LinkedIn Post Draft

I am open-sourcing Pretext Template Studio today.

It is a local-first visual editor for designed documents, landing pages, and email templates. The idea is simple: most builders are block-flow systems, but some layouts need freeform placement without text collapsing unpredictably when media moves.

Pretext Template Studio uses `@chenglou/pretext` to route text around freely positioned objects. Images, buttons, tables, HTML blocks, GIFs, and animated elements can act as obstacles, while text is projected into the available space.

What is in the repo:

- Freeform canvas editing with selection, drag, resize, layers, variables, and inspector controls.
- Multi-page documents and sample templates.
- Obstacle-aware text layout powered by Pretext.
- Tables, images, CTAs, HTML snippets, animated media, and mascot elements.
- Local persistence in the browser.
- Exports for HTML, email HTML, plain-text email, PDF, DOCX, JSON, and GIF.
- Documentation for architecture, text layout, export pipelines, contribution flow, and open-source readiness.

It is not finished, and I am being explicit about that. The current focus is making the editor useful, keeping it local-first, improving export fidelity, adding browser smoke tests, and continuing to shrink the remaining compatibility controller.

If you are interested in canvas editors, document generation, local-first tools, email/PDF export, or text layout engines, I would appreciate feedback.

Repository: [add link]

## Shorter LinkedIn Version

I am open-sourcing Pretext Template Studio today.

It is a local-first visual editor for documents, landing pages, and email templates, built around a geometry-first idea: place media freely, then route text deterministically around it with `@chenglou/pretext`.

The repo includes canvas editing, variables, tables, animated media, sample templates, local persistence, and exports to HTML, email, PDF, DOCX, JSON, and GIF.

It is still pre-1.0. The next priorities are export fidelity, browser smoke tests, accessibility, and continued cleanup of the remaining compatibility controller.

Feedback is welcome, especially from people who work on editors, layout engines, document generation, or email tooling.

Repository: [add link]
