/**
 * icons.js — the single source of webview SVG markup
 *
 * Every icon is a function returning markup, so the same drawing can be reused at the
 * sizes and stroke weights each spot needs. Keep control/attributes (id, class, type,
 * aria-label, data-tooltip) in the templates that own them — this module is markup only.
 *
 * Colours always come from `currentColor` so the VS Code theme keeps working.
 */

const line = (body, size, viewBox = '0 0 24 24', stroke = 2, className = '') =>
  `<svg${className ? ` class="${className}"` : ''} width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  // ── Header ────────────────────────────────────────────────────────────────
  plus: (size = 17) => line('<path d="M12 5v14"/><path d="M5 12h14"/>', size),

  history: (size = 18) => line(
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
    '<path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    size
  ),

  tree: (size = 17) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>`,

  skills: (size = 18) => line(
    '<path d="M12 2L2 7l10 5 10-5-10-5Z"/>' +
    '<path d="m2 17 10 5 10-5"/>' +
    '<path d="m2 12 10 5 10-5"/>',
    size
  ),

  settings: (size = 18) => line(
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
    size
  ),

  accounts: (size = 18) => line(
    '<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/>' +
    '<path d="M12.1207 12.78C12.0507 12.77 11.9607 12.77 11.8807 12.78C10.1207 12.72 8.7207 11.28 8.7207 9.50998C8.7207 7.69998 10.1807 6.22998 12.0007 6.22998C13.8107 6.22998 15.2807 7.69998 15.2807 9.50998C15.2707 11.28 13.8807 12.72 12.1207 12.78Z"/>' +
    '<path d="M18.7398 19.3801C16.9598 21.0101 14.5998 22.0001 11.9998 22.0001C9.39977 22.0001 7.03977 21.0101 5.25977 19.3801C5.35977 18.4401 5.95977 17.5201 7.02977 16.8001C9.76977 14.9801 14.2498 14.9801 16.9698 16.8001C18.0398 17.5201 18.6398 18.4401 18.7398 19.3801Z"/>',
    size, '0 0 24 24', 1.5
  ),

  // ── Composer ──────────────────────────────────────────────────────────────
  command: (size = 16) => line(
    '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/>' +
    '<path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    size
  ),

  paperclip: (size = 16) => line(
    '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    size
  ),

  send: (size = 16) => line('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>', size, '0 0 24 24', 2.5),

  abort: (size = 14) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,

  /** Scroll-to-bottom arrow */
  arrowDown: (size = 16) => line('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>', size, '0 0 24 24', 2.5),

  /** Selector icon: model picker */
  robot: ({ size = 16, className = '' } = {}) => line(
    '<rect x="4" y="8" width="16" height="11" rx="3"/>' +
    '<path d="M12 8V4.5"/>' +
    '<circle cx="12" cy="3.2" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>' +
    '<circle cx="14.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>' +
    '<path d="M2 12.5v3"/><path d="M22 12.5v3"/>' +
    '<path d="M9.5 16.5h5"/>',
    size, '0 0 24 24', 1.7, className
  ),

  /** Selector icon: thinking level (ascending bars) */
  thinkingLevels: ({ size = 16, className = '' } = {}) =>
    `<svg${className ? ` class="${className}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19v-4"/><path d="M12 19v-8"/><path d="M19 19V7"/></svg>`,

  /**
   * Context usage donut. `pct` is the used share; no arc is drawn at 0% because a round
   * linecap would still paint a dot on the track.
   */
  donut: (pct = 0) => {
    const radius = 5.5;
    const circumference = 2 * Math.PI * radius;
    const arc = (Math.max(0, Math.min(100, pct)) / 100) * circumference;
    const arcCircle = arc <= 0 ? '' :
      `<circle class="ctx-donut-arc" cx="7" cy="7" r="${radius}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 7 7)"/>`;
    return `<svg class="ctx-donut" width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">` +
      `<circle class="ctx-donut-track" cx="7" cy="7" r="${radius}" fill="none" stroke="currentColor" stroke-width="2"/>${arcCircle}</svg>`;
  },

  // ── Chevrons ──────────────────────────────────────────────────────────────
  /** Dropdown arrow (10x6 by default) */
  chevronDown: ({ width = 10, height = 6, className = '' } = {}) =>
    `<svg${className ? ` class="${className}"` : ''} width="${width}" height="${height}" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  /** Row disclosure arrow */
  chevronRight: (size = 12) => line('<polyline points="9 18 15 12 9 6"/>', size),

  /** Collapsible section caret (filled triangle, 8x8) */
  caretRight: (size = 8) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z"/></svg>`,

  // ── Panels / about ────────────────────────────────────────────────────────
  close: (size = 14) => line('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', size),

  info: (size = 14) => line('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', size),

  github: (size = 14) => line(
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>' +
    '<path d="M9 18c-4.51 2-5-2-7-2"/>',
    size
  ),

  logIn: (size = 14) => line(
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>' +
    '<polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    size
  ),

  // ── Messages / tool cards ─────────────────────────────────────────────────
  /** Copy-to-clipboard (13px, tool cards) */
  copy: (size = 13) =>
    line('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', size),

  /** Copy-to-clipboard (12px, message actions) */
  copyMessage: (size = 12) =>
    line('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', size),

  /** Thinking block marker */
  brain: (size = 12) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/><path d="M6.5 9h11"/><path d="M7 13h10"/></svg>`,

  /** Page glyph used for file references (context chips, file paths in code) */
  document: (size = 11) =>
    line('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>', size, '0 0 24 24', 2.5),
};
