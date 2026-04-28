# Contributing

Thanks for helping improve Pretext Template Studio. The project is a local-first editor, so changes should preserve the core promise: freeform placement, stable routed text, and export fidelity.

## Setup

```bash
bun install
bun start
```

Open `http://localhost:3000/`.

Before sending changes:

```bash
bun run verify
```

Use the individual commands when narrowing failures:

```bash
bun run check
bun run test
bun run build
```

## Development Principles

- Keep the editor usable offline by default.
- Preserve geometry-first behavior: moving an object should not force unrelated layout collapse.
- Treat text projection as data that can be rendered and exported consistently.
- Prefer focused modules over adding more responsibility to `src/app-controller.ts`.
- Add tests when changing schema normalization, layout projection, table behavior, persistence, or exports.
- Validate at least one real browser run for UI and interaction changes.
- Keep optional network integrations disabled unless the user explicitly opts in.
- Document export limitations instead of hiding lossy behavior.

## Common Change Path

1. Update types in `src/schema.ts` when the document model changes.
2. Add or update focused logic in the relevant module.
3. Wire state changes through `src/app-controller.ts` only where orchestration is still necessary.
4. Invalidate caches deliberately through `src/cache-manager.ts`.
5. Update inspector/sidebar/canvas rendering as needed.
6. Verify export behavior when visual output changes.

## Pull Request Expectations

Every public contribution should include:

- A short explanation of the user-visible behavior or internal boundary being changed.
- Tests for deterministic logic, especially layout, persistence, import/export, and schema migration.
- A note about manual browser coverage when pointer interaction, canvas rendering, downloads, or keyboard shortcuts change.
- Documentation updates when behavior, supported formats, setup, or architecture boundaries change.

Avoid broad mixed-purpose pull requests. A good change usually has one of these shapes:

- A focused feature module plus its controller wiring.
- A regression test plus the smallest fix that makes it pass.
- A documentation correction backed by the current code.
- A compatibility extraction from `src/app-controller.ts` into a testable module.

## Controller Migration Rule

`src/app-controller.ts` is a compatibility layer, not the place where new subsystems should accumulate. When touching it:

- Move pure logic into a nearby focused module when practical.
- Pass browser-only side effects through small helpers that can be unit tested.
- Keep DOM ownership local to the initializer or controller that owns the nodes.
- Prefer typed hooks over reaching into global mutable state from feature modules.
- Leave `store.getMutableState()` usage smaller than you found it when a safe extraction is available.

## Key Areas

- `src/text-projection.ts`: Pretext integration and routed text layout.
- `src/wrap-geometry.ts`: obstacle interval geometry.
- `src/table-engine.ts`: table model, formulas, merge behavior, and cell layout.
- `src/persistence.ts` and `src/document-schema.ts`: local storage and import normalization.
- `src/export-assembly.ts`: export entry points.
- `src/email-export.ts`, `src/pdf-export.ts`, `src/docx-export.ts`, `src/html-export.ts`, `src/gif-exporter.ts`: output formats.

## Optional Email Testing

Email sending is not required for normal development. To test the local SparkPost proxy:

```bash
SPARKPOST_API=your_key_here
bun run email:proxy
```

The proxy is a development helper, not production infrastructure.

## Documentation

When behavior changes, update the relevant doc:

- [Architecture](./docs/ARCHITECTURE.md)
- [Text layout guide](./docs/TEXT_LAYOUT_GUIDE.md)
- [Export pipelines](./docs/EXPORT_PIPELINES.md)
- [Module index](./docs/MODULE_INDEX.md)
- [Open-source readiness](./docs/OPEN_SOURCE.md)
- [Launch notes](./docs/LAUNCH.md)
- [Roadmap](./docs/ROADMAP.md)
- [Changelog](./CHANGELOG.md)
