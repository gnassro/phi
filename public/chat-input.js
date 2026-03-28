export class ChatInput {
  constructor(elementId, formId, onSubmit) {
    this.element = document.getElementById(elementId);
    this.form = document.getElementById(formId);
    this.onSubmit = onSubmit;
    this.lastSavedRange = null;

    this.bindEvents();
  }

  bindEvents() {
    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit();
      });
    }

    // Cursor tracking
    const saveRange = () => {
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && this.element.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        this.lastSavedRange = sel.getRangeAt(0).cloneRange();
      }
    };
    this.element.addEventListener('blur', saveRange);
    this.element.addEventListener('keyup', saveRange);
    this.element.addEventListener('mouseup', saveRange);

    // Keydown (Enter to send, Shift+Enter for newline)
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this._autocompleteActive) {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
      }
      // Backspace on an empty line next to a context chip should select the chip
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          if (range.startOffset === 0 && range.startContainer === this.element) {
            // At the very start — nothing to do
          } else if (range.startOffset === 0 && range.startContainer.previousSibling) {
            const prev = range.startContainer.previousSibling;
            if (prev.classList && prev.classList.contains('context-ref')) {
              e.preventDefault();
              prev.remove();
              this.element.dispatchEvent(new Event('input'));
            }
          }
        }
      }
    });

    // Paste intercept
    this.element.addEventListener('paste', (e) => {
      const clipData = e.clipboardData;
      if (!clipData) return;

      const files = [];
      for (const item of clipData.items) {
        if (item.type.startsWith('image/')) {
          files.push(item.getAsFile());
        }
      }

      if (this.onImagePaste && files.length) {
        e.preventDefault();
        this.onImagePaste(files);
        return;
      }

      // Intercept text paste to insert plain text only
      const text = clipData.getData('text/plain');
      if (text) {
        e.preventDefault();
        // insertText via execCommand is deprecated but works in most webviews
        const success = document.execCommand('insertText', false, text);
        if (!success) {
          // Fallback: insert at selection using Range API
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          // Trigger input event for auto-resize
          this.element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    // Auto-resize
    this.element.addEventListener('input', () => {
      this.element.style.height = 'auto';
      this.element.style.height = Math.min(this.element.scrollHeight, 200) + 'px';
    });
  }

  setAutocompleteActive(isActive) {
    this._autocompleteActive = isActive;
  }

  /**
   * Insert a context reference inline at the current cursor position.
   * The reference is a non-editable inline block that shows the file path.
   * On send, getText() expands it into a full code block.
   *
   * @param {Object} ctx - Context object with type, filePath, language, content, etc.
   */
  insertContextRef(ctx) {
    // Show only filename (+ line range for selections)
    const fileName = (ctx.filePath || '').split('/').pop() || ctx.filePath;
    let label = '';
    let dataAttrs = '';

    if (ctx.type === 'selection') {
      label = `${fileName}:${ctx.startLine}-${ctx.endLine}`;
      dataAttrs = `data-type="selection" data-path="${this._escAttr(ctx.filePath)}" data-start="${ctx.startLine}" data-end="${ctx.endLine}"`;
    } else if (ctx.type === 'file') {
      label = fileName;
      dataAttrs = `data-type="file" data-path="${this._escAttr(ctx.filePath)}"`;
    }

    const html =
      `<span class="context-ref" contenteditable="false" ${dataAttrs}>` +
        `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;opacity:0.6">` +
          `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>` +
          `<polyline points="14 2 14 8 20 8"/>` +
        `</svg>` +
        `${this._escHtml(label)}` +
      `</span>\u00A0`; // trailing nbsp so cursor can sit after it

    this.insertHtmlAtCursor(html);
  }

  /**
   * Insert raw HTML at the current cursor position inside the contenteditable.
   */
  insertHtmlAtCursor(html) {
    this.element.focus();
    const sel = window.getSelection();
    let range;

    if (this.lastSavedRange) {
      range = this.lastSavedRange;
    } else if (sel.rangeCount > 0 && this.element.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(this.element);
      range.collapse(false);
    }

    range.deleteContents();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const frag = document.createDocumentFragment();
    let node, lastNode;
    while ((node = tempDiv.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      this.lastSavedRange = range.cloneRange();
    }

    this.element.dispatchEvent(new Event('input'));
  }

  /**
   * Extract the full text from the input, expanding context references
   * into formatted code blocks.
   */
  getText() {
    const clone = this.element.cloneNode(true);

    // Expand context-ref spans into lightweight path references
    // Pi can read files itself — no need to embed content
    const refs = clone.querySelectorAll('.context-ref');
    refs.forEach(ref => {
      const type = ref.getAttribute('data-type');
      const path = ref.getAttribute('data-path') || '';

      let replacement = '';
      if (type === 'selection') {
        const start = ref.getAttribute('data-start');
        const end = ref.getAttribute('data-end');
        replacement = `\`${path}:${start}-${end}\``;
      } else if (type === 'file') {
        replacement = `\`${path}\``;
      }

      ref.replaceWith(document.createTextNode(replacement));
    });

    // Replace <br> and <div> with newlines
    const divs = clone.querySelectorAll('div, p');
    divs.forEach(d => {
      d.parentNode.insertBefore(document.createTextNode('\n'), d);
    });
    const brs = clone.querySelectorAll('br');
    brs.forEach(br => {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });

    // Collapse multiple newlines
    return clone.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Check if the input has any content (text or context refs).
   */
  hasContent() {
    return this.element.textContent.trim().length > 0 ||
           this.element.querySelector('.context-ref') !== null;
  }

  clear() {
    this.element.innerHTML = '';
    this.element.style.height = 'auto';
    this.lastSavedRange = null;
  }

  submit() {
    const text = this.getText();
    this.onSubmit(text);
  }

  _escHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  _escAttr(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
