/**
 * panels.js — Side Panels Manager
 *
 * Manages Settings, About, Accounts, History, and Skills panels.
 */
import { VscodeIPC } from './vscode-ipc.js';

export class PanelsManager {
  constructor({ sidebar, chatInput, onSessionSelect, onNewSession, onToggleCompletionSound }) {
    this.sidebar = sidebar;
    this.chatInput = chatInput;
    this.onSessionSelect = onSessionSelect;
    this.onNewSession = onNewSession;
    this.onToggleCompletionSound = onToggleCompletionSound;
    this.loadedSkills = [];

    // DOM refs - Settings
    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsPanel = document.getElementById('settings-panel');
    this.settingsOverlay = document.getElementById('settings-overlay');
    this.settingsClose = document.getElementById('settings-close');
    this.toggleAutoCompact = document.getElementById('toggle-auto-compact');
    this.btnThinkingLevel = document.getElementById('btn-thinking-level');
    this.toggleShowThinking = document.getElementById('toggle-show-thinking');
    this.toggleCompletionSound = document.getElementById('toggle-completion-sound');
    this.manageExtensionsBtn = document.getElementById('manage-extensions-btn');

    // DOM refs - Extensions
    this.extensionsPanel = document.getElementById('extensions-panel');
    this.extensionsOverlay = document.getElementById('extensions-overlay');
    this.extensionsClose = document.getElementById('extensions-close');
    this.extensionsList = document.getElementById('settings-extensions-list');

    // DOM refs - About
    this.aboutInfoBtn = document.getElementById('about-info-btn');
    this.aboutModal = document.getElementById('about-modal');
    this.aboutOverlay = document.getElementById('about-overlay');
    this.aboutClose = document.getElementById('about-close');
    this.aboutReportIssue = document.getElementById('about-report-issue');
    this.aboutGithub = document.getElementById('about-github');

    // DOM refs - Accounts
    this.accountsBtn = document.getElementById('accounts-btn');
    this.accountsPanel = document.getElementById('accounts-panel');
    this.accountsOverlay = document.getElementById('accounts-overlay');
    this.accountsClose = document.getElementById('accounts-close');
    this.accountsList = document.getElementById('accounts-list');
    this.btnLogin = document.getElementById('btn-login');

    // DOM refs - History
    this.historyBtn = document.getElementById('history-btn');
    this.historyPanel = document.getElementById('history-panel');
    this.historyOverlay = document.getElementById('history-overlay');
    this.historyClose = document.getElementById('history-close');
    this.sessionSearchInput = document.getElementById('session-search-input');
    this.newChatBtn = document.getElementById('new-chat-btn');

    // DOM refs - Skills
    this.skillsBtn = document.getElementById('skills-btn');
    this.skillsPanel = document.getElementById('skills-panel');
    this.skillsOverlay = document.getElementById('skills-overlay');
    this.closeSkillsBtn = document.getElementById('close-skills-btn');
    this.skillsList = document.getElementById('skills-list');

    this._init();
  }

