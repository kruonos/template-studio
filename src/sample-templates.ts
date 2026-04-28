import {
  DEFAULT_PAPER_SIZE,
  createDefaultVariables,
  type ElementStyles,
  type ElementType,
  type PaperSize,
  type Preset,
  type StoredCanvasElement,
  type StoredDocument,
  type TableData,
  type TemplateVar,
} from './schema.ts'
import { remapDocumentToPaperSize } from './paper-size.ts'
import { computeTableHeight, createTableData } from './table-engine.ts'
import { cloneData, createId } from './utils.ts'

type TextElementType = Exclude<ElementType, 'table'>

export const SAMPLE_PRESETS: Preset[] = [
  {
    id: 'product-one-pager',
    name: 'Product one-pager',
    description: 'Two-page product narrative with routed proof, mascot, metrics, and roadmap.',
    create: createProductOnePagerDocument,
  },
  {
    id: 'investor-update',
    name: 'Investor update',
    description: 'Dark quarterly memo with KPI cards, table data, image obstacles, and appendix notes.',
    create: createInvestorUpdateDocument,
  },
  {
    id: 'field-report',
    name: 'Field report',
    description: 'Editorial travel report with photo collage, quote insert, route notes, and sponsor block.',
    create: createFieldReportDocument,
  },
  {
    id: 'conference-agenda',
    name: 'Conference agenda',
    description: 'Program sheet with agenda table, floating media, sponsor modules, and CTA handoff.',
    create: createConferenceAgendaDocument,
  },
]

export function createProductOnePagerDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createProductOnePagerBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

export function createInvestorUpdateDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createInvestorUpdateBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

export function createFieldReportDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createFieldReportBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

export function createConferenceAgendaDocument(paperSize: PaperSize = DEFAULT_PAPER_SIZE): StoredDocument {
  return remapDocumentToPaperSize(createConferenceAgendaBaseDocument(), DEFAULT_PAPER_SIZE, paperSize)
}

function createProductOnePagerBaseDocument(): StoredDocument {
  const height = DEFAULT_PAPER_SIZE.height
  return createDocument({
    name: 'Product one-pager',
    description: 'A polished product launch sheet with routed long copy and proof modules.',
    wrapMode: 'freedom',
    surfaceTheme: 'light',
    manualPageCount: 2,
    variables: sampleVariables({
      company: 'Northline Studio',
      role: 'Product lead',
    }, [
      { name: 'product', label: 'Product', value: 'Signal OS' },
      { name: 'metric', label: 'Metric', value: '42 percent faster review cycles' },
    ]),
    elements: [
      text('heading', 42, 38, 620, 132, 'Launch {{product}} without surrendering layout control.', {
        fontWeight: 800,
        fontSize: 39,
        color: '#142738',
      }),
      text('html', 42, 186, 224, 98, '<div style="padding:16px;border-radius:20px;background:#eaf8f2;border:1px solid rgba(15,95,88,0.18);"><strong>Local first</strong><br><span style="color:#48606d;">No server required to author or export.</span></div>', {
        borderRadius: 20,
      }),
      text('image', 398, 170, 266, 258, 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=82', {
        borderRadius: 28,
      }),
      text('text', 42, 306, 622, 294, 'The product story can stay editorial while visual modules move freely. The image on the right, the local-first badge, and the CTA are obstacles in the same page coordinate system, so Pretext routes readable lines around them instead of letting a block-flow layout collapse.\n\nThat is useful for launch pages, PDF one-pagers, email announcements, and sales handoffs where the designer needs visual control but the final file still has to export cleanly.', {
        fontSize: 18,
        color: '#30495a',
        lineHeightMultiplier: 1.46,
      }),
      text('button', 42, 628, 238, 58, 'Open the live prototype', {
        background: '#17384f',
        color: '#f8fffd',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontSize: 16,
        fontWeight: 800,
      }),
      text('mascot', 520, 592, 112, 96, '', {
        mascotPreset: 'robot',
        mascotBehavior: 'idle',
        mascotHullMode: 'rect',
        mascotSpeech: 'Export ready',
      }),
      text('divider', 42, 734, 622, 16, '', { color: 'rgba(20,39,56,0.18)' }),
      table(42, 782, 622, [
        ['Use case', 'Why it matters', 'Export'],
        ['Launch brief', 'Images can float while text remains readable', 'HTML/PDF'],
        ['Outbound email', 'Same authored canvas can become table-safe email', 'Email HTML'],
        ['Sales handoff', 'Copy remains editable outside the editor', 'DOCX/JSON'],
      ], 42, { tableHeaderRows: 1, tableStriped: true, tableStripeColor: '#eef6f4' }),
      text('heading', 42, height + 42, 610, 104, 'How the page stays stable when the artwork moves.', {
        fontWeight: 800,
        fontSize: 34,
        color: '#142738',
      }),
      text('image', 42, height + 174, 214, 224, 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=82', {
        borderRadius: 26,
      }),
      text('text', 42, height + 164, 622, 310, 'A normal builder treats the image as a block that pushes everything after it. This studio treats the image as geometry. The text box keeps its own coordinates, then asks Pretext for the next line that fits in the open intervals around the obstacle.\n\nThe result is simple to demonstrate: drag the image through the paragraph and the paragraph adapts locally. The rest of the page keeps its shape.', {
        fontSize: 18,
        color: '#30495a',
        lineHeightMultiplier: 1.45,
      }),
      text('html', 304, height + 510, 360, 132, '<div style="padding:18px;border-radius:18px;background:#fff3e9;border:1px solid rgba(200,93,49,0.16);"><strong>{{metric}}</strong><br><span style="color:#70513e;">Example proof module for the generated sample.</span></div>', {
        borderRadius: 18,
      }),
      text('text', 42, height + 528, 240, 166, 'The sample intentionally uses more text than a landing-page hero. The point is to show that routing is not a decorative trick. It is a layout primitive that holds up when copy, art, and supporting modules all compete for space.', {
        fontSize: 16,
        color: '#435b69',
      }),
      text('button', 42, height + 748, 214, 54, 'Export sample kit', {
        background: '#0f5f58',
        color: '#f6fffd',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontWeight: 800,
        fontSize: 16,
      }),
    ],
  })
}

