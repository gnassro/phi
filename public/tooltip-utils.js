/**
 * tooltip-utils.js — Keeps CSS tooltips inside the webview
 *
 * Tooltips are `::after` pseudo-elements centred on their trigger (`left: 50%` plus
 * `translateX(-50%)` in style.css). A trigger near the edge of a narrow sidebar pushes the
 * tooltip past the webview, where it gets clipped and loses words.
 *
 * CSS cannot fix that on its own: it has no way to know where the trigger sits, and these
 * triggers move (the header wraps, the model label shrinks with the sidebar). So on hover
 * we measure the rendered tooltip and nudge it back inside through `--tooltip-shift`, which
 * the pseudo-element adds to its own -50% offset. The measured layout is never changed.
 */

const EDGE_PADDING = 8;

/** Last measurement, so moving inside one trigger does not re-measure */
let lastKey = '';

/**
 * Keep tooltips inside the webview: registers the delegated handler that measures the
 * tooltip on hover and sets `--tooltip-shift`. Called once from app.js; being delegated,
 * it also covers tooltips that appear later (e.g. the compact selectors).
 */
export function initializeTooltipPlacement() {
  document.addEventListener('mouseover', (e) => {
    const trigger = e.target?.closest?.('.has-tooltip[data-tooltip]');
    if (!trigger) return;

    // Re-measure when the trigger changes or the sidebar was resized
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const key = `${trigger.dataset.tooltip}|${rect.left}|${viewportWidth}`;
    if (key === lastKey) return;
    lastKey = key;

    const pseudo = getComputedStyle(trigger, '::after');
    const width =
      parseFloat(pseudo.width) +
      parseFloat(pseudo.paddingLeft) + parseFloat(pseudo.paddingRight) +
      parseFloat(pseudo.borderLeftWidth) + parseFloat(pseudo.borderRightWidth);
    if (!width) return;

    const center = rect.left + rect.width / 2;
    const left = center - width / 2;
    const right = center + width / 2;

    let shift = 0;
    if (left < EDGE_PADDING) shift = EDGE_PADDING - left;
    else if (right > viewportWidth - EDGE_PADDING) shift = viewportWidth - EDGE_PADDING - right;

    trigger.style.setProperty('--tooltip-shift', `${shift}px`);
  });
}
