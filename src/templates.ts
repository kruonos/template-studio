import {
  DEFAULT_PAPER_SIZE,
  createDefaultVariables,
  type PaperSize,
  type Preset,
  type StoredDocument,
  type SurfacePalette,
  type SurfaceTheme,
} from './schema.ts'
import { remapDocumentToPaperSize } from './paper-size.ts'
import { SAMPLE_PRESETS } from './sample-templates.ts'
import { cloneData, createId } from './utils.ts'

export const PRESETS: Preset[] = [
  {
    id: 'launch-brief',
    name: 'Launch brief',
    description: 'Hero, proof points, CTA, and a second page handoff note.',
    create: createLaunchBriefDocument,
  },
  {
    id: 'renewal-email',
    name: 'Renewal email',
    description: 'Email-first layout with image, button, and variable-driven offer copy.',
    create: createRenewalEmailDocument,
  },
  {
    id: 'event-sheet',
    name: 'Event sheet',
    description: 'Poster-style page with routed text around media and sponsor inserts.',
    create: createEventSheetDocument,
  },
  ...SAMPLE_PRESETS,
]

export function createBlankDocument(
  surfaceTheme: SurfaceTheme,
  palette: SurfacePalette,
  paperSize: PaperSize = DEFAULT_PAPER_SIZE,
): StoredDocument {
  return {
    name: 'Untitled template',
    description: '',
    surfaceTheme,
    paperSize: { ...paperSize },
    elements: [
      {
        id: createId('el'),
        type: 'heading',
        x: paperSize.margin,
        y: paperSize.margin,
        width: paperSize.width - paperSize.margin * 2,
        height: 120,
        content: 'Start with a title.',
        styles: { fontWeight: 700, fontSize: 36, color: palette.heading },
      },
      {
        id: createId('el'),
        type: 'text',
        x: paperSize.margin,
        y: 160,
        width: 320,
        height: 180,
        content: 'Double-click this block to edit inline. Drag new images, HTML snippets, and CTAs from the sidebar.',
        styles: { fontSize: 18, color: palette.body },
      },
    ],
    variables: cloneData(createDefaultVariables()),
    wrapMode: 'freedom',
    manualPageCount: 1,
  }
}

export function createLaunchBriefDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createLaunchBriefBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

export function createRenewalEmailDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createRenewalEmailBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

export function createEventSheetDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createEventSheetBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