function createInvestorUpdateBaseDocument(): StoredDocument {
  const height = DEFAULT_PAPER_SIZE.height
  return createDocument({
    name: 'Investor update',
    description: 'A dark quarterly update with strong metrics and an appendix page.',
    wrapMode: 'normal',
    surfaceTheme: 'dark',
    manualPageCount: 2,
    emailFormat: 'legacy',
    variables: sampleVariables({
      company: 'Northline Studio',
      eventDate: 'April 30',
    }, [
      { name: 'quarter', label: 'Quarter', value: 'Q2' },
      { name: 'arr', label: 'ARR', value: '$4.8M' },
      { name: 'retention', label: 'Retention', value: '118%' },
    ]),
    elements: [
      text('heading', 42, 44, 622, 126, '{{quarter}} update\n{{company}} operating memo', {
        fontWeight: 800,
        fontSize: 37,
        color: '#f3f7fb',
      }),
      text('image', 404, 184, 260, 250, 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=82', {
        borderRadius: 26,
      }),
      text('text', 42, 190, 622, 310, 'The quarter was defined by a quieter but more durable motion: higher account expansion, faster implementation cycles, and a cleaner path from first project to recurring template usage.\n\nThe dashboard image, KPI cards, and footer callout all remain independent positioned objects. Long-form memo text routes around them without forcing the author into a rigid newsletter grid.', {
        fontSize: 18,
        color: '#cad9e5',
        lineHeightMultiplier: 1.45,
      }),
      text('html', 42, 538, 186, 112, '<div style="padding:16px;border-radius:18px;background:#112633;border:1px solid rgba(45,212,224,0.28);"><span style="color:#8fb2c4;">ARR</span><br><strong style="font-size:28px;color:#f3f7fb;">{{arr}}</strong></div>', {
        borderRadius: 18,
      }),
      text('html', 252, 538, 186, 112, '<div style="padding:16px;border-radius:18px;background:#112633;border:1px solid rgba(74,222,128,0.24);"><span style="color:#8fb2c4;">Net retention</span><br><strong style="font-size:28px;color:#f3f7fb;">{{retention}}</strong></div>', {
        borderRadius: 18,
      }),
      text('html', 462, 538, 202, 112, '<div style="padding:16px;border-radius:18px;background:#112633;border:1px solid rgba(245,159,108,0.24);"><span style="color:#8fb2c4;">Report date</span><br><strong style="font-size:28px;color:#f3f7fb;">{{eventDate}}</strong></div>', {
        borderRadius: 18,
      }),
      text('text', 42, 704, 622, 152, 'The operating goal for next quarter is simple: keep the product local-first, make export fidelity measurable, and turn the routing demo into a set of public examples that users can remix immediately.', {
        fontSize: 18,
        color: '#cad9e5',
      }),
      text('button', 42, 874, 224, 54, 'Read the full memo', {
        background: '#2dd4e0',
        color: '#071217',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontSize: 16,
        fontWeight: 800,
      }),
      text('heading', 42, height + 42, 620, 92, 'Appendix: leading indicators', {
        fontWeight: 800,
        fontSize: 34,
        color: '#f3f7fb',
      }),
      table(42, height + 166, 622, [
        ['Signal', 'Current', 'Read'],
        ['Weekly active templates', '+31 percent', 'Healthy creator repeat use'],
        ['Export completion rate', '86 percent', 'Most sessions end in a file'],
        ['Support tagged layout collapse', '-44 percent', 'Routing reduces manual fixes'],
        ['Median PDF generation', '1.8s', 'Acceptable for launch samples'],
      ], 44, { tableHeaderRows: 1, tableStriped: true, tableStripeColor: '#0f1f2b' }),
      text('image', 42, height + 438, 248, 220, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1000&q=82', {
        borderRadius: 22,
      }),
      text('text', 42, height + 438, 622, 284, 'The public launch should lead with proof, not a feature list. Show a rich document, move media through the copy, then export HTML, PDF, and email from the same authored geometry.\n\nThat one clip explains why the project is not just another page builder.', {
        fontSize: 18,
        color: '#cad9e5',
        lineHeightMultiplier: 1.45,
      }),
      text('divider', 42, height + 766, 622, 16, '', { color: 'rgba(226,244,255,0.18)' }),
      text('text', 42, height + 806, 622, 80, 'Prepared for {{company}}. Built with local storage, deterministic layout, and export paths that do not require a hosted account.', {
        fontSize: 16,
        color: '#9fb5c4',
      }),
    ],
  })
}

