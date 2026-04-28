import type { CanvasElement, MascotPreset } from './schema.ts'

export type MascotPresetDefinition = {
  label: string
  svg: string
  defaultWidth: number
  defaultHeight: number
}

export const MASCOT_PRESETS: Record<MascotPreset, MascotPresetDefinition> = {
  dragon: {
    label: 'Dragon',
    defaultWidth: 180, defaultHeight: 108,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="dragonGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ff6b35"/><stop offset="50%" style="stop-color:#f7c59f"/><stop offset="100%" style="stop-color:#ff6b35"/></linearGradient></defs><path d="M10 30 Q20 10 40 15 Q60 5 80 20 Q95 30 85 40 Q75 50 60 45 Q40 55 25 40 Q15 35 10 30" fill="url(#dragonGrad)"/><ellipse cx="35" cy="32" rx="3" ry="2" fill="#2a1a0a"/><path d="M75 25 Q85 20 90 25 Q85 30 75 28" fill="#ff8c42"/><path d="M5 30 Q-5 25 0 35 Q5 40 10 35" stroke="#ff6b35" stroke-width="2" fill="none"/><path d="M50 20 L55 5 L60 20" fill="#ff8c42"/></svg>`,
  },
  cat: {
    label: 'Cat',
    defaultWidth: 80, defaultHeight: 80,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M25 25l-8-20c-1-2 0-4 2-4l12 10zM75 25l8-20c1-2 0-4-2-4l-12 10z" fill="#f39c12" stroke="#d68910" stroke-width="2"/><ellipse cx="50" cy="52" rx="28" ry="32" fill="#f39c12" stroke="#d68910" stroke-width="2"/><ellipse cx="50" cy="52" rx="20" ry="24" fill="#fdebd0" stroke="none"/><circle cx="40" cy="42" r="5" fill="#2c3e50"/><circle cx="40" cy="41" r="2" fill="#fff"/><circle cx="60" cy="42" r="5" fill="#2c3e50"/><circle cx="60" cy="41" r="2" fill="#fff"/><ellipse cx="50" cy="52" rx="4" ry="3" fill="#e74c3c"/><path d="M46 55c2 2 6 2 8 0" stroke="#d68910" stroke-width="1.5"/><path d="M30 50l-16 2M30 54l-14 6M70 50l16 2M70 54l14 6" stroke="#d68910" stroke-width="1"/><path d="M42 80l-3 12c0 2 1 3 3 3h3l2-10M58 80l3 12c0 2-1 3-3 3h-3l-2-10" stroke="#d68910" stroke-width="1.5" fill="#f39c12"/><path d="M72 65c4 6 8 12 16 14" stroke="#f39c12" stroke-width="3"/></g></svg>`,
  },
  bird: {
    label: 'Bird',
    defaultWidth: 90, defaultHeight: 70,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="45" rx="25" ry="22" fill="#3498db" stroke="#2980b9" stroke-width="2"/><circle cx="50" cy="30" r="16" fill="#3498db" stroke="#2980b9" stroke-width="2"/><circle cx="44" cy="27" r="4" fill="#fff" stroke="#2980b9" stroke-width="1"/><circle cx="44" cy="27" r="2" fill="#2c3e50"/><circle cx="56" cy="27" r="4" fill="#fff" stroke="#2980b9" stroke-width="1"/><circle cx="56" cy="27" r="2" fill="#2c3e50"/><path d="M46 35l4 4 4-4" stroke="#e67e22" stroke-width="2" fill="#e67e22"/><path d="M25 38c-14-4-22 2-24 8 6-2 14-1 20 4" fill="#2980b9" stroke="#2471a3" stroke-width="1.5"/><path d="M75 38c14-4 22 2 24 8-6-2-14-1-20 4" fill="#2980b9" stroke="#2471a3" stroke-width="1.5"/><ellipse cx="50" cy="50" rx="12" ry="10" fill="#85c1e9" stroke="none"/><path d="M42 65l-2 10c0 1 1 2 2 2h3l2-8M58 65l2 10c0 1-1 2-2 2h-3l-2-8" stroke="#e67e22" stroke-width="1.5" fill="#e67e22"/></g></svg>`,
  },
  robot: {
    label: 'Robot',
    defaultWidth: 80, defaultHeight: 90,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="25" y="30" width="50" height="40" rx="8" fill="#95a5a6" stroke="#7f8c8d" stroke-width="2"/><rect x="30" y="75" width="15" height="18" rx="4" fill="#7f8c8d" stroke="#6c7a7d" stroke-width="1.5"/><rect x="55" y="75" width="15" height="18" rx="4" fill="#7f8c8d" stroke="#6c7a7d" stroke-width="1.5"/><rect x="32" y="12" width="36" height="26" rx="6" fill="#bdc3c7" stroke="#95a5a6" stroke-width="2"/><line x1="50" y1="4" x2="50" y2="12" stroke="#95a5a6" stroke-width="2"/><circle cx="50" cy="3" r="3" fill="#e74c3c"/><rect x="38" y="20" width="8" height="8" rx="2" fill="#2ecc71" stroke="#27ae60" stroke-width="1"/><rect x="54" y="20" width="8" height="8" rx="2" fill="#2ecc71" stroke="#27ae60" stroke-width="1"/><rect x="40" y="44" width="20" height="6" rx="3" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="1"/><line x1="44" y1="44" x2="44" y2="50" stroke="#bdc3c7" stroke-width="1"/><line x1="50" y1="44" x2="50" y2="50" stroke="#bdc3c7" stroke-width="1"/><line x1="56" y1="44" x2="56" y2="50" stroke="#bdc3c7" stroke-width="1"/><path d="M20 40l-8 6 0 12 8 6" stroke="#7f8c8d" stroke-width="2"/><path d="M80 40l8 6 0 12-8 6" stroke="#7f8c8d" stroke-width="2"/></g></svg>`,
  },
  fox: {
    label: 'Fox',
    defaultWidth: 90, defaultHeight: 90,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 28l-6-22c-1-2 1-4 3-3l14 14z" fill="#e67e22" stroke="#d35400" stroke-width="2"/><path d="M78 28l6-22c1-2-1-4-3-3l-14 14z" fill="#e67e22" stroke="#d35400" stroke-width="2"/><ellipse cx="50" cy="50" rx="30" ry="34" fill="#e67e22" stroke="#d35400" stroke-width="2"/><path d="M50 80c-8 0-18-4-22-10 4 2 10 3 16 2l6 2 6-2c6 1 12 0 16-2-4 6-14 10-22 10z" fill="#fff" stroke="#d35400" stroke-width="1"/><path d="M30 40c0-6 8-10 20-10s20 4 20 10" fill="#fdebd0" stroke="none"/><circle cx="38" cy="42" r="5" fill="#2c3e50"/><circle cx="38" cy="41" r="2" fill="#fff"/><circle cx="62" cy="42" r="5" fill="#2c3e50"/><circle cx="62" cy="41" r="2" fill="#fff"/><ellipse cx="50" cy="52" rx="5" ry="3" fill="#2c3e50"/><path d="M45 56c2 3 8 3 10 0" stroke="#d35400" stroke-width="1.5"/><path d="M42 82l-3 12c0 2 1 3 3 3h3l2-10M58 82l3 12c0 2-1 3-3 3h-3l-2-10" stroke="#d35400" stroke-width="1.5" fill="#e67e22"/><path d="M74 60c6 6 14 14 20 14" stroke="#e67e22" stroke-width="4"/><path d="M90 74c2 0 4-2 2-4" stroke="#fff" stroke-width="3"/></g></svg>`,
  },
  custom: {
    label: 'Custom',
    defaultWidth: 80, defaultHeight: 80,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="12" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/><text x="50" y="58" text-anchor="middle" font-size="24" fill="#95a5a6">?</text></svg>`,
  },
}

export type MascotAnimState = {
  elementId: string
  pathProgress: number
  currentWaypoint: number
  direction: 1 | -1
  bobPhase: number
  baseX: number
  baseY: number
}

export type MascotWaypoint = { x: number; y: number }

export function svgMarkupToDataUrl(markup: string): string {
  return `data:image/svg+xml,${encodeURIComponent(markup)}`
}

export function getMascotPresetSource(preset: MascotPreset): string {
  return svgMarkupToDataUrl((MASCOT_PRESETS[preset] ?? MASCOT_PRESETS.dragon).svg)
}

export function getMascotPresetLabel(element: CanvasElement): string {
  const preset = (element.styles.mascotPreset ?? 'dragon') as MascotPreset
  return MASCOT_PRESETS[preset]?.label ?? 'Mascot'
}
