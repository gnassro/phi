/**
 * Tool Card - Renders and updates tool execution cards (collapsible)
 */

export class ToolCardRenderer {
  constructor(container) {
    this.container = container;
    this.toolCards = new Map(); // toolCallId -> element
  }

  createToolCard(toolExecution) {
    const { toolCallId, toolName, args, status } = toolExecution;

    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolCallId = toolCallId;

    const argsPreview = this.getArgsPreview(toolName, args);
    const argsJson = this.formatJson(args);
    const isExpanded = (status === 'streaming' || status === 'pending');
    const isEdit = (toolName === 'edit' || toolName === 'Edit') && args && (args.oldText || args.old_text) && (args.newText || args.new_text);

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'tool-card-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'tool-header-left';

    const chevron = document.createElement('span');
    chevron.className = 'tool-card-chevron' + (isExpanded ? ' expanded' : '');
    chevron.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z"/></svg>';
    headerLeft.appendChild(chevron);

    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = toolName;
    headerLeft.appendChild(name);

    if (argsPreview) {
      const previewEl = document.createElement('span');
      previewEl.className = 'tool-args-preview';
      previewEl.textContent = argsPreview;
      headerLeft.appendChild(previewEl);
    }

    header.appendChild(headerLeft);

    // Right side: copy button + spinner
    const headerRight = document.createElement('div');
    headerRight.className = 'tool-header-right';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'tool-action-btn copy-output-btn';
    copyBtn.title = 'Copy output';
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const output = card.querySelector('.tool-output');
      if (!output || !output.textContent.trim()) return;
      const text = output.textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : new Promise((r) => {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); r();
      })).then(() => {
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      });
    });
    headerRight.appendChild(copyBtn);

    // Spinner for running status (hidden when done)
    const spinner = document.createElement('div');
    spinner.className = 'tool-spinner';
    if (status !== 'streaming' && status !== 'pending') spinner.classList.add('hidden');
    headerRight.appendChild(spinner);

    header.appendChild(headerRight);

    // Toggle expand/collapse on header click
    header.addEventListener('click', () => {
      const body = card.querySelector('.tool-card-body');
      if (body) body.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
    });

    card.appendChild(header);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'tool-card-body' + (isExpanded ? ' expanded' : '');

    if (isEdit) {
      body.appendChild(this.renderDiff(args.oldText || args.old_text, args.newText || args.new_text));
    } else if (argsJson) {
      const argsEl = document.createElement('div');
      argsEl.className = 'tool-args';
      argsEl.textContent = argsJson;
      body.appendChild(argsEl);
    }

    const outputWrapper = document.createElement('div');
    outputWrapper.className = 'tool-output-wrapper';
    const outputEl = document.createElement('div');
    outputEl.className = 'tool-output';
    outputWrapper.appendChild(outputEl);
    body.appendChild(outputWrapper);

    card.appendChild(body);

    this.container.appendChild(card);
    this.toolCards.set(toolCallId, card);
    this.scrollToBottom();

    return card;
  }

  updateToolCard(toolExecution) {
    let card = this.toolCards.get(toolExecution.toolCallId);

    if (!card) {
      card = this.createToolCard(toolExecution);
    }

    // Show spinner when streaming
    const spinner = card.querySelector('.tool-spinner');
    if (spinner) {
      if (toolExecution.status === 'streaming' || toolExecution.status === 'pending') {
        spinner.classList.remove('hidden');
      } else {
        spinner.classList.add('hidden');
      }
    }

    // Auto-expand when streaming
    if (toolExecution.status === 'streaming') {
      const body = card.querySelector('.tool-card-body');
      const chevron = card.querySelector('.tool-card-chevron');
      if (body) body.classList.add('expanded');
      if (chevron) chevron.classList.add('expanded');
    }

    // Update output
    const outputElement = card.querySelector('.tool-output');
    if (outputElement && toolExecution.output) {
      outputElement.textContent = toolExecution.output;
      this.scrollToBottom();
    }
  }

  finalizeToolCard(toolCallId, result, isError) {
    const card = this.toolCards.get(toolCallId);
    if (!card) return;

    // Hide spinner
    const spinner = card.querySelector('.tool-spinner');
    if (spinner) spinner.classList.add('hidden');

    // Update output with final result
    const outputElement = card.querySelector('.tool-output');
    if (outputElement && result) {
      const output = this.formatResult(result);
      outputElement.textContent = output;
    }

    // Collapse completed cards (less noise)
    const body = card.querySelector('.tool-card-body');
    const chevron = card.querySelector('.tool-card-chevron');
    if (body) body.classList.remove('expanded');
    if (chevron) chevron.classList.remove('expanded');
  }

  /**
   * Create a pre-collapsed card for session history using DOM methods
   */
  createHistoryCard(toolExecution) {
    const { toolCallId, toolName, args } = toolExecution;

    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolCallId = toolCallId;

    // Header
    const header = document.createElement('div');
    header.className = 'tool-card-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'tool-header-left';

    const chevron = document.createElement('span');
    chevron.className = 'tool-card-chevron';
    chevron.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z"/></svg>';
    headerLeft.appendChild(chevron);

    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = toolName;
    headerLeft.appendChild(name);

    const preview = this.getArgsPreview(toolName, args);
    if (preview) {
      const previewEl = document.createElement('span');
      previewEl.className = 'tool-args-preview';
      previewEl.textContent = preview;
      headerLeft.appendChild(previewEl);
    }

    header.appendChild(headerLeft);

    // Right side: copy button
    const headerRight = document.createElement('div');
    headerRight.className = 'tool-header-right';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'tool-action-btn copy-output-btn';
    copyBtn.title = 'Copy output';
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const output = card.querySelector('.tool-output');
      if (!output || !output.textContent.trim()) return;
      const text = output.textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : new Promise((r) => {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); r();
      })).then(() => {
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      });
    });
    headerRight.appendChild(copyBtn);

    header.appendChild(headerRight);

    // Toggle expand on click
    header.addEventListener('click', () => {
      body.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
    });

    card.appendChild(header);

    // Body (collapsed by default)
    const body = document.createElement('div');
    body.className = 'tool-card-body';

    const isEdit = (toolName === 'edit' || toolName === 'Edit') && args && (args.oldText || args.old_text) && (args.newText || args.new_text);

    if (isEdit) {
      body.appendChild(this.renderDiff(args.oldText || args.old_text, args.newText || args.new_text));
    } else {
      const argsJson = this.formatJson(args);
      if (argsJson) {
        const argsEl = document.createElement('div');
        argsEl.className = 'tool-args';
        argsEl.textContent = argsJson;
        body.appendChild(argsEl);
      }
    }

    const outputEl = document.createElement('div');
    outputEl.className = 'tool-output';
    body.appendChild(outputEl);

    card.appendChild(body);

    this.container.appendChild(card);
    this.toolCards.set(toolCallId, card);

    return card;
  }

  /**
   * Add result to a history card (stays collapsed)
   */
  addHistoryResult(toolCallId, result, isError) {
    const card = this.toolCards.get(toolCallId);
    if (!card) return;

    const outputElement = card.querySelector('.tool-output');
    if (outputElement && result) {
      outputElement.textContent = this.formatResult(result);
    }
  }

  /** Compact preview for the header line */
  getArgsPreview(toolName, args) {
    if (!args || Object.keys(args).length === 0) return '';

    if (args.path) return args.path;
    if (args.command) return args.command.substring(0, 80);
    if (args.query) return args.query.substring(0, 60);
    if (args.url) return args.url;

    for (const val of Object.values(args)) {
      if (typeof val === 'string' && val.length > 0) {
        return val.substring(0, 60);
      }
    }
    return '';
  }

  formatJson(obj) {
    try {
      if (Object.keys(obj).length === 0) return '';
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  /** Render a simple inline diff for Edit tool */
  renderDiff(oldText, newText) {
    const container = document.createElement('div');
    container.className = 'tool-diff';

    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    for (const line of oldLines) {
      const el = document.createElement('div');
      el.className = 'diff-line diff-removed';
      el.textContent = '- ' + line;
      container.appendChild(el);
    }

    for (const line of newLines) {
      const el = document.createElement('div');
      el.className = 'diff-line diff-added';
      el.textContent = '+ ' + line;
      container.appendChild(el);
    }

    return container;
  }

  formatResult(result) {
    if (!result) return '';

    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map(block => {
          if (block.type === 'text') return block.text;
          return JSON.stringify(block);
        })
        .join('\n');
    }

    return JSON.stringify(result, null, 2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    if (this.container) {
      const threshold = 100;
      const isNear =
        this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < threshold;
      if (isNear) {
        requestAnimationFrame(() => {
          this.container.scrollTop = this.container.scrollHeight;
        });
      }
    }
  }

  expandAll() {
    this.toolCards.forEach(card => {
      card.querySelector('.tool-card-body')?.classList.add('expanded');
      card.querySelector('.tool-card-chevron')?.classList.add('expanded');
    });
  }

  collapseAll() {
    this.toolCards.forEach(card => {
      card.querySelector('.tool-card-body')?.classList.remove('expanded');
      card.querySelector('.tool-card-chevron')?.classList.remove('expanded');
    });
  }

  clear() {
    this.toolCards.forEach((card) => card.remove());
    this.toolCards.clear();
  }
}
