# Changelog

All notable changes to Pretext Template Studio will be documented here.

This project uses plain-language release notes while it is pre-1.0.

## Unreleased

### Added

- Local-first visual editor for designed documents, landing pages, and email templates.
- Obstacle-aware routed text powered by `@chenglou/pretext`.
- Multi-page canvas editing, variables, layers, inspector controls, tables, animated media, and mascot elements.
- Export pipelines for HTML, email HTML, plain-text email, PDF, DOCX, JSON, and GIF.
- Sample templates and screenshots for public demos.
- Open-source documentation, contribution guide, security policy, issue templates, pull request template, and CI workflow.

### Changed

- Split export-only libraries out of the initial editor bundle. PDF, DOCX, email/MJML, GIF, jsPDF, html2canvas, and MJML compiler code now load on demand from the relevant export action.
- Email table export now places text by projected line slots instead of full text boxes, so routed text no longer drops obstacle images.
- DOCX export now preserves more canvas geometry with positioned Word shapes, text boxes, and embedded image media instead of flattening pages into screenshots.

### Known Limitations

- `src/app-controller.ts` is still a transitional compatibility layer and remains the largest module.
- Browser smoke tests and visual regression tests are not yet in place.
- The production build still reports a large chunk warning for the lazy MJML compiler chunk, but that code is no longer part of the initial editor load.
- Email export compatibility still needs a broader client matrix.
