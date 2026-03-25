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
    });

    // Paste intercept
    this.element.addEventListener('paste', (e) => {
      const files = [];
      let isImage = false;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          files.push(item.getAsFile());
          isImage = true;
        }
      }
      
      if (this.onImagePaste && files.length) {
        this.onImagePaste(files);
      }
      
      // Intercept text paste to insert plain text only
      if (!isImage && e.clipboardData.getData('text/plain')) {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }
    });
    
    // Auto-resize
    this.element.addEventListener('input', () => {
      this.element.style.height = 'auto';
      this.element.style.height = Math.min(this.element.scrollHeight, 200) + 'px';
    });
  }

  // Hook for autocomplete to set its state
  setAutocompleteActive(isActive) {
    this._autocompleteActive = isActive;
  }

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

  getText() {
    const clone = this.element.cloneNode(true);
    const chips = clone.querySelectorAll('.context-chip');
    chips.forEach(chip => {
      const type = chip.getAttribute('data-type');
      const path = chip.getAttribute('data-path');
      let textStr = '';
      
      if (type === 'snippet') {
        const lines = chip.getAttribute('data-lines');
        const snippet = decodeURIComponent(chip.getAttribute('data-snippet'));
        textStr = `\n\n\`\`\`${path}:${lines}\n${snippet}\n\`\`\`\n\n`;
      } else {
        textStr = '@' + path + ' ';
      }
      
      const textNode = document.createTextNode(textStr);
      chip.parentNode.replaceChild(textNode, chip);
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
    
    return clone.textContent.trim();
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
}
