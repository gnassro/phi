/**
 * command-palette.js — Command Palette
 *
 * The single command palette, opened two ways:
 *  - the command button: full list + blocking dimming overlay;
 *  - typing "/" in the composer: filtered list + click-through overlay (the composer
 *    keeps the focus, so the user can carry on typing).
 */

export class CommandPalette {
  constructor({ chatInput, onCompact, onSessionStats, onOpenTree, onExpandAllTools, onCollapseAllTools }) {
    this.chatInput = chatInput;
    this.baseCommands = [
      { icon: '🗜️', label: 'Compact', desc: 'Compact context to save tokens', action: onCompact },
      { icon: '📊', label: 'Session Stats', desc: 'Show session statistics', action: onSessionStats },
      { icon: '🌿', label: 'Conversation Tree', desc: 'Browse and navigate conversation branches', action: onOpenTree },
      { icon: '⬇️', label: 'Expand All Tools', desc: 'Expand all tool cards', action: onExpandAllTools },
      { icon: '⬆️', label: 'Collapse All Tools', desc: 'Collapse all tool cards', action: onCollapseAllTools },
    ];
    this.commands = [...this.baseCommands];
    this.loadedSkills = [];
    /** Set by PromptAutocomplete: called with the index of a clicked row */
    this.onPick = null;
    /** Set by PromptAutocomplete: the button took over the modal */
    this.onOpen = null;
    /** Set by PromptAutocomplete: the modal was closed from anywhere */
    this.onClose = null;
    /** True while the modal is being driven by the "/" filter (click-through overlay) */
    this.isFiltering = false;

    // DOM refs
    this.palette = document.getElementById('command-palette');
    this.overlay = document.getElementById('command-palette-overlay');
    this.closeBtn = document.getElementById('command-palette-close');
    this.list = document.getElementById('command-list');
    this.btn = document.getElementById('command-btn');

    this._init();
  }

  _init() {
    this.btn.addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());

    // Outside click closes it in both modes (the "/" overlay is click-through, so the
    // click lands on the real element). In "/" mode the composer stays usable, so clicks
    // inside it must not close the list.
    document.addEventListener('click', (e) => {
      if (!this.isOpen()) return;
      if (this.palette.contains(e.target) || this.btn.contains(e.target)) return;
      if (this.isFiltering && this.chatInput.element.contains(e.target)) return;
      this.close();
    });
  }

  updateSkills(skills) {
    this.loadedSkills = skills || [];
    this.commands = [...this.baseCommands];
    if (this.loadedSkills.length > 0) {
      this.loadedSkills.forEach(skill => {
        this.commands.push({
          icon: '✨',
          label: `/skill:${skill.name}`,
          desc: skill.description,
          action: () => this.chatInput.setText(`/skill:${skill.name} `),
        });
      });
    }
  }

  /**
   * Build the rows and show the modal. One renderer for both flows, so escaping and
   * markup cannot drift apart. `activeIndex < 0` renders without a highlight.
   */
  _renderRows(items, activeIndex, onSelect) {
    this.list.innerHTML = '';
    items.forEach((cmd, i) => {
      const el = document.createElement('div');
      el.className = `command-item${i === activeIndex ? ' selected' : ''}`;
      const label = String(cmd.label).startsWith('/') ? cmd.label : `/${cmd.label}`;
      el.innerHTML = `<div class="command-icon">${cmd.icon}</div><div><div class="command-label">${this._esc(label)}</div><div class="command-desc">${this._esc(cmd.desc)}</div></div>`;
      el.addEventListener('click', () => onSelect(cmd, i));
      this.list.appendChild(el);
    });
    this.palette.classList.remove('hidden');
  }

  /**
   * Filtered list for the "/" autocomplete, with a highlighted row.
   * Same dimming overlay as the button mode, but click-through (`.passthrough`), so the
   * composer keeps the focus and the user keeps typing while the list filters.
   */
  showSuggestions(suggestions, activeIndex = 0) {
    this.isFiltering = true;
    this._renderRows(suggestions, activeIndex, (_cmd, i) => this.onPick?.(i));
    this.overlay.classList.remove('hidden');
    this.overlay.classList.add('passthrough');
    this._scrollActiveIntoView();
  }

  /** Move the keyboard highlight without re-rendering the list. */
  setActive(index) {
    this.list.querySelectorAll('.command-item').forEach((el, i) => {
      el.classList.toggle('selected', i === index);
    });
    this._scrollActiveIntoView();
  }

  _scrollActiveIntoView() {
    this.list.querySelector('.command-item.selected')?.scrollIntoView({ block: 'nearest' });
  }

  _esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  /** Opened by the command button: full list, blocking dimming overlay, no highlighting. */
  open() {
    this.isFiltering = false;
    this.onOpen?.();
    // Act on the captured row, not on an index: updateSkills() may replace the list
    this._renderRows(this.commands, -1, (cmd) => {
      this.close();
      cmd.action();
    });
    this.overlay.classList.remove('passthrough');
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.palette.classList.add('hidden');
    this.overlay.classList.add('hidden');
    this.onClose?.();
  }

  isOpen() {
    return !this.palette.classList.contains('hidden');
  }
}
