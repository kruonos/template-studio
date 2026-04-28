# Core Orchestration Refactor

## What Changed

- `src/main.ts` is now a thin bootstrapper.
- The legacy orchestration body moved to `src/app-controller.ts`.
- `src/store.ts` introduces a typed, synchronous application store with reducer-style actions, selector subscriptions, and generic change listeners.
- `src/render-loop.ts` owns requestAnimationFrame scheduling and reacts to store changes.
- `src/animation-loop.ts` centralizes animation resync subscriptions.

## Why

The old `main.ts` mixed document state, UI state, event wiring, render scheduling, caches, history, animation frame IDs, and feature hooks in one module. The new structure creates explicit boundaries so new code can depend on the store and render loop instead of adding more ad-hoc closures to `main.ts`.

## Adding A Feature

1. Put feature logic in its own module.
2. Read current state through `store.getState()`.
3. Dispatch typed actions through `store.dispatch(...)`.
4. Let `src/render-loop.ts` redraw after state changes.
5. Use DOM refs only in the feature initializer that owns those nodes.

`store.getMutableState()` exists only as a compatibility bridge for the current controller while remaining hook-based modules are migrated incrementally.
