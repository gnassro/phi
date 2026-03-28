/**
 * Message Renderer - Renders chat messages with markdown support
 */

import { renderMarkdown, renderUserMarkdown } from './markdown.js';

export class MessageRenderer {
  constructor(container) {
    this.container = container;
    this.isNearBottom = true;

    // Track scroll position for smart auto-scroll
    this.container.addEventListener('scroll', () => {
      const threshold = 100;
      this.isNearBottom =
        this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < threshold;
    });
  }

  clear() {
    const typingIndicator = document.getElementById('typing-indicator');
    this.container.innerHTML = '';
    if (typingIndicator) {
      this.container.appendChild(typingIndicator);
    }
  }

  renderWelcome() {
    const typingIndicator = document.getElementById('typing-indicator');
    this.container.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">φ</div>
        <p>Welcome to Phi</p>
        <p class="hint">Type a message below to start chatting with Pi, or use <kbd>Cmd+Shift+L</kbd> to open this panel anytime.</p>
        <div class="shortcuts-hint">
          <span>Enter — Send</span>
          <span>Shift+Enter — Newline</span>
          <span>Esc — Abort</span>
        </div>
      </div>
    `;
    if (typingIndicator) {
      this.container.appendChild(typingIndicator);
    }
  }

  renderUserMessage(message, isHistory = false) {
    // Remove welcome message if present
    const welcome = this.container.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message user${isHistory ? ' history' : ''}`;

    let imagesHtml = '';
    if (message.images && message.images.length > 0) {
      imagesHtml = '<div class="message-images">' +
        message.images.map(img => {
          const src = img.data.startsWith('data:') ? img.data : `data:${img.mimeType || 'image/png'};base64,${img.data}`;
          return `<img class="message-image" src="${src}" alt="Attached image" />`;
        }).join('') +
        '</div>';
    }

    div.innerHTML = `
      <button class="message-copy-btn" aria-label="Copy message"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      <div class="message-content">${imagesHtml}${renderUserMarkdown(message.content)}</div>
    `;
    this._setupCopyBtn(div);
    this.container.appendChild(div);
    if (!isHistory) this.scrollToBottom();
  }