function createFieldReportBaseDocument(): StoredDocument {
  const height = DEFAULT_PAPER_SIZE.height
  return createDocument({
    name: 'Field report',
    description: 'An editorial sample with large photos, pull quote, itinerary, and sponsor notes.',
    wrapMode: 'freedom',
    surfaceTheme: 'light',
    manualPageCount: 2,
    variables: sampleVariables({
      company: 'Atlas Fieldworks',
      role: 'Editorial director',
    }, [
      { name: 'region', label: 'Region', value: 'Highland route' },
      { name: 'season', label: 'Season', value: 'spring field cycle' },
    ]),
    elements: [
      text('heading', 42, 42, 620, 130, '{{region}}\nA field note for {{company}}', {
        fontWeight: 800,
        fontSize: 38,
        color: '#1a2b3a',
      }),
      text('image', 42, 520, 252, 208, 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=82', {
        borderRadius: 26,
      }),
      text('image', 474, 196, 190, 190, 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=82', {
        borderRadius: 28,
      }),
      text('text', 42, 184, 622, 360, 'Editorial layouts are where freeform placement matters most. The lead photo, circular detail crop, and pull quote do not belong in a rigid column system. They are visual anchors that the text should respect without pushing the entire document out of shape.\n\nFor the {{season}}, this report keeps observations, logistics, and sponsor notes on one authored surface while still producing exportable files for review.', {
        fontSize: 18,
        color: '#354a5a',
        lineHeightMultiplier: 1.46,
      }),
      text('html', 334, 542, 330, 128, '<div style="padding:18px;border-radius:20px;background:#fff7ed;border:1px solid rgba(184,107,20,0.18);"><strong>Pull quote</strong><br><span style="color:#6d4e2d;">"The layout kept its rhythm even as the field imagery moved."</span></div>', {
        borderRadius: 20,
      }),
      text('text', 42, 760, 344, 118, 'The lead photo is a real obstacle. Move it and the text box adapts around the new geometry. The pull quote remains an independent HTML module that can be restyled or exported.', {
        fontSize: 16,
        color: '#4d6472',
      }),
      text('button', 42, 894, 214, 54, 'Download route brief', {
        background: '#9e4626',
        color: '#fffdf8',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontSize: 16,
        fontWeight: 800,
      }),
      text('mascot', 548, 790, 96, 86, '', {
        mascotPreset: 'fox',
        mascotBehavior: 'idle',
        mascotHullMode: 'rect',
        mascotSpeech: 'Local guide',
      }),
      text('heading', 42, height + 44, 620, 88, 'Route notes and publication plan', {
        fontWeight: 800,
        fontSize: 34,
        color: '#1a2b3a',
      }),
      table(42, height + 160, 622, [
        ['Stop', 'Purpose', 'Asset'],
        ['North ridge', 'Hero landscape and arrival note', 'Photo set'],
        ['Market road', 'Community detail and quote capture', 'Pull quote'],
        ['Harbor exit', 'Wrap-up copy and logistics box', 'CTA module'],
      ], 44, { tableHeaderRows: 1, tableStriped: true, tableStripeColor: '#f7efe5' }),
      text('image', 410, height + 422, 254, 244, 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=82', {
        borderRadius: 26,
      }),
      text('text', 42, height + 416, 622, 310, 'A second page can hold itinerary details without changing the mental model. It is still one coordinate system, just segmented by page height for print and PDF export.\n\nThis is the kind of sample that works well in a public repo: enough real content to prove the editor is useful, enough visual density to show why routed text exists, and no hidden server dependency.', {
        fontSize: 18,
        color: '#354a5a',
        lineHeightMultiplier: 1.46,
      }),
      text('html', 42, height + 768, 622, 94, '<div style="padding:18px;border-radius:18px;background:#edf8f6;border:1px solid rgba(15,95,88,0.14);"><strong>Publishing handoff</strong> - Export the designed HTML for web review, PDF for approvals, and email HTML for a campaign-ready digest.</div>', {
        borderRadius: 18,
      }),
    ],
  })
}

