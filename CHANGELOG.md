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

### Known Limitations

- `src/app-controller.ts` is still a transitional compatibility layer and remains the largest module.
- Browser smoke tests and visual regression tests are not yet in place.
- Some export paths rely on large browser-side libraries, so the production build currently reports a large chunk warning.
- Email export compatibility still needs a broader client matrix.
