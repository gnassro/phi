/**
 * cost-monitor.js — Cost & Token Display
 *
 * Tracks session cost, token usage, and renders the context window visualization.
 */

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
    this.tokenUsageEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.contextViz.classList.contains('hidden')) {
        this._updateContextViz();
        this.contextViz.classList.remove('hidden');
      } else {
        this.contextViz.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.contextViz.contains(e.target) && e.target !== this.tokenUsageEl) {
        this.contextViz.classList.add('hidden');
      }
    });
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
    if (size) this.contextWindowSize = size;
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
      this.tokenUsageEl.innerHTML = `<span>${pct}% context</span>`;
      this.tokenUsageEl.classList.add('visible');
      this.tokenUsageEl.classList.remove('warning', 'critical');
      if (pct >= 80) this.tokenUsageEl.classList.add('critical');
      else if (pct >= 60) this.tokenUsageEl.classList.add('warning');
      this.tokenUsageEl.title = `Context: ${(this.lastInputTokens / 1000).toFixed(1)}k / ${(this.contextWindowSize / 1000).toFixed(0)}k tokens`;
    } else if (this.lastInputTokens > 0) {
      this.tokenUsageEl.innerHTML = `<span>${(this.lastInputTokens / 1000).toFixed(1)}k tokens</span>`;
      this.tokenUsageEl.classList.add('visible');
      this.tokenUsageEl.classList.remove('warning', 'critical');
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
      { label: 'Input', tokens: input, color: 'messages' },
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