function createConferenceAgendaBaseDocument(): StoredDocument {
  const height = DEFAULT_PAPER_SIZE.height
  return createDocument({
    name: 'Conference agenda',
    description: 'A rich event program with routed agenda copy, tables, media, and sponsor placements.',
    wrapMode: 'strict',
    surfaceTheme: 'light',
    manualPageCount: 2,
    variables: sampleVariables({
      company: 'Northline Studio',
      eventDate: 'May 14',
      ctaUrl: 'https://example.com/register',
    }, [
      { name: 'venue', label: 'Venue', value: 'Pier 7 Hall' },
      { name: 'track', label: 'Track', value: 'Layout systems' },
    ]),
    elements: [
      text('heading', 42, 40, 620, 132, '{{track}} summit\n{{eventDate}} at {{venue}}', {
        fontWeight: 800,
        fontSize: 39,
        color: '#1a2b3a',
      }),
      text('image', 392, 188, 272, 302, 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1000&q=82', {
        borderRadius: 28,
      }),
      text('text', 42, 194, 622, 330, 'Event programs are a good stress test because they combine long copy, schedule tables, sponsor modules, CTAs, and photos. In strict wrap mode, text avoids awkward tiny fragments and jumps to cleaner line slots around the hero image.\n\nThe sample is designed to look like a credible launch asset, not a placeholder. It gives the public repo something people can open, inspect, drag apart, and export.', {
        fontSize: 18,
        color: '#354a5a',
        lineHeightMultiplier: 1.45,
      }),
      text('button', 42, 548, 206, 56, 'Register now', {
        background: '#0d766e',
        color: '#f8fffd',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontSize: 16,
        fontWeight: 800,
      }),
      text('html', 292, 548, 372, 118, '<div style="padding:18px;border-radius:18px;background:#ecf2ff;border:1px solid rgba(46,91,175,0.16);"><strong>For builders and designers</strong><br><span style="color:#3f5684;">A one-day program on authoring, export fidelity, and local-first tooling.</span></div>', {
        borderRadius: 18,
      }),
      table(42, 708, 622, [
        ['Time', 'Session', 'Lead'],
        ['09:30', 'Opening: geometry-first documents', '{{role}}'],
        ['11:00', 'Routed text around real media', 'Pretext team'],
        ['13:30', 'Email export without authoring pain', 'Delivery panel'],
        ['15:15', 'Public repo walkthrough and Q&A', '{{company}}'],
      ], 42, { tableHeaderRows: 1, tableStriped: true, tableStripeColor: '#eef6f4' }),
      text('heading', 42, height + 42, 620, 100, 'Sponsor-ready second page', {
        fontWeight: 800,
        fontSize: 34,
        color: '#1a2b3a',
      }),
      text('image', 42, height + 178, 218, 218, 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=82', {
        borderRadius: 26,
      }),
      text('text', 42, height + 168, 622, 292, 'The second page leaves room for sponsor placements, venue logistics, and post-event resources. It also gives you a useful screenshot angle for social posts: the image is inside the text region, but the text owns the line-breaking behavior.\n\nThat is the story to show publicly. Not "another editor", but a different layout primitive.', {
        fontSize: 18,
        color: '#354a5a',
        lineHeightMultiplier: 1.45,
      }),
      text('html', 42, height + 504, 286, 140, '<div style="padding:18px;border-radius:20px;background:#fff4e7;border:1px solid rgba(204,136,52,0.18);"><strong>Venue note</strong><br><span style="color:#6b4d2b;">Doors open at 9:00. Breakfast and badge pickup run until the keynote.</span></div>', {
        borderRadius: 20,
      }),
      text('html', 360, height + 504, 304, 140, '<div style="padding:18px;border-radius:20px;background:#edf8f6;border:1px solid rgba(15,95,88,0.16);"><strong>Public repo demo</strong><br><span style="color:#476273;">Templates, exports, and routed text examples are available offline.</span></div>', {
        borderRadius: 20,
      }),
      text('button', 42, height + 720, 254, 56, 'Get the sample files', {
        background: '#17384f',
        color: '#f8fffd',
        borderRadius: 999,
        href: '{{ctaUrl}}',
        fontSize: 16,
        fontWeight: 800,
      }),
      text('divider', 42, height + 828, 622, 16, '', { color: 'rgba(13,33,48,0.16)' }),
      text('text', 42, height + 860, 622, 70, 'Prepared for {{company}}. Optimized for screenshots, PDF proofing, and email-safe export experiments.', {
        fontSize: 16,
        color: '#5f7180',
      }),
    ],
  })
}

