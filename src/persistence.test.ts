import './test-setup.ts'
import { describe, expect, test } from 'vitest'
import { BACKUP_STORAGE_KEY, STORAGE_KEY, STORAGE_VERSION, asElementId, createDefaultVariables, type SavedTemplate, type StoredDocument } from './schema.ts'
import { createTableData } from './table-engine.ts'
import { isStoredDocument, normalizeStoredDocument, parseImportedTemplateDocument, readDocumentBackup, readTemplateStore, writeDocumentBackup, writeTemplateStore } from './persistence.ts'

function createDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
  const document: StoredDocument = {
    name: overrides.name ?? 'Recovered Draft',
    description: overrides.description ?? '',
    elements: overrides.elements ?? [],
    variables: overrides.variables ?? createDefaultVariables(),
    wrapMode: overrides.wrapMode ?? 'normal',
    surfaceTheme: overrides.surfaceTheme ?? 'light',
    manualPageCount: overrides.manualPageCount ?? 1,
  }
  if (overrides.paperSize !== undefined) document.paperSize = overrides.paperSize
  if (overrides.emailFormat !== undefined) document.emailFormat = overrides.emailFormat
  if (overrides.emailBreakpoint !== undefined) document.emailBreakpoint = overrides.emailBreakpoint
  return document
}

describe('persistence', () => {
  test('writes a versioned template store and restores normalized templates', () => {
    const template: SavedTemplate = {
      id: 'tpl-1',
      name: 'Launch Brief',
      description: 'Current draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      current: createDocument(),
      versions: [],
    }

    writeTemplateStore(STORAGE_KEY, [template])

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { version: number }
    expect(raw.version).toBe(STORAGE_VERSION)
    expect(readTemplateStore(STORAGE_KEY)[0]?.current.name).toBe('Recovered Draft')
  })

  test('persists backups separately from the main store', () => {
    const document = createDocument({ name: 'Unsaved Changes' })
    writeDocumentBackup(STORAGE_KEY, document)

    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).not.toBeNull()
    expect(readDocumentBackup(STORAGE_KEY)?.document.name).toBe('Unsaved Changes')
  })

  test('import parsing accepts direct documents and envelope payloads', () => {
    const document = createDocument({ name: 'Envelope Draft' })

    expect(parseImportedTemplateDocument(document)?.name).toBe('Envelope Draft')
    expect(parseImportedTemplateDocument({ current: document })?.name).toBe('Envelope Draft')
    expect(parseImportedTemplateDocument({ template: document })?.name).toBe('Envelope Draft')
  })

  test('preserves the selected email export mode through normalization', () => {
    const document = createDocument({ emailFormat: 'mjml' })
    writeTemplateStore(STORAGE_KEY, [{
      id: 'tpl-email',
      name: 'Email Mode',
      description: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      current: document,
      versions: [],
    }])

    expect(readTemplateStore(STORAGE_KEY)[0]?.current.emailFormat).toBe('mjml')
  })

  test('stored document guard rejects partial payloads that used to slip through', () => {
    expect(isStoredDocument({ elements: [], variables: [] })).toBe(false)
    expect(isStoredDocument(createDocument())).toBe(true)
  })

  test('upgrades legacy stringified table payloads at import boundaries', () => {
    const imported = parseImportedTemplateDocument({
      ...createDocument(),
      elements: [{
        id: 'table-legacy',
        type: 'table',
        x: 40,
        y: 80,
        width: 180,
        height: 60,
        content: JSON.stringify({
          rows: 1,
          cols: 1,
          colWidths: [1],
          rowHeights: [36],
          cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, content: 'Legacy', styles: {} }],
          headerRows: 0,
          defaultBorder: { width: 1, color: '#c0c8d0', style: 'solid' },
        }),
        styles: {},
      }],
    })

    expect(imported).not.toBeNull()
    if (imported === null) return
    const table = imported.elements[0]
    expect(table?.type).toBe('table')
    if (table === undefined || table.type !== 'table') return
    expect(table.content.rows).toBe(1)
    expect(table.content.cells[0]?.content).toBe('Legacy')
  })

  test('freezes normalized stored documents and nested table data', () => {
    const normalized = normalizeStoredDocument(createDocument({
      elements: [{
        id: asElementId('table-frozen'),
        type: 'table',
        x: 20,
        y: 40,
        width: 240,
        height: 96,
        content: createTableData(2, 2, 240, 32),
        styles: {},
      }],
    }))

    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized.elements)).toBe(true)
    expect(Object.isFrozen(normalized.variables)).toBe(true)
    const table = normalized.elements[0]
    expect(table?.type).toBe('table')
    if (table === undefined || table.type !== 'table') return
    expect(Object.isFrozen(table)).toBe(true)
    expect(Object.isFrozen(table.content)).toBe(true)
    expect(Object.isFrozen(table.content.cells)).toBe(true)
  })

  test('reads legacy table snapshots from localStorage and upgrades them to typed table content', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      templates: [{
        id: 'tpl-table',
        name: 'Table Draft',
        description: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
        current: {
          ...createDocument(),
          elements: [{
            id: 'table-store',
            type: 'table',
            x: 0,
            y: 0,
            width: 160,
            height: 60,
            content: JSON.stringify({
              rows: 1,
              cols: 1,
              colWidths: [1],
              rowHeights: [40],
              cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, content: 'Stored', styles: {} }],
              headerRows: 0,
              defaultBorder: { width: 1, color: '#c0c8d0', style: 'solid' },
            }),
            styles: {},
          }],
        },
        versions: [],
      }],
    }))

    const [template] = readTemplateStore(STORAGE_KEY)
    const table = template?.current.elements[0]
    expect(table?.type).toBe('table')
    if (table === undefined || table.type !== 'table') return
    expect(table.content.cells[0]?.content).toBe('Stored')
  })
})
