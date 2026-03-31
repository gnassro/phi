/**
 * model-picker.js — Model Picker Dropdown
 *
 * Manages the model dropdown, search, selection, and thinking level button.
 */
import { VscodeIPC } from './vscode-ipc.js';

export class ModelPicker {
  constructor() {
    this.currentModelId = '';
    this.availableModels = [];
    this.currentThinkingLevel = 'off';
    this.contextWindowSize = 0;

    /** Optional callback when context window size changes */
    this.onContextWindowChange = null;

    // DOM refs
    this.dropdown = document.getElementById('model-dropdown');
    this.dropdownBtn = document.getElementById('model-dropdown-btn');
    this.dropdownLabel = document.getElementById('model-dropdown-label');
    this.dropdownMenu = document.getElementById('model-dropdown-menu');
    this.thinkingBtn = document.getElementById('thinking-btn');

    this._init();
  }

  _init() {
    this.dropdownBtn.addEventListener('click', () => {
      if (!this.dropdownMenu.classList.contains('hidden')) { this.close(); return; }
      VscodeIPC.send({ type: 'get_available_models' });
      this.dropdown._pendingOpen = true;
    });

    document.addEventListener('click', (e) => {
      if (!this.dropdown.contains(e.target)) this.close();
    });

    this.thinkingBtn.addEventListener('click', () => {
      VscodeIPC.send({ type: 'cycle_thinking_level' });
    });
  }

  setModel(model) {
    if (model) {
      this.currentModelId = model.id || '';
      if (model.contextWindow) this.contextWindowSize = model.contextWindow;
      this._updateLabel();
    }
  }

  setThinkingLevel(level) {
    this.currentThinkingLevel = level;
    this._updateThinkingBtn();
  }

  getCurrentModelId() { return this.currentModelId; }
  getContextWindowSize() { return this.contextWindowSize; }

  isOpen() { return !this.dropdownMenu.classList.contains('hidden'); }

  close() {
    this.dropdownMenu.classList.add('hidden');
    this.dropdown.classList.remove('open');
  }

  /** Handle RPC response for get_state */
  handleStateResponse(data) {
    if (data.model) {
      this.currentModelId = data.model.id || '';
      if (data.model.contextWindow) this.contextWindowSize = data.model.contextWindow;
      this._updateLabel();
    }
    if (data.thinkingLevel) {
      this.currentThinkingLevel = data.thinkingLevel;
      this._updateThinkingBtn();
    }
  }

  /** Handle RPC response for get_available_models */
  handleModelsResponse(data) {
    if (data?.models) {
      this.availableModels = data.models;
      if (this.dropdown._pendingOpen) {
        this.dropdown._pendingOpen = false;
        this._openDropdown();
      }
    }
  }

  /** Handle RPC response for cycle_thinking_level */
  handleThinkingResponse(data) {
    if (data?.level) {
      this.currentThinkingLevel = data.level;
      this._updateThinkingBtn();
    }
  }

  _updateLabel() {
    const shortName = this.currentModelId.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    this.dropdownLabel.textContent = shortName || 'model';
  }

  _updateThinkingBtn() {
    this.thinkingBtn.textContent = this.currentThinkingLevel;
    this.thinkingBtn.classList.toggle('off', this.currentThinkingLevel === 'off');
  }

  _openDropdown() {
    this.dropdownMenu.innerHTML = '';
    const search = document.createElement('input');
    search.className = 'model-dropdown-search';
    search.placeholder = 'Search models…';
    search.type = 'text';
    this.dropdownMenu.appendChild(search);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'model-dropdown-items';
    this.dropdownMenu.appendChild(itemsContainer);

    const renderItems = (filter) => {
      itemsContainer.innerHTML = '';
      const query = (filter || '').toLowerCase();
      this.availableModels.forEach(m => {
        const shortName = m.id.replace(/-\d{8}$/, '');
        if (query && !shortName.toLowerCase().includes(query) && !(m.provider || '').toLowerCase().includes(query)) return;
        const el = document.createElement('div');
        el.className = `model-dropdown-item${m.id === this.currentModelId ? ' active' : ''}`;
        const ctxK = m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : '';
        const providerLabel = m.provider && m.provider !== 'anthropic' ? `<span class="model-dropdown-item-provider">${m.provider}</span>` : '';
        el.innerHTML = `<span>${shortName}${providerLabel}</span><span class="model-dropdown-item-ctx">${ctxK}</span>`;
        el.addEventListener('click', () => {
          this.close();
          VscodeIPC.send({ type: 'set_model', provider: m.provider, modelId: m.id });
          this.currentModelId = m.id;
          this._updateLabel();
          if (m.contextWindow) {
            this.contextWindowSize = m.contextWindow;
            if (this.onContextWindowChange) this.onContextWindowChange(m.contextWindow);
          }
        });
        itemsContainer.appendChild(el);
      });
    };

    renderItems('');
    search.addEventListener('input', () => renderItems(search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.close(); e.stopPropagation(); }
      if (e.key === 'Enter') { const first = itemsContainer.querySelector('.model-dropdown-item'); if (first) first.click(); }
    });

    this.dropdownMenu.classList.remove('hidden');
    this.dropdown.classList.add('open');
    requestAnimationFrame(() => search.focus());
  }
}
