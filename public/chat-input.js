export class ChatInput {
  constructor(elementId, formId, onSubmit) {
    this.element = document.getElementById(elementId);
    this.form = document.getElementById(formId);
    this.onSubmit = onSubmit;
    this.lastSavedRange = null;

    // ── Custom undo/redo ────────────────────────────────────────────────
    //
    // We do NOT rely on the browser's native contenteditable undo. In
    // VS Code webviews, the native undo manager groups a paste with
    // prior typing in unpredictable ways, so Ctrl+Z would walk back
    // through typed characters instead of removing the pasted block in
    // one step (the original bug this code fixes).
    //
    // Instead we maintain our own state stack:
    //   - Every "user-visible" change (typing burst, paste, programmatic
    //     insert) pushes a snapshot of the current state onto the undo
    //     stack and clears the redo stack.
    //   - Typing is debounced (default 450 ms) so a word typed in one
    //     burst is one undo step, not one per character.
    //   - Pastes are committed immediately so a paste is always its own
    //     undo step, even if the user hits Ctrl+Z right away.
    //   - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are intercepted and routed to
    //     our `undo()` / `redo()` methods.
    this._undoStack = [];
    this._redoStack = [];
    this._lastSnapshot = null;
    this._inputDebounce = null;
    this._isUndoRedo = false;
    this._undoDebounceMs = 450;
    this._maxUndoSize = 100;
    // Tracks a pending rAF that will (re)apply the selection after an
    // undo/redo restore. We need this because assigning to `innerHTML`
    // on a contenteditable triggers a browser DOM-normalization pass
    // (e.g. injecting a trailing <br>) that can clobber a selection we
    // set synchronously — the caret visibly snaps back to position 0.
    // Deferring the selection restore to the next animation frame
    // gives that normalization a chance to settle first.
    this._restoreRAF = null;

    this.bindEvents();
    this._lastSnapshot = this._captureSnapshot();
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
    this.element.addEventListener('keyup', () => {
      saveRange();
      this._revealCaret();
    });
    this.element.addEventListener('mouseup', saveRange);

    // Keydown (Enter to send, Shift+Enter for newline, undo/redo)
    this.element.addEventListener('keydown', (e) => {
      // Custom undo/redo first — we always intercept these so the browser's
      // own (unreliable, paste-unaware) undo manager never runs.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (
            e.key === 'y' || e.key === 'Y' ||
            (e.shiftKey && (e.key === 'z' || e.key === 'Z'))
          )) {
        e.preventDefault();
        this.redo();
        return;
      }

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

    // Paste intercept.
    //
    // We listen to BOTH `beforeinput` (modern) and `paste` (legacy / image-only):
    //
    // - `beforeinput` with `inputType: 'insertFromPaste'` is the correct place
    //   to intercept a paste in a contenteditable. The browser provides the
    //   plain-text payload in `e.data`. Calling `preventDefault()` here and then
    //   re-inserting via `execCommand('insertText')` creates a single, clean
    //   undo entry for the entire paste — so the user can Ctrl+Z to remove
    //   the whole pasted block in one step instead of having the undo walk
    //   back through prior typed characters.
    //
    //   Doing the same thing in the `paste` event (the previous implementation)
    //   is unreliable: the `paste` event fires after the browser has already
    //   begun integrating the paste into the undo history, so the resulting
    //   `execCommand('insertText')` ends up grouped with prior typing and
    //   Ctrl+Z removes the wrong chunk.
    //
    // - The `paste` handler is kept for two reasons:
    //     1. Detecting image pastes (clipboard items are easiest to read here).
    //     2. A safety net for the rare case where `beforeinput` doesn't fire
    //        or `e.data` is null (very old / non-standard environments).
    //
    // The `_pasteHandled` flag prevents the fallback `paste` handler from
    // double-inserting when `beforeinput` already handled the paste.
    // The `_pasteInProgress` flag tells the `input` handler to commit the
    // new state to the undo stack immediately (no debounce) so the paste
    // is its own undo step even if the user hits Ctrl+Z right away.
    this._pasteHandled = false;
    this._pasteInProgress = false;

    this.element.addEventListener('beforeinput', (e) => {
      if (e.inputType !== 'insertFromPaste') return;
      if (typeof e.data !== 'string') return; // Fall through to `paste` handler

      e.preventDefault();
      this._pasteHandled = true;
      this._pasteInProgress = true;
      this._insertPlainText(e.data);
    });

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
        this._pasteHandled = true;
        this.onImagePaste(files);
        return;
      }

      // If `beforeinput` already handled this paste, do nothing.
      if (this._pasteHandled) {
        this._pasteHandled = false;
        return;
      }

      // Legacy fallback: insert as plain text.
      const text = clipData.getData('text/plain');
      if (text) {
        e.preventDefault();
        this._pasteHandled = true;
        this._pasteInProgress = true;
        this._insertPlainText(text);
      }
    });

    // Auto-resize, keep the active typing line visible, and feed the
    // custom undo/redo stack.
    this.element.addEventListener('input', (e) => {
      this._resizeAndRevealCaret();
      if (this._isUndoRedo) return;
      this._trackInput(e);
    });
  }

  /**
   * Called on every `input` event from the contenteditable.
   * - For a paste (`inputType: 'insertFromPaste'`, or the flag set by our
   *   `beforeinput`/`paste` handler) we commit the new state immediately
   *   so the paste is always one undo step.
   * - For everything else (typing, backspace, delete, etc.) we debounce so
   *   a burst of edits is grouped into one undo step.
   */
  _trackInput(e) {
    // If the user starts typing while a restore-RAF is still queued,
    // cancel it — otherwise it would later try to (re)apply a stale
    // selection from the snapshot on top of the user's new typing.
    if (this._restoreRAF) {
      cancelAnimationFrame(this._restoreRAF);
      this._restoreRAF = null;
    }
    if (this._inputDebounce) {
      clearTimeout(this._inputDebounce);
      this._inputDebounce = null;
    }

    const isPaste = this._pasteInProgress ||
      (e && (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop'));
    this._pasteInProgress = false;

    if (isPaste) {
      this._commitSnapshot();
    } else {
      this._inputDebounce = setTimeout(() => {
        this._commitSnapshot();
      }, this._undoDebounceMs);
    }
  }

  /**
   * Push the previous `_lastSnapshot` onto the undo stack and update
   * `_lastSnapshot` to the current DOM state. Clears the redo stack
   * (any new edit invalidates redo history, like every text editor).
   */
  _commitSnapshot() {
    if (this._inputDebounce) {
      clearTimeout(this._inputDebounce);
      this._inputDebounce = null;
    }
    if (this._isUndoRedo) return;

    // Don't push empty/identical snapshots back-to-back (avoids undo
    // steps that "do nothing").
    const current = this._captureSnapshot();
    if (this._lastSnapshot && this._lastSnapshot.html === current.html) {
      this._lastSnapshot = current;
      return;
    }

    this._undoStack.push(this._lastSnapshot);
    if (this._undoStack.length > this._maxUndoSize) this._undoStack.shift();
    this._redoStack = [];
    this._lastSnapshot = current;
  }

  /**
   * Capture the current contenteditable state (innerHTML + caret/selection
   * expressed as text-content offsets so we don't depend on exact DOM nodes
   * surviving across edits).
   */
  _captureSnapshot() {
    let selStart = 0;
    let selEnd = 0;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (this.element.contains(range.commonAncestorContainer)) {
        selStart = this._offsetFromElementStart(range.startContainer, range.startOffset);
        selEnd = this._offsetFromElementStart(range.endContainer, range.endOffset);
      }
    }
    return {
      html: this.element.innerHTML,
      selStart,
      selEnd,
    };
  }

  _offsetFromElementStart(node, offset) {
    const range = document.createRange();
    range.selectNodeContents(this.element);
    try {
      range.setEnd(node, offset);
    } catch {
      return 0;
    }
    return range.toString().length;
  }

  /**
   * Restore a captured snapshot by replacing innerHTML and re-placing the
   * selection by text offset. Runs under the `_isUndoRedo` flag so the
   * resulting `input` event isn't re-tracked.
   *
   * The selection restore is deferred to the next animation frame. On
   * a contenteditable, `innerHTML = ...` triggers a browser pass that
   * can reset the selection (notably to position 0) right after we set
   * it. Deferring lets those mutations settle first so the caret ends
   * up where the snapshot says it should be.
   */
  _restoreSnapshot(snapshot) {
    // If a previous restore is still queued, cancel it so we don't end
    // up applying a stale selection on top of a newer restore.
    if (this._restoreRAF) {
      cancelAnimationFrame(this._restoreRAF);
      this._restoreRAF = null;
    }
    this._isUndoRedo = true;
    try {
      this.element.innerHTML = snapshot.html;
    } catch {
      this.element.innerHTML = snapshot.html;
    }
    this._restoreRAF = requestAnimationFrame(() => {
      this._restoreRAF = null;
      this._setSelectionByTextOffset(snapshot.selStart, snapshot.selEnd);
      this._isUndoRedo = false;
      this._resizeAndRevealCaret();
    });
  }

  _setSelectionByTextOffset(start, end) {
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let cur = 0;
    let sNode = null, sOff = 0, eNode = null, eOff = 0;
    let node;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (sNode === null && cur + len >= start) {
        sNode = node;
        sOff = start - cur;
      }
      if (eNode === null && cur + len >= end) {
        eNode = node;
        eOff = end - cur;
        break;
      }
      cur += len;
    }

    // If we couldn't locate a text node (e.g. element is empty), place
    // the caret at the end of the element.
    if (!sNode) {
      const range = document.createRange();
      range.selectNodeContents(this.element);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    if (!eNode) {
      eNode = sNode;
      eOff = sOff;
    }

    const sMax = sNode.nodeValue ? sNode.nodeValue.length : 0;
    const eMax = eNode.nodeValue ? eNode.nodeValue.length : 0;
    const range = document.createRange();
    try {
      range.setStart(sNode, Math.min(Math.max(0, sOff), sMax));
      range.setEnd(eNode, Math.min(Math.max(0, eOff), eMax));
    } catch {
      range.selectNodeContents(this.element);
      range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Undo one step. Flushes any pending debounced commit first so a Ctrl+Z
   * pressed in the middle of a typing burst still creates a usable undo
   * step from the burst.
   */
  undo() {
    if (this._inputDebounce) {
      clearTimeout(this._inputDebounce);
      this._inputDebounce = null;
      this._commitSnapshot();
    }
    if (this._undoStack.length === 0) return false;

    const current = this._captureSnapshot();
    this._redoStack.push(current);
    const previous = this._undoStack.pop();
    this._restoreSnapshot(previous);
    this._lastSnapshot = previous;
    return true;
  }

  redo() {
    if (this._redoStack.length === 0) return false;

    const current = this._captureSnapshot();
    this._undoStack.push(current);
    const next = this._redoStack.pop();
    this._restoreSnapshot(next);
    this._lastSnapshot = next;
    return true;
  }

  /**
   * Reset the undo/redo history. Call this when the input is replaced
   * with content that shouldn't be undoable into (e.g. session switch,
   * `clear()` after sending, prefill from a file/selection).
   */
  resetUndoHistory() {
    this._undoStack = [];
    this._redoStack = [];
    this._lastSnapshot = this._captureSnapshot();
  }

  setAutocompleteActive(isActive) {
    this._autocompleteActive = isActive;
  }

  _resizeAndRevealCaret() {
    this.element.style.height = 'auto';
    this.element.style.height = Math.min(this.element.scrollHeight, 200) + 'px';
    this._revealCaret();
  }

  _revealCaret() {
    requestAnimationFrame(() => {
      if (document.activeElement !== this.element) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        this.element.scrollTop = this.element.scrollHeight;
        return;
      }

      const range = sel.getRangeAt(0).cloneRange();
      if (!this.element.contains(range.commonAncestorContainer)) return;
      if (!range.collapsed) range.collapse(false);

      const rect = this._getRangeRect(range);
      if (!rect) {
        this.element.scrollTop = this.element.scrollHeight;
        return;
      }

      const inputRect = this.element.getBoundingClientRect();
      const padding = 8;
      const bottomOverflow = rect.bottom - (inputRect.bottom - padding);
      if (bottomOverflow > 0) {
        this.element.scrollTop += bottomOverflow;
        return;
      }

      const topOverflow = (inputRect.top + padding) - rect.top;
      if (topOverflow > 0) {
        this.element.scrollTop -= topOverflow;
      }
    });
  }

  _getRangeRect(range) {
    const rects = range.getClientRects();
    if (rects.length > 0) return rects[rects.length - 1];

    const rect = range.getBoundingClientRect();
    if (rect && (rect.top || rect.bottom || rect.height)) return rect;

    return null;
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
    this.resetUndoHistory();
  }

  /**
   * Replace the input content with `text` (or `html` if provided) and
   * reset undo history so the user can't Ctrl+Z back into whatever was
   * here before (used by prefill / session restore).
   */
  setContent({ text, html } = {}) {
    this._isUndoRedo = true;
    try {
      if (typeof html === 'string') {
        this.element.innerHTML = html;
      } else if (typeof text === 'string') {
        this.element.textContent = text;
      } else {
        this.element.innerHTML = '';
      }
    } finally {
      this._isUndoRedo = false;
    }
    this.resetUndoHistory();
    this._resizeAndRevealCaret();
  }

  submit() {
    const text = this.getText();
    this.onSubmit(text);
  }

  /**
   * Insert plain text at the current selection, preferring `execCommand` so
   * the insertion is registered as a single undoable unit by the browser.
   * Falls back to the Range API if `execCommand` is unavailable or fails
   * (e.g. some restricted webview environments).
   */
  _insertPlainText(text) {
    const success = document.execCommand('insertText', false, text);
    if (!success) {
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
      // Trigger input event for auto-resize (execCommand already dispatches one)
      this.element.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
