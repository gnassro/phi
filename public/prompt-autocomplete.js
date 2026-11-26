/**
 * prompt-autocomplete.js — Slash-command filtering for the command palette
 *
 * Owns the "/" behaviour of the composer: filters the palette's command list by the
 * typed query and handles the keyboard (arrows, Enter, Escape). The list itself is
 * rendered by CommandPalette (`showSuggestions`), so there is one command palette.
 */

export class PromptAutocomplete {
  constructor(chatInput, { palette }) {
    this.chatInput = chatInput;
    this.palette = palette;

    this.index = -1;
    this.items = [];

    // The palette can be opened by the button or closed by its × / overlay / Escape:
    // either way the filtered state and the Enter guard must go.
    this.palette.onPick = (index) => this._execute(index);
    this.palette.onOpen = () => this._reset();
    this.palette.onClose = () => this._reset();

    this.chatInput.element.addEventListener('input', () => this._update());
    this.chatInput.element.addEventListener('keydown', (e) => this._handleKeydown(e));
  }

  _reset() {
    this.items = [];
    this.index = -1;
    this.chatInput.setCommandsListActive(false);
  }

  _update() {
    const rawText = this.chatInput.element.textContent;

    if (!rawText.startsWith('/')) {
      this.palette.close();
      return;
    }

    const query = rawText.slice(1).toLowerCase();
    const suggestions = this.palette.commands.filter(cmd =>
      cmd.label.toLowerCase().includes(query) || (cmd.desc || '').toLowerCase().includes(query)
    );

    if (suggestions.length === 0) {
      this.palette.close();
      return;
    }

    this.items = suggestions;
    this.index = 0;
    this.palette.showSuggestions(suggestions, this.index);
    this.chatInput.setCommandsListActive(true);
  }

  _execute(index) {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    this.palette.close(); // triggers onClose → _reset()
    // Every command takes over the composer: skill rows insert `/skill:name ` themselves
    this.chatInput.setText('');
    item.action();
  }

  _handleKeydown(e) {
    if (!this.items.length || !this.palette.isOpen()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.index = (this.index + 1) % this.items.length;
      this.palette.setActive(this.index);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.index = (this.index - 1 + this.items.length) % this.items.length;
      this.palette.setActive(this.index);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this._execute(this.index);
    } else if (e.key === 'Escape') {
      this.palette.close();
    }
  }
}
