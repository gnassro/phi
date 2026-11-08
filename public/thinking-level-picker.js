/**
 * thinking-level-picker.js — Thinking Level Picker
 *
 * Manages the thinking-level dropdown used in the header and the Settings panel.
 * Reuses the model-dropdown markup and styles (`.thinking-dropdown` only
 * changes the color) and sends `set_thinking_level` on selection.
 */
import { VscodeIPC } from './vscode-ipc.js';

export class ThinkingLevelPicker {
  constructor(rootId) {
    this.root = document.getElementById(rootId);
    this.btn = this.root.querySelector('.model-dropdown-btn');
    this.label = this.root.querySelector('.model-dropdown-label');
    this.menu = this.root.querySelector('.model-dropdown-menu');
    this.currentLevel = 'off';
    this.availableLevels = [];

    this.btn.addEventListener('click', () => {
      if (!this.menu.classList.contains('hidden')) { this.close(); return; }
      this._open();
    });

    document.addEventListener('click', (e) => {
      if (!this.root.contains(e.target)) this.close();
    });

    this._updateDisabled();
  }

  setLevel(level) {
    if (!level) return;
    this.currentLevel = level;
    this.label.textContent = level;
    this.root.classList.toggle('off', level === 'off');
    if (!this.menu.classList.contains('hidden')) this._open();
  }

  setAvailableLevels(levels) {
    if (!Array.isArray(levels)) return;
    this.availableLevels = levels;
    this._updateDisabled();
    if (!this.menu.classList.contains('hidden')) this._open();
  }

  close() {
    this.menu.classList.add('hidden');
    this.root.classList.remove('open');
  }

  /** Disable the control when the model offers no thinking level to choose. */
  _updateDisabled() {
    const disabled = this.availableLevels.length <= 1;
    this.btn.disabled = disabled;
    if (disabled) this.close();
  }

  _open() {
    const levels = this.availableLevels.length ? this.availableLevels : [this.currentLevel];
    this.menu.innerHTML = '';
    levels.forEach(level => {
      const item = document.createElement('div');
      item.className = `model-dropdown-item${level === this.currentLevel ? ' active' : ''}`;
      item.textContent = level;
      item.addEventListener('click', () => {
        this.close();
        if (level === this.currentLevel) return;
        this.setLevel(level);
        VscodeIPC.send({ type: 'set_thinking_level', level });
      });
      this.menu.appendChild(item);
    });
    this.menu.classList.remove('hidden');
    this.root.classList.add('open');
  }
}
