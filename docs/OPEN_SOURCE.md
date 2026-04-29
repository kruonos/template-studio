# Open-Source Readiness Guide

This project should be useful to people who want to study, extend, or reuse a local-first routed-text editor. Public polish means the codebase should be understandable, verifiable, and honest about tradeoffs.

## What The Project Promises

- A browser-only editor that works offline by default.
- Freeform placement with deterministic routed text around obstacles.
- Export pipelines that reuse the resolved layout instead of relying on browser flow to reinterpret the document.
- Sample templates that demonstrate real use cases without service credentials.
- Optional integrations that do not block local development.

## What The Project Does Not Promise Yet

- SaaS hosting, accounts, billing, or collaboration.
- Perfect email rendering in every client.
- Pixel-identical parity across HTML, email, PDF, ODT/DOCX, and GIF for every possible document.
- A production backend; the included email proxy is only a loopback development helper.
- A stable plugin API.
- A fully migrated controller layer.

## Code Quality Bar

Open-source contributions should make the codebase easier to trust:

- New deterministic behavior should have tests.
- Export changes should include fixture coverage or documented manual checks.
- UI changes should be verified in a browser.
- New modules should have a narrow responsibility and typed boundaries.
- Existing local-first behavior should not gain required network dependencies.
- Large controller changes should move logic out of `src/app-controller.ts`, not add more hidden state to it.

## Documentation Bar

Documentation should answer the questions a new contributor will actually have:

- How do I run the app?
- What makes this different from a normal block builder?
- Which module owns the behavior I want to change?
- Which commands prove my change did not break the project?
- What are the current limitations?

When code behavior changes, update the closest matching document:

- `README.md` for setup, usage, and public positioning.
- `CONTRIBUTING.md` for contribution workflow and review expectations.
- `docs/ARCHITECTURE.md` for system boundaries and data flow.
- `docs/MODULE_INDEX.md` for ownership changes.
- `docs/EXPORT_PIPELINES.md` for output format behavior.
- `docs/TEXT_LAYOUT_GUIDE.md` for Pretext and wrapping behavior.
- `docs/ROADMAP.md` for planned work and non-goals.

## Release Checklist

Before making the repository public:

- `bun run verify` passes on a clean checkout.
- The app loads at `http://localhost:3000/` after `bun start`.
- `bun run export:audit` passes when Playwright is available, with screenshots reviewed for HTML and email output.
- At least one sample template opens through `?preset=product-one-pager`.
- Export menus open without network credentials.
- README screenshots match the current UI.
- Stale architecture claims have been removed.
- Known limitations are documented rather than hidden.
- License, contribution guide, code of conduct, security policy, and roadmap are present.
- Optional service configuration is documented through `.env.example` and `docs/OPTIONAL_EMAIL_PROXY.md`.

## Useful First Issues

- Add browser smoke tests for load, selection, drag, preview-width switching, and export menu opening.
- Add export fixtures for HTML, email HTML, PDF metadata, ODT/DOCX structure, JSON, and GIF frame count.
- Add visual regression checks for canvas render versus exported output where practical.
- Extract a narrow controller behavior into a focused module with tests.
- Improve accessibility for keyboard canvas actions and inspector controls.
- Add more sample templates that stress obstacle-aware text layout.
