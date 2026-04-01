/**
 * command-palette.js — Command Palette
 *
 * Manages the command palette overlay with built-in and skill commands.
 */

export class CommandPalette {
  constructor({ onCompact, onSessionStats, onOpenTree, onExpandAllTools, onCollapseAllTools }) {
    this.baseCommands = [
      { icon: '🗜️', label: 'Compact', desc: 'Compact context to save tokens', action: onCompact },
      { icon: '📊', label: 'Session Stats', desc: 'Show session statistics', action: onSessionStats },
      { icon: '🌿', label: 'Conversation Tree', desc: 'Browse and navigate conversation branches', action: onOpenTree },
      { icon: '⬇️', label: 'Expand All Tools', desc: 'Expand all tool cards', action: onExpandAllTools },
      { icon: '⬆️', label: 'Collapse All Tools', desc: 'Collapse all tool cards', action: onCollapseAllTools },
    ];
    this.commands = [...this.baseCommands];
    this.loadedSkills = [];

    // DOM refs
    this.palette = document.getElementById('command-palette');
    this.overlay = document.getElementById('command-palette-overlay');
    this.list = document.getElementById('command-list');
    this.btn = document.getElementById('command-btn');

    this._init();
  }

  _init() {
    this.btn.addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', () => this.close());
  }

  getBaseCommands() { return this.baseCommands; }
  getLoadedSkills() { return this.loadedSkills; }

  updateSkills(skills) {
    this.loadedSkills = skills || [];
    this.commands = [...this.baseCommands];
    if (this.loadedSkills.length > 0) {
      this.loadedSkills.forEach(skill => {
        this.commands.push({
          icon: '✨',
          label: `/skill:${skill.name}`,
          desc: skill.description,
          action: () => {
            const inputEl = document.getElementById('message-input');
            inputEl.textContent = `/skill:${skill.name} `;
            inputEl.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(inputEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      });
    }
  }

  open() {
    this.list.innerHTML = '';
    this.commands.forEach(cmd => {
      const el = document.createElement('div');
      el.className = 'command-item';
      el.innerHTML = `<div class="command-icon">${cmd.icon}</div><div><div class="command-label">${cmd.label}</div><div class="command-desc">${cmd.desc}</div></div>`;
      el.addEventListener('click', () => { this.close(); cmd.action(); });
      this.list.appendChild(el);
    });
    this.palette.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.palette.classList.add('hidden');
    this.overlay.classList.add('hidden');
  }

  isOpen() {
    return !this.palette.classList.contains('hidden');
  }
}