function createDocument(options: Omit<StoredDocument, 'paperSize'>): StoredDocument {
  return {
    ...options,
    paperSize: { ...DEFAULT_PAPER_SIZE },
  }
}

function text(
  type: TextElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  content: string,
  styles: ElementStyles = {},
): StoredCanvasElement {
  return {
    id: createId('el'),
    type,
    x,
    y,
    width,
    height,
    content,
    styles,
  } as StoredCanvasElement
}

function table(
  x: number,
  y: number,
  width: number,
  rows: string[][],
  rowHeight = 38,
  styles: ElementStyles = {},
): StoredCanvasElement {
  const data = createSampleTable(rows, width, rowHeight)
  return {
    id: createId('el'),
    type: 'table',
    x,
    y,
    width,
    height: computeTableHeight(data),
    content: data,
    styles,
  }
}

function createSampleTable(rows: string[][], width: number, rowHeight: number): TableData {
  const cols = rows.reduce((max, row) => Math.max(max, row.length), 1)
  const data = createTableData(rows.length, cols, width, rowHeight)
  data.headerRows = rows.length > 1 ? 1 : 0
  data.defaultBorder = { width: 1, color: '#c9d3dc', style: 'solid' }
  data.rowHeights = data.rowHeights.map((_, index) => index === 0 ? Math.max(34, rowHeight) : rowHeight)
  data.cells = data.cells.map(cell => {
    const content = rows[cell.row]?.[cell.col] ?? ''
    const isHeader = cell.row === 0
    const styles = {
      ...cell.styles,
      padding: 8,
      fontSize: isHeader ? 12 : 13,
      fontWeight: isHeader ? 800 : 500,
      color: isHeader ? '#17384f' : '#354a5a',
    }
    if (isHeader) styles.background = '#dcebe8'
    return {
      ...cell,
      content,
      styles,
    }
  })
  return data
}

function sampleVariables(overrides: Record<string, string>, extra: TemplateVar[] = []): TemplateVar[] {
  const base = cloneData(createDefaultVariables()).map(variable => ({
    ...variable,
    value: overrides[variable.name] ?? variable.value,
  }))
  return [...base, ...extra]
}
