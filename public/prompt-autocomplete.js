/**
 * prompt-autocomplete.js — Prompt Autocomplete
 *
 * Slash command autocomplete popup for the chat input.
 */

export class PromptAutocomplete {
  constructor(chatInput, { getBaseCommands, getLoadedSkills }) {
    this.chatInput = chatInput;
    this.getBaseCommands = getBaseCommands;
    this.getLoadedSkills = getLoadedSkills;

    this.popup = document.getElementById('autocomplete-popup');
    this.index = -1;
    this.items = [];

    this._init();
  }

  _init() {
    this.chatInput.element.addEventListener('input', () => this._update());
    this.chatInput.element.addEventListener('keydown', (e) => this._handleKeydown(e));
  }

  isOpen() {
    return !this.popup.classList.contains('hidden');
  }

  close() {
    this.popup.classList.add('hidden');
    this.chatInput.setAutocompleteActive(false);
  }

  _update() {
    const rawText = this.chatInput.element.textContent;

    if (!rawText.startsWith('/')) {
      this.popup.classList.add('hidden');
      this.chatInput.setAutocompleteActive(false);
      return;
    }

    const query = rawText.slice(1).toLowerCase();
    const baseCommands = this.getBaseCommands();
    const loadedSkills = this.getLoadedSkills();

    const suggestions = [
      ...baseCommands.map(cmd => ({ type: 'command', icon: cmd.icon, label: cmd.label, desc: cmd.desc, action: cmd.action })),
      ...loadedSkills.map(skill => ({ type: 'skill', icon: '✨', label: `skill:${skill.name}`, desc: skill.description, skillName: skill.name }))
    ].filter(cmd => cmd.label.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query));

    if (suggestions.length === 0) {
      this.popup.classList.add('hidden');
      this.chatInput.setAutocompleteActive(false);
      return;
    }

    this.items = suggestions;
    this.index = 0;

    this.popup.innerHTML = suggestions.map((cmd, i) => `
      <div class="autocomplete-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
        <div class="autocomplete-icon">${cmd.icon}</div>
        <div class="autocomplete-label" style="font-weight: bold; color: var(--vscode-symbolIcon-functionForeground)">/${cmd.label}</div>
        <div class="autocomplete-desc">${this._escapeHtml(cmd.desc)}</div>
      </div>
    `).join('');

    this.popup.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => this._execute(parseInt(el.dataset.index)));
    });

    this.popup.classList.remove('hidden');
    this.chatInput.setAutocompleteActive(true);
  }

  _execute(index) {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];

    this.popup.classList.add('hidden');
    this.chatInput.setAutocompleteActive(false);

    if (item.type === 'command') {
      this.chatInput.element.textContent = '';
      item.action();
    } else if (item.type === 'skill') {
      this.chatInput.element.textContent = `/${item.label} `;
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(this.chatInput.element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  _handleKeydown(e) {
    if (this.popup.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.index = (this.index + 1) % this.items.length;
      this._renderSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.index = (this.index - 1 + this.items.length) % this.items.length;
      this._renderSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this._execute(this.index);
    } else if (e.key === 'Escape') {
      this.popup.classList.add('hidden');
      this.chatInput.setAutocompleteActive(false);
    }
  }

  _renderSelection() {
    const items = this.popup.querySelectorAll('.autocomplete-item');
    items.forEach((item, i) => {
      if (i === this.index) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}
