import type {
  ExportSnapshot,
  ExportSnapshotPage,
} from './schema.ts'

export function getRenderableExportPages(snapshot: ExportSnapshot): ExportSnapshotPage[] {
  let lastNonEmptyIndex = snapshot.pages.length - 1
  while (lastNonEmptyIndex > 0 && snapshot.pages[lastNonEmptyIndex]?.items.length === 0) {
    lastNonEmptyIndex -= 1
  }
  return snapshot.pages.slice(0, lastNonEmptyIndex + 1)
}