function createLaunchBriefBaseDocument(): StoredDocument {
  const width = DEFAULT_PAPER_SIZE.width
  const height = DEFAULT_PAPER_SIZE.height
  const margin = DEFAULT_PAPER_SIZE.margin
  return {
    name: 'Launch brief',
    description: 'Two-page launch narrative with routed copy, CTA, and handoff notes.',
    wrapMode: 'freedom',
    surfaceTheme: 'light',
    manualPageCount: 2,
    paperSize: { ...DEFAULT_PAPER_SIZE },
    variables: cloneData(createDefaultVariables()),
    elements: [
      {
        id: createId('el'),
        type: 'heading',
        x: margin,
        y: 42,
        width: 620,
        height: 130,
        content: 'Welcome back, {{firstName}}.\nThe next release is ready.',
        styles: { fontWeight: 700, fontSize: 40, color: '#1a2b3a' },
      },
      {
        id: createId('el'),
        type: 'image',
        x: 432,
        y: 168,
        width: 232,
        height: 252,
        content: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
        styles: { borderRadius: 22 },
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: 176,
        width: 620,
        height: 268,
        content: 'The new rollout for {{company}} balances clarity and urgency. Product proof points stay in the main narrative, while the hero media and CTA remain live obstacles.\n\nThat lets the copy adapt when artwork, logos, or sponsor modules shift without falling back to DOM reflow measurements.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
      {
        id: createId('el'),
        type: 'button',
        x: margin,
        y: 474,
        width: 224,
        height: 56,
        content: 'Book the walkthrough',
        styles: { background: '#17384f', color: '#f8fffd', borderRadius: 999, href: '{{ctaUrl}}', fontSize: 16, fontWeight: 700 },
      },
      {
        id: createId('el'),
        type: 'html',
        x: 294,
        y: 470,
        width: 370,
        height: 116,
        content: '<div style="padding:18px;background:#edf8f6;border-radius:18px;border:1px solid rgba(23,56,79,0.12);"><strong>{{role}}</strong><br><span style="color:#476273;">Use the inline editor for last-minute personalization before export.</span></div>',
        styles: { borderRadius: 18 },
      },
      {
        id: createId('el'),
        type: 'divider',
        x: margin,
        y: 620,
        width: width - margin * 2,
        height: 18,
        content: '',
        styles: {},
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: 660,
        width: 620,
        height: 220,
        content: 'Second-page notes: because page height is explicit, exports can group positioned content into print pages while the editor keeps one continuous vertical coordinate system.\n\nUse the layers panel to reprioritize overlaps, and the template tab to restore any saved version.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
      {
        id: createId('el'),
        type: 'heading',
        x: margin,
        y: height + 44,
        width: 620,
        height: 120,
        content: 'Page two\nOperational handoff',
        styles: { fontWeight: 700, fontSize: 34, color: '#1a2b3a' },
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: height + 182,
        width: 320,
        height: 250,
        content: 'Keep the version history tight. Every save writes a LocalStorage snapshot with a numbered restore point. JSON export is for backup or handoff. ODT/DOCX and email exports switch to document-friendly structures so downstream tools can edit copy without positioned CSS.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
      {
        id: createId('el'),
        type: 'video',
        x: 390,
        y: height + 198,
        width: 274,
        height: 180,
        content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        styles: { borderRadius: 20 },
      },
      {
        id: createId('el'),
        type: 'button',
        x: margin,
        y: height + 474,
        width: 230,
        height: 54,
        content: 'Send final proof',
        styles: { background: '#0f5f58', color: '#f6fffd', borderRadius: 999, href: '{{ctaUrl}}', fontSize: 16, fontWeight: 700 },
      },
    ],
  }
}

function createRenewalEmailBaseDocument(): StoredDocument {
  const margin = DEFAULT_PAPER_SIZE.margin
  return {
    name: 'Renewal email',
    description: 'Email-first sequence with responsive CTA and variable-driven reminders.',
    wrapMode: 'normal',
    surfaceTheme: 'light',
    manualPageCount: 1,
    paperSize: { ...DEFAULT_PAPER_SIZE },
    variables: cloneData(createDefaultVariables()),
    elements: [
      {
        id: createId('el'),
        type: 'heading',
        x: margin,
        y: 48,
        width: 620,
        height: 110,
        content: '{{firstName}}, your renewal window opens now.',
        styles: { fontWeight: 700, fontSize: 38, color: '#1a2b3a' },
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: 182,
        width: 380,
        height: 210,
        content: 'We tightened the layout so your renewal note can adapt to a portrait image, sponsor proof point, or pricing module without copy collisions.\n\nThe same canvas can still export a responsive email flow for delivery.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
      {
        id: createId('el'),
        type: 'image',
        x: 450,
        y: 166,
        width: 214,
        height: 240,
        content: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
        styles: { borderRadius: 22 },
      },
      {
        id: createId('el'),
        type: 'button',
        x: margin,
        y: 432,
        width: 240,
        height: 56,
        content: 'Review renewal options',
        styles: { background: '#164e63', color: '#f8fffd', borderRadius: 999, href: '{{ctaUrl}}', fontSize: 16, fontWeight: 700 },
      },
      {
        id: createId('el'),
        type: 'html',
        x: 310,
        y: 426,
        width: 354,
        height: 124,
        content: '<div style="padding:16px;background:#fff4e7;border-radius:16px;border:1px solid rgba(204,136,52,0.18);"><strong>Offer window</strong><br><span style="color:#6b4d2b;">Locked through {{eventDate}} for {{company}}.</span></div>',
        styles: { borderRadius: 16 },
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: 592,
        width: 620,
        height: 180,
        content: 'Email export switches to a table-first responsive structure with inlined presentation styles, while ODT/DOCX export rebuilds the same blocks as editable document objects. HTML export keeps the positioned canvas exactly as seen here.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
    ],
  }
}

function createEventSheetBaseDocument(): StoredDocument {
  const margin = DEFAULT_PAPER_SIZE.margin
  return {
    name: 'Event sheet',
    description: 'Poster layout with sponsor block, routed schedule, and CTA footer.',
    wrapMode: 'strict',
    surfaceTheme: 'light',
    manualPageCount: 1,
    paperSize: { ...DEFAULT_PAPER_SIZE },
    variables: cloneData(createDefaultVariables()),
    elements: [
      {
        id: createId('el'),
        type: 'heading',
        x: margin,
        y: 50,
        width: 620,
        height: 150,
        content: 'A live summit for {{company}}.\nSeats confirmed through {{eventDate}}.',
        styles: { fontWeight: 700, fontSize: 42, color: '#1a2b3a' },
      },
      {
        id: createId('el'),
        type: 'image',
        x: 390,
        y: 210,
        width: 274,
        height: 328,
        content: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80',
        styles: { borderRadius: 28 },
      },
      {
        id: createId('el'),
        type: 'text',
        x: margin,
        y: 218,
        width: 620,
        height: 340,
        content: 'Strict mode keeps each line in the single best slot and jumps past blockers when the remaining strip would feel broken. That is useful for poster or brochure compositions where you want the text to feel deliberate rather than fragmented.\n\nMove the image and the routed schedule will keep adapting inside the same text box.',
        styles: { fontSize: 18, color: '#354a5a' },
      },
      {
        id: createId('el'),
        type: 'html',
        x: margin,
        y: 608,
        width: 280,
        height: 140,
        content: '<div style="padding:18px;background:#ecf2ff;border-radius:18px;border:1px solid rgba(46,91,175,0.16);"><strong>Sponsor module</strong><br><span style="color:#3f5684;">HTML inserts are sanitized before render and export.</span></div>',
        styles: { borderRadius: 18 },
      },
      {
        id: createId('el'),
        type: 'button',
        x: 360,
        y: 656,
        width: 304,
        height: 58,
        content: 'Reserve your seat',
        styles: { background: '#0d766e', color: '#f8fffd', borderRadius: 999, href: '{{ctaUrl}}', fontSize: 17, fontWeight: 700 },
      },
    ],
  }
}