  _init() {
    // ── Settings ──
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.settingsOverlay.addEventListener('click', () => this.closeSettings());

    this.toggleAutoCompact.addEventListener('click', () => {
      const isOn = this.toggleAutoCompact.classList.contains('on');
      this.toggleAutoCompact.className = `settings-toggle${isOn ? '' : ' on'}`;
      VscodeIPC.send({ type: 'set_auto_compaction', enabled: !isOn });
    });

    this.manageExtensionsBtn.addEventListener('click', () => this.openExtensions());
    this.extensionsClose.addEventListener('click', () => this.closeExtensions());
    this.extensionsOverlay.addEventListener('click', () => this.closeExtensions());

    VscodeIPC.on('extensions_list', (data) => {
      this.renderExtensions(data.extensions || []);
    });

    this.btnThinkingLevel.addEventListener('click', () => {
      VscodeIPC.send({ type: 'cycle_thinking_level' });
    });

    // Show thinking toggle
    const showThinking = localStorage.getItem('phi-show-thinking') !== 'false';
    this.toggleShowThinking.className = `settings-toggle${showThinking ? ' on' : ''}`;
    if (!showThinking) document.body.classList.add('hide-thinking');

    this.toggleShowThinking.addEventListener('click', () => {
      const isOn = this.toggleShowThinking.classList.contains('on');
      this.toggleShowThinking.className = `settings-toggle${isOn ? '' : ' on'}`;
      document.body.classList.toggle('hide-thinking', isOn);
      localStorage.setItem('phi-show-thinking', !isOn);
    });

    const completionSoundEnabled = localStorage.getItem('phi-completion-sound') === 'true';
    this.toggleCompletionSound.className = `settings-toggle${completionSoundEnabled ? ' on' : ''}`;

    this.toggleCompletionSound.addEventListener('click', () => {
      const isOn = this.toggleCompletionSound.classList.contains('on');
      const nextValue = !isOn;
      this.toggleCompletionSound.className = `settings-toggle${nextValue ? ' on' : ''}`;
      localStorage.setItem('phi-completion-sound', String(nextValue));
      this.onToggleCompletionSound?.(nextValue);
    });

    // ── About ──
    this.aboutInfoBtn.addEventListener('click', () => this.openAbout());
    this.aboutClose.addEventListener('click', () => this.closeAbout());
    this.aboutOverlay.addEventListener('click', () => this.closeAbout());
    this.aboutReportIssue.addEventListener('click', () => {
      VscodeIPC.send({ type: 'open_url', url: 'https://github.com/gnassro/phi/issues/new' });
    });
    this.aboutGithub.addEventListener('click', () => {
      VscodeIPC.send({ type: 'open_url', url: 'https://github.com/gnassro/phi' });
    });

    // ── Accounts ──
    this.accountsBtn.addEventListener('click', () => this.openAccounts());
    this.accountsClose.addEventListener('click', () => this.closeAccounts());
    this.accountsOverlay.addEventListener('click', () => this.closeAccounts());
    this.btnLogin.addEventListener('click', () => VscodeIPC.send({ type: 'login' }));

    VscodeIPC.on('accounts_list', (msg) => this._renderAccountsList(msg));

    // ── History ──
    this.historyBtn.addEventListener('click', () => this.openHistory());
    this.historyClose.addEventListener('click', () => this.closeHistory());
    this.historyOverlay.addEventListener('click', () => this.closeHistory());

    this.sessionSearchInput.addEventListener('input', () => {
      this.sidebar.setSearchQuery(this.sessionSearchInput.value);
    });

    this.newChatBtn.addEventListener('click', () => {
      this.onNewSession();
      this.sidebar.clearActive();
    });

    // ── Skills ──
    this.skillsBtn.addEventListener('click', () => this.openSkills());
    this.closeSkillsBtn.addEventListener('click', () => this.closeSkills());
    this.skillsOverlay.addEventListener('click', () => this.closeSkills());

    VscodeIPC.on('skills_data', (msg) => this._renderSkillsData(msg));
  }

  // ── Settings ──
  openSettings() {
    this.settingsPanel.classList.remove('hidden');
    this.settingsOverlay.classList.remove('hidden');
    VscodeIPC.send({ type: 'get_state' });
  }

  closeSettings() {
    this.settingsPanel.classList.add('hidden');
    this.settingsOverlay.classList.add('hidden');
  }

  isSettingsOpen() { return !this.settingsPanel.classList.contains('hidden'); }

  /** Update settings panel from RPC state response */
  handleStateResponse(data) {
    if (data.thinkingLevel) {
      this.btnThinkingLevel.textContent = data.thinkingLevel;
    }
    if (typeof data.autoCompactionEnabled !== 'undefined') {
      this.toggleAutoCompact.className = `settings-toggle${data.autoCompactionEnabled ? ' on' : ''}`;
    }
  }

  /** Update thinking level display in settings */
  handleThinkingResponse(data) {
    if (data?.level) {
      this.btnThinkingLevel.textContent = data.level;
    }
  }

  openExtensions() {
    this.closeSettings();
    this.extensionsList.replaceChildren(this._createExtensionsLoading());
    this.extensionsOverlay.classList.remove('hidden');
    this.extensionsPanel.classList.remove('hidden');
    VscodeIPC.send({ type: 'get_extensions' });
  }

  closeExtensions() {
    this.extensionsOverlay.classList.add('hidden');
    this.extensionsPanel.classList.add('hidden');
  }

  isExtensionsOpen() { return !this.extensionsPanel.classList.contains('hidden'); }

