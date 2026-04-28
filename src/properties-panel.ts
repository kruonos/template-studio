import { MASCOT_PRESETS } from './mascots.ts'
import {
  COLOR_SWATCHES,
  FONT_CHOICES,
  type CanvasElement,
  type MascotPreset,
  type StudioState,
  type TextProjection,
} from './schema.ts'
import { getElementFontFamily, getElementFontSize, getElementTextColor } from './element-typography.ts'
import { getDefaultBackground, getDefaultBorderRadius } from './theme.ts'
import { cellAddress, getCell, getSelectionRange, parseTableData } from './table-engine.ts'
import type { TableCellSelectionState } from './table-ui.ts'
import {
  capitalize,
  escapeAttribute,
  escapeHtml,
  isInlineEditableType,
  isTextBlock,
  isTextualElement,
  toHexColor,
} from './utils.ts'

type RenderPropertiesPanelOptions = {
  target: HTMLDivElement
  state: StudioState
  element: CanvasElement | null
  projection: TextProjection | null
  pageHeight: number
  tableSelection: TableCellSelectionState | null
}

export function renderPropertiesPanel(options: RenderPropertiesPanelOptions): void {
  const { element, pageHeight, projection, state, tableSelection, target } = options

  if (element === null) {
    target.className = ''
    target.innerHTML = `
      <div class="prop-group">
        <h3>Template</h3>
        <div class="helper">Select an element to edit its content, fit its box, or open the inline editor. Text and heading blocks use Pretext for line routing inside the current page layout.</div>
      </div>
      <div class="prop-group">
        <h3>Email Export</h3>
        <div class="prop-field">
          <label>Format</label>
          <select class="prop-input" data-template-prop="emailFormat">
            <option value="legacy"${state.emailFormat === 'legacy' ? ' selected' : ''}>Sliced tables (recommended)</option>
            <option value="mjml"${state.emailFormat === 'mjml' ? ' selected' : ''}>MJML wrapper (best-effort)</option>
          </select>
        </div>
        <div class="helper" style="margin-top:10px;">Pretext stays editor-only. Email export captures the routed snapshot, then rebuilds it as fixed sliced-table HTML. The MJML option wraps that same geometry to stay as close as possible to canvas output.</div>
      </div>
    `
    return
  }

  const isInlineEditable = isInlineEditableType(element.type)
  target.className = ''

  const contentFieldHtml = (() => {
    if (element.type === 'image' || element.type === 'video') {
      return `
        <div class="prop-field">
          <label>${element.type === 'image' ? 'Image source' : 'Video URL'}</label>
          <input class="prop-input" data-prop="source" value="${escapeAttribute(element.content)}" placeholder="${element.type === 'image' ? 'Paste image URL or upload file' : 'Paste YouTube or Vimeo URL'}">
        </div>
      `
    }
    if (element.type === 'animated-gif') {
      return `
        <div class="prop-field">
          <label>Animated visual source</label>
          <input class="prop-input" data-prop="source" value="${escapeAttribute(element.content)}" placeholder="Upload GIF, SVG, JSON, or paste data URL">
        </div>
        <div class="helper">GIFs, SVGs, and supported vector JSON files are rendered on canvas and follow traced paths. Text flows around them in real time.</div>
      `
    }
    if (element.type === 'mascot') {
      const preset = (element.styles.mascotPreset ?? 'dragon') as MascotPreset
      return preset === 'custom'
        ? `
          <div class="prop-field">
            <label>Media source</label>
            <input class="prop-input" data-prop="source" value="${escapeAttribute(element.content)}" placeholder="Paste GIF, PNG, SVG, JSON, or WebP URL">
          </div>
          <div class="helper">Custom mascots can be pasted as a URL or uploaded from disk. GIFs, SVGs, and supported vector JSON files stay portable through canvas and export.</div>
        `
        : `
          <div class="helper">Preset mascots use built-in artwork. Switch the preset to <strong>Custom</strong> to upload your own GIF, PNG, SVG, JSON, or WebP.</div>
        `
    }
    if (element.type === 'html') {
      return `
        <div class="prop-field">
          <label>HTML content</label>
          <textarea class="prop-textarea" data-prop="content">${escapeHtml(element.content)}</textarea>
        </div>
        <div class="helper">HTML blocks are sanitized before rendering and export. Script tags, event handlers, and unsafe URLs are stripped.</div>
      `
    }
    if (element.type === 'table') {
      const sel = tableSelection?.elementId === element.id ? tableSelection.selection : null
      if (sel !== null && sel.anchorRow === sel.focusRow && sel.anchorCol === sel.focusCol) {
        const tableData = parseTableData(element.content)
        const cell = tableData !== null ? getCell(tableData, sel.anchorRow, sel.anchorCol) : null
        const cellContent = cell?.content ?? ''
        return `
          <div class="prop-field">
            <label>Cell ${cellAddress(sel.anchorRow, sel.anchorCol)} content</label>
            <textarea class="prop-textarea" data-prop="table-cell-content">${escapeHtml(cellContent)}</textarea>
          </div>
          <div class="helper">Edit cell content here or double-click the cell on canvas. Use {{=SUM(A1:A3)}} for formulas.</div>
        `
      }
      return `
        <div class="helper">Select a cell to edit its content, or double-click a cell on canvas. The table data is managed through the Table controls below.</div>
      `
    }
    return `
      <div class="prop-field">
        <label>Content</label>
        <textarea class="prop-textarea" data-prop="content">${escapeHtml(element.content)}</textarea>
      </div>
    `
  })()

  const variableChips = isInlineEditable
    ? `<div class="chip-row">${state.variables.map(variable => `<button class="surface-chip" data-action="insert-variable" data-variable-name="${variable.name}">{{${escapeHtml(variable.name)}}}</button>`).join('')}</div>`
    : ''

  target.innerHTML = `
    <div class="prop-group">
      <h3>${capitalize(element.type)}</h3>
      <div class="helper">ID: <code>${escapeHtml(element.id)}</code> · Page ${Math.floor(element.y / pageHeight) + 1}</div>
      ${projection?.truncated === true ? '<div class="helper" style="margin-top:8px;color:var(--accent-warm);">This text box is clipping content. Use “Fit height” or resize it.</div>' : ''}
    </div>

    <div class="prop-group">
      <h3>Geometry</h3>
      <div class="prop-grid">
        <div class="prop-field"><label>X</label><input class="prop-input" data-prop="x" value="${Math.round(element.x)}"></div>
        <div class="prop-field"><label>Y</label><input class="prop-input" data-prop="y" value="${Math.round(element.y)}"></div>
        <div class="prop-field"><label>Width</label><input class="prop-input" data-prop="width" value="${Math.round(element.width)}"></div>
        <div class="prop-field"><label>Height</label><input class="prop-input" data-prop="height" value="${Math.round(element.height)}"></div>
      </div>
      <div class="prop-field" style="margin-top:10px;">
        <label>Opacity · ${Math.round((element.styles.opacity ?? 1) * 100)}%</label>
        <input class="prop-input" type="range" min="0" max="1" step="0.05" data-prop="opacity" value="${element.styles.opacity ?? 1}" style="width:100%;height:6px;">
      </div>
    </div>

    <div class="prop-group">
      <h3>Content</h3>
      ${contentFieldHtml}
      ${variableChips}
    </div>

    ${isTextualElement(element.type) ? `
      <div class="prop-group">
        <h3>Typography</h3>
        <div class="prop-grid">
          <div class="prop-field">
            <label>Font family</label>
            <select class="prop-input" data-prop="fontFamily">
              ${FONT_CHOICES.map(font => `<option value="${escapeAttribute(font)}"${getElementFontFamily(element) === font ? ' selected' : ''}>${escapeHtml(font)}</option>`).join('')}
            </select>
          </div>
          <div class="prop-field">
            <label>Font size</label>
            <input class="prop-input" data-prop="fontSize" value="${getElementFontSize(element)}">
          </div>
          <div class="prop-field">
            <label>Text color</label>
            <div class="prop-color-row">
              <input type="color" class="prop-color-native" data-prop="color" value="${toHexColor(element.styles.color ?? getElementTextColor(element, state.surfaceTheme))}">
              <input class="prop-input" data-prop="color" value="${escapeAttribute(element.styles.color ?? getElementTextColor(element, state.surfaceTheme))}">
            </div>
          </div>
          <div class="prop-field">
            <label>Background</label>
            <div class="prop-color-row">
              <input type="color" class="prop-color-native" data-prop="background" value="${toHexColor(element.styles.background ?? (element.type === 'button' ? '#17384f' : '#ffffff'))}">
              <input class="prop-input" data-prop="background" value="${escapeAttribute(element.styles.background ?? (element.type === 'button' ? '#17384f' : 'transparent'))}">
            </div>
          </div>
        </div>
        <div class="color-swatches">${COLOR_SWATCHES.map(color => `<button class="color-swatch" data-swatch-color="${color}" style="background:${color};" title="${color}"></button>`).join('')}</div>
        <div class="prop-grid" style="margin-top:10px;">
          <div class="prop-field">
            <label>Line height · ${(element.styles.lineHeightMultiplier ?? 1.3).toFixed(2)}×</label>
            <input class="prop-input" type="range" min="0.8" max="3" step="0.05" data-prop="lineHeightMultiplier" value="${element.styles.lineHeightMultiplier ?? 1.3}" style="width:100%;height:6px;">
          </div>
          <div class="prop-field">
            <label>Letter spacing</label>
            <input class="prop-input" data-prop="letterSpacing" value="${element.styles.letterSpacing ?? 0}">
          </div>
          <div class="prop-field">
            <label>Word break</label>
            <select class="prop-input" data-prop="wordBreak">
              <option value="normal"${(element.styles.wordBreak ?? 'normal') === 'normal' ? ' selected' : ''}>Normal</option>
              <option value="keep-all"${element.styles.wordBreak === 'keep-all' ? ' selected' : ''}>Keep-all</option>
            </select>
          </div>
        </div>
        <div class="align-row" style="margin-top:10px;">
          <button class="surface-chip${(element.styles.textAlign ?? 'left') === 'left' ? ' success' : ''}" data-action="set-align-left">Align left</button>
          <button class="surface-chip${(element.styles.textAlign ?? 'left') === 'center' ? ' success' : ''}" data-action="set-align-center">Align center</button>
          <button class="surface-chip${(element.styles.textAlign ?? 'left') === 'right' ? ' success' : ''}" data-action="set-align-right">Align right</button>
        </div>
      </div>
    ` : ''}

    ${(element.type === 'button' || element.type === 'image' || element.type === 'html') ? `
      <div class="prop-group">
        <h3>Appearance</h3>
        <div class="prop-grid">
          <div class="prop-field"><label>Background</label>
            <div class="prop-color-row">
              <input type="color" class="prop-color-native" data-prop="background" value="${toHexColor(element.styles.background ?? getDefaultBackground(element.type, state.surfaceTheme))}">
              <input class="prop-input" data-prop="background" value="${escapeAttribute(element.styles.background ?? getDefaultBackground(element.type, state.surfaceTheme))}">
            </div>
          </div>
          <div class="prop-field"><label>Radius</label><input class="prop-input" data-prop="borderRadius" value="${element.styles.borderRadius ?? getDefaultBorderRadius(element.type)}"></div>
          ${element.type === 'button' ? `<div class="prop-field"><label>Link URL</label><input class="prop-input" data-prop="href" value="${escapeAttribute(element.styles.href ?? '')}"></div>` : ''}
        </div>
      </div>
    ` : ''}

    ${element.type === 'mascot' ? `
      <div class="prop-group">
        <h3>Mascot · Interactive Character</h3>
        <div class="prop-grid">
          <div class="prop-field">
            <label>Preset</label>
            <select class="prop-input" data-prop="mascotPreset">
              ${(Object.keys(MASCOT_PRESETS) as MascotPreset[]).map(key => `<option value="${key}"${(element.styles.mascotPreset ?? 'dragon') === key ? ' selected' : ''}>${MASCOT_PRESETS[key].label}</option>`).join('')}
            </select>
          </div>
          <div class="prop-field">
            <label>Behavior</label>
            <select class="prop-input" data-prop="mascotBehavior">
              <option value="idle"${(element.styles.mascotBehavior ?? 'idle') === 'idle' ? ' selected' : ''}>Idle (stays in place)</option>
              <option value="patrol"${(element.styles.mascotBehavior ?? 'idle') === 'patrol' ? ' selected' : ''}>Patrol (loop path)</option>
              <option value="bounce"${(element.styles.mascotBehavior ?? 'idle') === 'bounce' ? ' selected' : ''}>Bounce (ping-pong path)</option>
              <option value="orbit"${(element.styles.mascotBehavior ?? 'idle') === 'orbit' ? ' selected' : ''}>Orbit (circular)</option>
              <option value="wander"${(element.styles.mascotBehavior ?? 'idle') === 'wander' ? ' selected' : ''}>Wander (random walk)</option>
            </select>
          </div>
        </div>
        <div class="prop-field" style="margin-top:10px;">
          <label>Speed · ${(element.styles.mascotSpeed ?? 1).toFixed(1)}×</label>
          <input class="prop-input" type="range" min="0.1" max="5" step="0.1" data-prop="mascotSpeed" value="${element.styles.mascotSpeed ?? 1}" style="width:100%;height:6px;">
        </div>
        <div class="prop-field" style="margin-top:10px;">
          <label>Speech bubble</label>
          <input class="prop-input" data-prop="mascotSpeech" value="${escapeAttribute(element.styles.mascotSpeech ?? '')}" placeholder="What does the mascot say?">
        </div>
        <div class="prop-field" style="margin-top:10px;">
          <label>Wrap mode</label>
          <select class="prop-input" data-prop="mascotHullMode">
            <option value="rect"${(element.styles.mascotHullMode ?? 'rect') === 'rect' ? ' selected' : ''}>Bounding box</option>
            <option value="silhouette"${(element.styles.mascotHullMode ?? 'rect') === 'silhouette' ? ' selected' : ''}>Silhouette (tight wrap)</option>
          </select>
        </div>
        ${(element.styles.mascotPreset ?? 'dragon') === 'custom' ? `
          <div class="prop-field" style="margin-top:10px;">
            <label>Custom image URL</label>
            <input class="prop-input" data-prop="source" value="${escapeAttribute(element.content)}" placeholder="Paste GIF, PNG, SVG, or JSON URL">
          </div>
        ` : ''}
        <div class="helper" style="margin-top:10px;">The mascot acts as an obstacle — Pretext text routing flows around it in real time. Change behavior to see it animate along its path.</div>
        <div class="prop-actions" style="margin-top:10px;">
          <button class="surface-chip success" data-action="upload-image">Upload media</button>
          <button class="surface-chip" data-action="trace-mascot-path">Draw Path</button>
          <button class="surface-chip" data-action="reset-mascot-path">Reset path</button>
          <button class="surface-chip" data-action="add-mascot-waypoint">Add waypoint</button>
          <button class="surface-chip" data-action="clear-mascot-path">Clear Path</button>
        </div>
      </div>
    ` : ''}

    ${element.type === 'animated-gif' ? `
      <div class="prop-group">
        <h3>Animated Visual · Path Follower</h3>
        <div class="prop-grid">
          <div class="prop-field">
            <label>Behavior</label>
            <select class="prop-input" data-prop="gifBehavior">
              <option value="static"${(element.styles.gifBehavior ?? 'static') === 'static' ? ' selected' : ''}>Static (stays in place)</option>
              <option value="path-loop"${(element.styles.gifBehavior ?? 'static') === 'path-loop' ? ' selected' : ''}>Loop path</option>
              <option value="path-bounce"${(element.styles.gifBehavior ?? 'static') === 'path-bounce' ? ' selected' : ''}>Bounce path</option>
              <option value="path-once"${(element.styles.gifBehavior ?? 'static') === 'path-once' ? ' selected' : ''}>Play once</option>
            </select>
          </div>
          <div class="prop-field">
            <label>Wrap mode</label>
            <select class="prop-input" data-prop="gifHullMode">
              <option value="rect"${(element.styles.gifHullMode ?? 'rect') === 'rect' ? ' selected' : ''}>Bounding box</option>
              <option value="silhouette"${(element.styles.gifHullMode ?? 'rect') === 'silhouette' ? ' selected' : ''}>Silhouette (tight wrap)</option>
            </select>
          </div>
        </div>
        <div class="prop-field" style="margin-top:10px;">
          <label>Speed · ${(element.styles.gifSpeed ?? 1).toFixed(1)}×</label>
          <input class="prop-input" type="range" min="0.1" max="5" step="0.1" data-prop="gifSpeed" value="${element.styles.gifSpeed ?? 1}" style="width:100%;height:6px;">
        </div>
        <div class="prop-field" style="margin-top:10px;">
          <label>Radius</label>
          <input class="prop-input" data-prop="borderRadius" value="${element.styles.borderRadius ?? 0}">
        </div>
        ${element.styles.gifFrameCount !== undefined ? `<div class="helper" style="margin-top:10px;">${element.styles.gifFrameCount} frames · ${Math.round(element.styles.gifDuration ?? 0)}ms</div>` : ''}
        <div class="helper" style="margin-top:10px;">GIFs, SVGs, and vector JSON files follow traced bezier paths and act as dynamic obstacles for Pretext text routing.</div>
        <div class="prop-actions" style="margin-top:10px;">
          <button class="surface-chip success" data-action="upload-gif">Upload GIF / SVG / JSON</button>
          <button class="surface-chip" data-action="trace-gif-path">Draw Path</button>
          <button class="surface-chip" data-action="clear-gif-path">Clear Path</button>
        </div>
      </div>
    ` : ''}

    ${element.type === 'table' ? (() => {
      const tableData = parseTableData(element.content)
      const rows = tableData?.rows ?? 0
      const cols = tableData?.cols ?? 0
      const hasHeader = (element.styles.tableHeaderRows ?? 0) > 0
      const isStriped = element.styles.tableStriped === true
      const hasSel = tableSelection?.elementId === element.id
      const selRange = hasSel ? getSelectionRange(tableSelection!.selection) : null
      const selIsSingle = selRange !== null && selRange.r1 === selRange.r2 && selRange.c1 === selRange.c2
      const selIsMulti = selRange !== null && (selRange.r1 !== selRange.r2 || selRange.c1 !== selRange.c2)
      const selectedRowHeight = selRange !== null && tableData !== null ? tableData.rowHeights[selRange.r1] ?? 32 : 32
      return `
      <div class="prop-group">
        <h3>Table · ${rows}×${cols}</h3>
        ${hasSel ? `<div class="helper">Selected: ${selIsSingle ? cellAddress(selRange!.r1, selRange!.c1) : `${cellAddress(selRange!.r1, selRange!.c1)}:${cellAddress(selRange!.r2, selRange!.c2)}`}</div>` : ''}
        <div class="prop-actions" style="margin-top:8px;">
          <button class="surface-chip" data-action="table-add-row-after">+ Row after</button>
          <button class="surface-chip" data-action="table-add-row-before">+ Row before</button>
          <button class="surface-chip" data-action="table-add-col-after">+ Col after</button>
          <button class="surface-chip" data-action="table-add-col-before">+ Col before</button>
        </div>
        ${hasSel ? `
          <div class="prop-actions" style="margin-top:6px;">
            <button class="surface-chip warning" data-action="table-remove-row">Remove row</button>
            <button class="surface-chip warning" data-action="table-remove-col">Remove col</button>
            ${selIsMulti ? `<button class="surface-chip" data-action="table-merge-cells">Merge cells</button>` : ''}
            ${selIsSingle ? `<button class="surface-chip" data-action="table-split-cell">Split cell</button>` : ''}
          </div>
          <div class="prop-grid" style="margin-top:8px;">
            <div class="prop-field">
              <label>Row height (px)</label>
              <input class="prop-input" data-prop="table-row-height" value="${Math.round(selectedRowHeight)}">
            </div>
          </div>
        ` : ''}
        <div class="prop-actions" style="margin-top:8px;">
          <button class="surface-chip${hasHeader ? ' success' : ''}" data-action="table-toggle-header">${hasHeader ? 'Header ON' : 'Header OFF'}</button>
          <button class="surface-chip${isStriped ? ' success' : ''}" data-action="table-toggle-striped">${isStriped ? 'Striped ON' : 'Striped OFF'}</button>
          <button class="surface-chip" data-action="table-fit-height">Fit height</button>
        </div>
        <div class="prop-grid" style="margin-top:10px;">
          <div class="prop-field">
            <label>Border width</label>
            <input class="prop-input" type="number" min="0" max="10" step="1" data-prop="table-border-width" value="${tableData?.defaultBorder.width ?? 1}">
          </div>
          <div class="prop-field">
            <label>Border color</label>
            <input class="prop-input" type="color" data-prop="table-border-color" value="${tableData?.defaultBorder.color ?? '#c0c8d0'}">
          </div>
        </div>
        <div class="prop-field" style="margin-top:6px;">
          <label>Border style</label>
          <select class="prop-input" data-prop="table-border-style">
            <option value="solid"${(tableData?.defaultBorder.style ?? 'solid') === 'solid' ? ' selected' : ''}>Solid</option>
            <option value="dashed"${tableData?.defaultBorder.style === 'dashed' ? ' selected' : ''}>Dashed</option>
            <option value="dotted"${tableData?.defaultBorder.style === 'dotted' ? ' selected' : ''}>Dotted</option>
            <option value="none"${tableData?.defaultBorder.style === 'none' ? ' selected' : ''}>None</option>
          </select>
        </div>
        <div class="helper" style="margin-top:10px;">Click a cell to select it, double-click to edit. Shift+click to select a range. Drag column/row borders to resize. The whole table acts as an obstacle for surrounding text.</div>
      </div>
    `})() : ''}

    ${state.selectedIds.size > 1 ? `
      <div class="prop-group">
        <h3>Alignment · ${state.selectedIds.size} elements</h3>
        <div class="align-toolbar">
          <button class="surface-chip" data-action="align-left" title="Align left edges">⫷ Left</button>
          <button class="surface-chip" data-action="align-center-h" title="Align horizontal centers">⫿ Center</button>
          <button class="surface-chip" data-action="align-right" title="Align right edges">⫸ Right</button>
          <button class="surface-chip" data-action="align-top" title="Align top edges">⏶ Top</button>
          <button class="surface-chip" data-action="align-center-v" title="Align vertical centers">⏸ Middle</button>
          <button class="surface-chip" data-action="align-bottom" title="Align bottom edges">⏷ Bottom</button>
        </div>
        ${state.selectedIds.size >= 3 ? `<div class="align-toolbar" style="margin-top:6px;">
          <button class="surface-chip" data-action="distribute-h" title="Distribute horizontally">⟷ Distribute H</button>
          <button class="surface-chip" data-action="distribute-v" title="Distribute vertically">⟷ Distribute V</button>
        </div>` : ''}
      </div>
    ` : ''}

    <div class="prop-group">
      <h3>Actions</h3>
      <div class="prop-actions">
        ${isInlineEditable ? '<button class="surface-chip success" data-action="open-inline-editor">Inline edit</button>' : ''}
        ${(isTextBlock(element.type) || element.type === 'button') ? '<button class="surface-chip" data-action="fit-width">Fit width</button>' : ''}
        ${isTextBlock(element.type) ? '<button class="surface-chip" data-action="fit-height">Fit height</button>' : ''}
        ${(element.type === 'image' || element.type === 'mascot' || element.type === 'animated-gif') ? `<button class="surface-chip" data-action="upload-image">${element.type === 'mascot' ? 'Upload media' : element.type === 'animated-gif' ? 'Upload GIF / SVG' : 'Upload image'}</button>` : ''}
        ${element.type === 'html' ? '<button class="surface-chip warning" data-action="remove-html">Clear HTML</button>' : ''}
        <button class="surface-chip${element.locked ? ' warning' : ''}" data-action="toggle-lock">${element.locked ? 'Unlock' : 'Lock'}</button>
        <button class="surface-chip" data-action="duplicate-element">Duplicate</button>
        <button class="surface-chip danger" data-action="delete-element">Delete</button>
      </div>
    </div>
  `
}
