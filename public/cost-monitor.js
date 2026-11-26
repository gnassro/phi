/**
 * cost-monitor.js — Cost & Token Display
 *
 * Tracks session cost, token usage, and renders the context window visualization.
 */

import { icons } from './icons.js';

export class CostMonitor {
  constructor() {
    this.sessionTotalCost = 0;
    this.lastInputTokens = 0;
    this.contextWindowSize = 0;
    this.lastUsage = null;

    // DOM refs
    this.sessionCostEl = document.getElementById('session-cost');
    this.tokenUsageEl = document.getElementById('token-usage');
    this.contextViz = document.getElementById('context-viz');
    this.contextBar = document.getElementById('context-bar');
    this.contextLegend = document.getElementById('context-legend');
    this.contextVizUsed = document.getElementById('context-viz-used');
    this.contextVizTotal = document.getElementById('context-viz-total');

    this._init();
  }

  _init() {
    // No stopPropagation here: the model/thinking menus close on outside clicks, and
    // this click must reach them. The document handler below keeps the popup open.
    this.tokenUsageEl.addEventListener('click', () => {
      if (this.contextViz.classList.contains('hidden')) {
        this._updateContextViz();
        this.contextViz.classList.remove('hidden');
      } else {
        this.contextViz.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (this.contextViz.classList.contains('hidden')) return;
      if (this.contextViz.contains(e.target) || this.tokenUsageEl.contains(e.target)) return;
      this.contextViz.classList.add('hidden');
    });

    // The percentage only squeezes the selectors when it has nowhere else to sit
    this.tokenUsageEl.addEventListener('mouseenter', () => this._fitPercentLabel());
    this.tokenUsageEl.addEventListener('mouseleave', () => this._footer()?.classList.remove('ctx-pct-tight'));
  }

  _footer() {
    return this.tokenUsageEl.closest('.input-footer');
  }

  /**
   * On hover the percentage floats to the left of the donut, over the footer row. If the
   * gap up to the thinking selector is wide enough, nothing else is touched. Otherwise the
   * footer gets `.ctx-pct-tight`, which hides the thinking label and reserves the pill's
   * width (see style.css), so the percentage never covers the selector.
   */
  _fitPercentLabel() {
    const footer = this._footer();
    const label = this.tokenUsageEl.querySelector('.ctx-pct');
    if (!footer || !label) return;

    footer.classList.remove('ctx-pct-tight');
    const group = footer.querySelector('.model-selector-group');
    const gap = this.tokenUsageEl.getBoundingClientRect().left -
      (group ? group.getBoundingClientRect().right : 0);
    const needed = label.getBoundingClientRect().width + 4;

    if (needed > gap) footer.classList.add('ctx-pct-tight');
  }

  addCost(amount) {
    if (amount) this.sessionTotalCost += amount;
    this._updateCostDisplay();
  }

  setCost(cost) {
    this.sessionTotalCost = cost || 0;
    this._updateCostDisplay();
  }

  setUsage(usage) {
    if (usage?.input) {
      this.lastInputTokens = usage.input + (usage.cacheRead || 0);
      this.lastUsage = usage;
    }
    this._updateTokenUsage();
  }

  setContextWindowSize(size) {
    this.contextWindowSize = size || 0;
    this._updateTokenUsage();
  }

  reset() {
    this.sessionTotalCost = 0;
    this.lastInputTokens = 0;
    this.lastUsage = null;
    this._updateCostDisplay();
    this._updateTokenUsage();
  }

  updateDisplay() {
    this._updateCostDisplay();
    this._updateTokenUsage();
  }

  _updateCostDisplay() {
    if (this.sessionTotalCost > 0) {
      this.sessionCostEl.textContent = `$${this.sessionTotalCost.toFixed(4)}`;
      this.sessionCostEl.classList.add('visible');
    } else {
      this.sessionCostEl.classList.remove('visible');
    }
  }

  _updateTokenUsage() {
    if (this.lastInputTokens > 0 && this.contextWindowSize > 0) {
      const pct = Math.round((this.lastInputTokens / this.contextWindowSize) * 100);
      // Label only shows on hover (see .ctx-pct in style.css)
      this.tokenUsageEl.innerHTML = `<span class="ctx-pct">${pct}%</span>${icons.donut(pct)}`;
      this.tokenUsageEl.classList.add('visible');
      this.tokenUsageEl.classList.remove('warning', 'critical');
      if (pct >= 80) this.tokenUsageEl.classList.add('critical');
      else if (pct >= 60) this.tokenUsageEl.classList.add('warning');
      this.tokenUsageEl.setAttribute('aria-label', `Context ${pct}% used`);
    } else if (this.lastInputTokens > 0) {
      this.tokenUsageEl.innerHTML = `<span class="ctx-pct">${(this.lastInputTokens / 1000).toFixed(1)}k</span>${icons.donut(0)}`;
      this.tokenUsageEl.classList.add('visible');
      this.tokenUsageEl.classList.remove('warning', 'critical');
    } else {
      this.tokenUsageEl.classList.remove('visible', 'warning', 'critical');
      this.tokenUsageEl.innerHTML = '';
      this.contextViz.classList.add('hidden');
    }
  }

  _formatTokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  _updateContextViz() {
    if (!this.lastUsage || !this.contextWindowSize) return;
    const input = this.lastUsage.input || 0;
    const cacheRead = this.lastUsage.cacheRead || 0;
    const totalUsed = input + cacheRead;
    const free = Math.max(0, this.contextWindowSize - totalUsed);

    const segments = [
      { label: 'Cached', tokens: cacheRead, color: 'cache' },
      { label: 'Input', tokens: input, color: 'input' },
      { label: 'Available', tokens: free, color: 'free' },
    ];

    this.contextBar.innerHTML = '';
    for (const seg of segments) {
      if (seg.tokens <= 0) continue;
      const pct = (seg.tokens / this.contextWindowSize) * 100;
      const el = document.createElement('div');
      el.className = `context-bar-segment ${seg.color}`;
      el.style.width = `${pct}%`;
      el.title = `${seg.label}: ${this._formatTokens(seg.tokens)}`;
      this.contextBar.appendChild(el);
    }

    this.contextLegend.innerHTML = '';
    for (const seg of segments) {
      const item = document.createElement('div');
      item.className = 'context-legend-item';
      item.innerHTML = `<span class="context-legend-left"><span class="context-legend-dot ${seg.color}"></span>${seg.label}</span><span class="context-legend-value">${this._formatTokens(seg.tokens)}</span>`;
      this.contextLegend.appendChild(item);
    }

    const pct = Math.round((totalUsed / this.contextWindowSize) * 100);
    this.contextVizUsed.textContent = `${pct}% used`;
    this.contextVizTotal.textContent = `${this._formatTokens(totalUsed)} / ${this._formatTokens(this.contextWindowSize)}`;
  }
}