  renderExtensions(extensions) {
    if (!this.extensionsList) return;
    this.extensionsList.replaceChildren();

    if (extensions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'extensions-loading';
      empty.textContent = 'No extensions loaded.';
      this.extensionsList.appendChild(empty);
      return;
    }

    for (const ext of extensions) {
      const row = document.createElement('div');
      row.className = 'extension-row';

      const labelContainer = document.createElement('div');
      labelContainer.className = 'settings-row-text';

      const nameLine = document.createElement('div');
      nameLine.className = 'extension-name-line';

      const nameLabel = document.createElement('span');
      nameLabel.className = 'settings-label';
      nameLabel.textContent = ext.name;
      nameLabel.dataset.tooltip = ext.id;
      nameLine.appendChild(nameLabel);

      if (ext.isBuiltIn) {
        const badge = document.createElement('span');
        badge.className = 'extension-badge';
        badge.textContent = 'Built-in';
        nameLine.appendChild(badge);
      }

      const idLabel = document.createElement('span');
      idLabel.className = 'settings-meta extension-id';
      idLabel.textContent = ext.id;

      labelContainer.appendChild(nameLine);
      labelContainer.appendChild(idLabel);

      const toggle = document.createElement('button');
      toggle.className = `settings-toggle${ext.enabled ? ' on' : ''}`;
      toggle.setAttribute('aria-label', `${ext.enabled ? 'Disable' : 'Enable'} ${ext.name}`);
      toggle.addEventListener('click', () => {
        const isCurrentlyOn = toggle.classList.contains('on');
        toggle.className = `settings-toggle${isCurrentlyOn ? '' : ' on'}`;
        toggle.setAttribute('aria-label', `${isCurrentlyOn ? 'Enable' : 'Disable'} ${ext.name}`);
        VscodeIPC.send({ type: 'toggle_extension', id: ext.id, enabled: !isCurrentlyOn });
      });

      row.appendChild(labelContainer);
      row.appendChild(toggle);
      this.extensionsList.appendChild(row);
    }
  }

  _createExtensionsLoading() {
    const loading = document.createElement('div');
    loading.className = 'extensions-loading';
    loading.textContent = 'Loading extensions...';
    return loading;
  }

  // ── About ──
  openAbout() {
    this.closeSettings();
    this.aboutOverlay.classList.remove('hidden');
    this.aboutModal.classList.remove('hidden');
  }

  closeAbout() {
    this.aboutOverlay.classList.add('hidden');
    this.aboutModal.classList.add('hidden');
  }

  // ── Accounts ──
  openAccounts() {
    this.accountsPanel.classList.remove('hidden');
    this.accountsOverlay.classList.remove('hidden');
    VscodeIPC.send({ type: 'get_accounts' });
  }

  closeAccounts() {
    this.accountsPanel.classList.add('hidden');
    this.accountsOverlay.classList.add('hidden');
  }

  isAccountsOpen() { return !this.accountsPanel.classList.contains('hidden'); }

  // ── History ──
  openHistory() {
    this.historyOverlay.classList.remove('hidden');
    this.historyPanel.classList.remove('hidden');
    VscodeIPC.send({ type: 'get_sessions' });
  }

  closeHistory() {
    this.historyOverlay.classList.add('hidden');
    this.historyPanel.classList.add('hidden');
  }

  isHistoryOpen() { return !this.historyPanel.classList.contains('hidden'); }

  handleSessionSelect(session) {
    this.sidebar.setActive(session.filePath || session.path || '');
    const sessionPath = session.filePath || session.path || '';
    if (sessionPath) {
      VscodeIPC.send({ type: 'switch_session', sessionPath });
    }
    this.closeHistory();
    this.onSessionSelect(session);
  }

  // ── Skills ──
  openSkills() {
    this.skillsOverlay.classList.remove('hidden');
    this.skillsPanel.classList.remove('hidden');
    VscodeIPC.send({ type: 'get_skills' });
  }

  closeSkills() {
    this.skillsOverlay.classList.add('hidden');
    this.skillsPanel.classList.add('hidden');
  }

  getLoadedSkills() { return this.loadedSkills; }

