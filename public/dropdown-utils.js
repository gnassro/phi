/**
 * dropdown-utils.js — Dropdown menu positioning helpers
 *
 * The composer selectors (model, thinking level) align their menus with their
 * own trigger. When the sidebar is narrow that can push the menu past the
 * webview edge, so after opening we nudge it back inside the viewport.
 */

/**
 * Keep an open dropdown menu inside the viewport.
 * Uses a transform (not left/right) so it never fights the CSS anchoring.
 */
export function clampMenuToViewport(menu, padding = 8) {
  menu.style.transform = '';
  const rect = menu.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;

  let dx = 0;
  if (rect.right > viewportWidth - padding) dx = viewportWidth - padding - rect.right;
  if (rect.left + dx < padding) dx = padding - rect.left;
  if (dx !== 0) menu.style.transform = `translateX(${dx}px)`;
}