  renderAssistantMessage(message, isStreaming = false, isHistory = false) {
    // Remove welcome message if present
    const welcome = this.container.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message assistant${isHistory ? ' history' : ''}`;
    div.dataset.messageId = message.id || 'streaming';

    let contentHtml = '';
    let usageHtml = '';
    const thinkingBlocks = []; // DOM elements from renderThinkingBlock

    if (typeof message.content === 'string') {
      contentHtml = isStreaming ? this.escapeHtml(message.content) : renderMarkdown(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text') {
          contentHtml += isStreaming ? this.escapeHtml(block.text) : renderMarkdown(block.text);
        } else if (block.type === 'thinking') {
          thinkingBlocks.push(this.renderThinkingBlock(block.thinking));
        }
      }
    }

    // Show error message if present
    const hasError = message.stopReason === 'error' && message.errorMessage;
    const isErrorOnly = hasError && !contentHtml && thinkingBlocks.length === 0;

    if (hasError) {
      const escaped = this.escapeHtml(message.errorMessage);
      contentHtml += `<div class="assistant-error" data-error="${escaped}">Error: ${escaped}</div>`;
    }

    // Usage/cost info
    if (message.usage && message.usage.cost) {
      const cost = message.usage.cost.total;
      if (cost > 0) {
        usageHtml = `<span class="message-usage">$${cost.toFixed(4)}</span>`;
      }
    }

    const streamingClass = isStreaming ? ' streaming' : '';
    const copyBtnSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    if (isErrorOnly && !isStreaming) {
      // Error-only: single row with error text + copy button at right
      div.innerHTML = `
        <div class="assistant-error-row">
          <div class="assistant-error" data-error="${this.escapeHtml(message.errorMessage)}">Error: ${this.escapeHtml(message.errorMessage)}</div>
          <button class="message-copy-btn" aria-label="Copy message">${copyBtnSvg}</button>
        </div>
      `;
    } else {
      const copyBtnHtml = !isStreaming ? `<button class="message-copy-btn" aria-label="Copy message">${copyBtnSvg}</button>` : '';

      div.innerHTML = `
        <div class="message-actions-row">
          ${usageHtml}
          ${copyBtnHtml}
        </div>
        <div class="message-content${streamingClass}"></div>
      `;

      // Append thinking blocks (DOM elements) then HTML content
      const contentDiv = div.querySelector('.message-content');
      for (const tb of thinkingBlocks) {
        contentDiv.appendChild(tb);
      }
      if (contentHtml) {
        const textContainer = document.createElement('div');
        textContainer.innerHTML = contentHtml;
        contentDiv.appendChild(textContainer);
      }
    }

    if (!isStreaming) this._setupCopyBtn(div);
    this.container.appendChild(div);
    if (!isHistory) this.scrollToBottom();

    return div;
  }

  renderThinkingBlock(thinking) {
    const block = document.createElement('div');
    block.className = 'thinking-block';

    const toggle = document.createElement('div');
    toggle.className = 'thinking-toggle';

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z"/></svg>';
    toggle.appendChild(chevron);

    const label = document.createElement('span');
    label.className = 'thinking-label';
    label.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/><path d="M6.5 9h11"/><path d="M7 13h10"/></svg> Thinking';
    toggle.appendChild(label);

    const content = document.createElement('div');
    content.className = 'thinking-content';
    content.textContent = thinking;

    toggle.addEventListener('click', () => {
      content.classList.toggle('expanded');
      toggle.classList.toggle('expanded');
    });

    block.appendChild(toggle);
    block.appendChild(content);

    return block;
  }

  updateStreamingThinking(messageElement, thinking) {
    let thinkingDiv = messageElement.querySelector('.streaming-thinking');
    if (!thinkingDiv) {
      const contentDiv = messageElement.querySelector('.message-content');
      if (!contentDiv) return;

      thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'thinking-block streaming-thinking';

      const toggle = document.createElement('div');
      toggle.className = 'thinking-toggle expanded';

      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z"/></svg>';
      toggle.appendChild(chevron);

      const label = document.createElement('span');
      label.className = 'thinking-label';
      label.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/><path d="M6.5 9h11"/><path d="M7 13h10"/></svg> Thinking';
      toggle.appendChild(label);

      const content = document.createElement('div');
      content.className = 'thinking-content expanded';

      toggle.addEventListener('click', () => {
        content.classList.toggle('expanded');
        toggle.classList.toggle('expanded');
      });

      thinkingDiv.appendChild(toggle);
      thinkingDiv.appendChild(content);
      contentDiv.prepend(thinkingDiv);
    }
    const contentEl = thinkingDiv.querySelector('.thinking-content');
    if (contentEl) {
      contentEl.textContent = thinking;
      this.scrollToBottom();
    }
  }

  updateStreamingMessage(messageElement, content) {
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
      // Store raw text for finalization
      messageElement.dataset.rawText = content;

      const rendered = renderMarkdown(content);
      // Keep any thinking block, update only the text part
      const thinkingBlock = contentDiv.querySelector('.streaming-thinking');
      if (thinkingBlock) {
        let textNode = contentDiv.querySelector('.streaming-text');
        if (!textNode) {
          textNode = document.createElement('div');
          textNode.className = 'streaming-text';
          contentDiv.appendChild(textNode);
        }
        textNode.innerHTML = rendered;
      } else {
        // Preserve any existing streaming-text wrapper or create one
        let textNode = contentDiv.querySelector('.streaming-text');
        if (!textNode) {
          textNode = document.createElement('div');
          textNode.className = 'streaming-text';
          contentDiv.innerHTML = '';
          contentDiv.appendChild(textNode);
        }
        textNode.innerHTML = rendered;
      }
      this.scrollToBottom();
    }
  }

  finalizeStreamingMessage(messageElement, usage = null, thinking = '', errorMessage = null) {
    const contentDiv = messageElement.querySelector('.message-content');
    const rawText = messageElement.dataset.rawText || '';
    delete messageElement.dataset.rawText;
    const isErrorOnly = errorMessage && !rawText.trim() && !thinking;
    const copyBtnSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    if (isErrorOnly) {
      // Replace entire message content with inline error row
      messageElement.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'assistant-error-row';

      const errorEl = document.createElement('div');
      errorEl.className = 'assistant-error';
      errorEl.textContent = `Error: ${errorMessage}`;
      errorEl.dataset.error = errorMessage;
      row.appendChild(errorEl);

      const btn = document.createElement('button');
      btn.className = 'message-copy-btn';
      btn.setAttribute('aria-label', 'Copy message');
      btn.innerHTML = copyBtnSvg;
      row.appendChild(btn);

      messageElement.appendChild(row);
      this._setupCopyBtn(messageElement);
      return;
    }

    if (contentDiv) {
      contentDiv.classList.remove('streaming');
      
      // Clear and rebuild with thinking block (DOM) + markdown text (HTML)
      contentDiv.innerHTML = '';
      if (thinking) {
        contentDiv.appendChild(this.renderThinkingBlock(thinking));
      }
      if (rawText && rawText.trim()) {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = renderMarkdown(rawText);
        contentDiv.appendChild(textDiv);
      }
      // Show error message if present (after text content)
      if (errorMessage) {
        const errorEl = document.createElement('div');
        errorEl.className = 'assistant-error';
        errorEl.textContent = `Error: ${errorMessage}`;
        errorEl.dataset.error = errorMessage;
        contentDiv.appendChild(errorEl);
      }
    }

    // Add copy button after streaming finishes
    let actionsRow = messageElement.querySelector('.message-actions-row');
    if (!actionsRow) {
      actionsRow = document.createElement('div');
      actionsRow.className = 'message-actions-row';
      messageElement.insertBefore(actionsRow, messageElement.firstChild);
    }

    if (!actionsRow.querySelector('.message-copy-btn')) {
      const btn = document.createElement('button');
      btn.className = 'message-copy-btn';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      actionsRow.appendChild(btn);
      this._setupCopyBtn(messageElement);
    }

    // Add usage info if available
    if (usage && usage.cost && usage.cost.total > 0) {
      if (!actionsRow.querySelector('.message-usage')) {
        const span = document.createElement('span');
        span.className = 'message-usage';
        span.textContent = `$${usage.cost.total.toFixed(4)}`;
        actionsRow.insertBefore(span, actionsRow.firstChild);
      }
    }
  }

  renderSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  renderError(errorMessage) {
    const div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = `⚠️ ${errorMessage}`;
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  _setupCopyBtn(messageEl) {
    const btn = messageEl.querySelector('.message-copy-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const content = messageEl.querySelector('.message-content');
      const errorEl = messageEl.querySelector('.assistant-error');
      const text = content ? content.textContent : errorEl ? errorEl.dataset.error || errorEl.textContent : '';
      if (!text) return;
      // Fallback for non-HTTPS (LAN access)
      const copyText = (t) => {
        if (navigator.clipboard) return navigator.clipboard.writeText(t);
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve();
      };
      copyText(text).then(() => {
        btn.classList.add('copied');
        setTimeout(() => {
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    if (this.isNearBottom) {
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
      });
    }
  }
}