  /** Try to close the topmost open panel. Returns true if one was closed. */
  tryCloseTopmost() {
    if (this.isExtensionsOpen()) { this.closeExtensions(); return true; }
    if (this.isSettingsOpen()) { this.closeSettings(); return true; }
    if (this.isAccountsOpen()) { this.closeAccounts(); return true; }
    if (this.isHistoryOpen()) { this.closeHistory(); return true; }
    return false;
  }

  // ── Private renderers ──

  _renderAccountsList(msg) {
    if (!this.accountsList) return;
    this.accountsList.innerHTML = '';

    const activeOAuth = (msg.providers || []).filter(p => p.loggedIn);
    const activeApiKeys = (msg.apiKeyProviders || []).filter(p => p.hasKey);

    if (activeOAuth.length === 0 && activeApiKeys.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'accounts-empty';
      empty.textContent = 'No accounts configured yet';
      this.accountsList.appendChild(empty);
      return;
    }

    if (activeOAuth.length > 0) {
      const oauthHeader = document.createElement('div');
      oauthHeader.className = 'accounts-section-header';
      oauthHeader.textContent = 'OAuth';
      this.accountsList.appendChild(oauthHeader);

      activeOAuth.forEach(p => {
        this.accountsList.appendChild(this._createAccountRow(p.name, '✓', 'Logout', () => {
          VscodeIPC.send({ type: 'logout', providerId: p.id, providerName: p.name });
        }));
      });
    }

    if (activeApiKeys.length > 0) {
      const apiHeader = document.createElement('div');
      apiHeader.className = 'accounts-section-header';
      apiHeader.textContent = 'API Keys';
      this.accountsList.appendChild(apiHeader);

      activeApiKeys.forEach(p => {
        this.accountsList.appendChild(this._createAccountRow(p.name, '✓', 'Remove', () => {
          VscodeIPC.send({ type: 'remove_api_key', providerId: p.id, providerName: p.name });
        }));
      });
    }
  }

  _createAccountRow(name, statusText, actionLabel, actionCallback) {
    const row = document.createElement('div');
    row.className = 'account-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'account-name';
    nameSpan.textContent = name;
    row.appendChild(nameSpan);

    const rightSide = document.createElement('div');
    rightSide.style.display = 'flex';
    rightSide.style.alignItems = 'center';
    rightSide.style.gap = '8px';

    const status = document.createElement('span');
    status.className = 'account-status logged-in';
    status.textContent = statusText;
    rightSide.appendChild(status);

    const btn = document.createElement('button');
    btn.className = 'account-action-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionCallback);
    rightSide.appendChild(btn);

    row.appendChild(rightSide);
    return row;
  }

  _renderSkillsData(msg) {
    this.loadedSkills = msg.skills || [];
    this.skillsList.innerHTML = '';

    if (this.loadedSkills.length === 0) {
      this.skillsList.innerHTML = '<div style="opacity:0.5; text-align:center; padding: 20px 0;">No skills currently loaded.<br><br><span style="font-size: 10px;">Drop a <code>SKILL.md</code> in your <code>.pi/skills/</code> folder.</span></div>';
      return;
    }

    this.loadedSkills.forEach(skill => {
      const card = document.createElement('div');
      card.style.background = 'var(--vscode-editor-background)';
      card.style.border = '1px solid var(--vscode-panel-border)';
      card.style.borderRadius = '6px';
      card.style.padding = '10px';

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <strong style="color: var(--vscode-symbolIcon-functionForeground); font-size: 13px;">${this._escapeHtml(skill.name)}</strong>
          <code class="skill-command-btn" data-skill="${this._escapeHtml(skill.name)}" style="font-size: 10px; opacity: 0.7; cursor: pointer;">/skill:${this._escapeHtml(skill.name)}</code>
        </div>
        <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">${this._escapeHtml(skill.description)}</div>
      `;

      this.skillsList.appendChild(card);
    });

    // Attach event listeners for the skill commands
    this.skillsList.querySelectorAll('.skill-command-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skillName = e.target.getAttribute('data-skill');
        const inputEl = document.getElementById('message-input');
        inputEl.textContent = `/skill:${skillName} `;
        inputEl.focus();

        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(inputEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        this.closeSkills();
      });
    });

    // Notify external listeners (command palette, autocomplete)
    if (this.onSkillsUpdate) this.onSkillsUpdate(this.loadedSkills);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}
