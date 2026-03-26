/**
 * Session Sidebar — Lists sessions, handles switching
 * Adapted from Tau for VS Code IPC (no HTTP fetch).
 * Sessions are loaded via VscodeIPC messages instead of /api/sessions.
 */

export class SessionSidebar {
  constructor(container, onSessionSelect) {
    this.container = container;
    this.onSessionSelect = onSessionSelect;
    this.activeSessionFile = null;
    this.sessions = [];
    this.searchQuery = '';
    this.favourites = JSON.parse(localStorage.getItem('phi-favourites') || '[]');
  }

  saveFavourites() {
    localStorage.setItem('phi-favourites', JSON.stringify(this.favourites));
  }

  isFavourite(filePath) {
    return this.favourites.includes(filePath);
  }

  toggleFavourite(filePath) {
    const idx = this.favourites.indexOf(filePath);
    if (idx >= 0) {
      this.favourites.splice(idx, 1);
    } else {
      this.favourites.push(filePath);
    }
    this.saveFavourites();
    this.render();
  }

  /**
   * Update the session list. Called when sessions_list message arrives.
   */
  setSessions(sessions) {
    this.sessions = sessions || [];
    this.render();
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.applySearch();
  }

  applySearch() {
    if (!this.searchQuery) {
      this.container.querySelectorAll('.session-item').forEach(el => el.classList.remove('hidden'));
      return;
    }
    this.container.querySelectorAll('.session-item').forEach(item => {
      const title = (item.querySelector('.session-title')?.textContent || '').toLowerCase();
      item.classList.toggle('hidden', !title.includes(this.searchQuery));
    });
  }

  setActive(filePath) {
    this.activeSessionFile = filePath;
    this.container.querySelectorAll('.session-item').forEach(el => {
      el.classList.toggle('active', el.dataset.filePath === filePath);
    });
  }

  clearActive() {
    this.activeSessionFile = null;
    this.container.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
  }

  buildSessionItem(session) {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.dataset.filePath = session.filePath || session.path || '';

    if (item.dataset.filePath === this.activeSessionFile) {
      item.classList.add('active');
    }

    const title = session.name || session.firstMessage || 'Empty session';
    const time = this.formatTime(session.mtime || session.modified || session.timestamp);
    const favIcon = this.isFavourite(item.dataset.filePath) ? '<span class="session-fav-icon">★</span>' : '';

    item.innerHTML = `
      <div class="session-title-row">
        ${favIcon}
        <div class="session-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</div>
      </div>
      <div class="session-meta">${time}</div>
    `;

    item.addEventListener('click', () => this.onSessionSelect(session));

    // Long-press / right-click for favourite toggle
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.toggleFavourite(item.dataset.filePath);
    });

    return item;
  }

  render() {
    if (this.sessions.length === 0) {
      this.container.innerHTML = '<div class="session-loading">No sessions found</div>';
      return;
    }

    this.container.innerHTML = '';

    // Favourites section
    const favSessions = this.sessions.filter(s =>
      this.isFavourite(s.filePath || s.path || '')
    );

    if (favSessions.length > 0) {
      const favGroup = document.createElement('div');
      favGroup.className = 'favourites-group';

      const header = document.createElement('div');
      header.className = 'project-header favourites-header';
      header.innerHTML = `<span class="fav-star">★</span> <span>Favourites</span> <span class="project-count">${favSessions.length}</span>`;
      favGroup.appendChild(header);

      const sessionsDiv = document.createElement('div');
      sessionsDiv.className = 'project-sessions';
      for (const session of favSessions) {
        sessionsDiv.appendChild(this.buildSessionItem(session));
      }
      favGroup.appendChild(sessionsDiv);
      this.container.appendChild(favGroup);
    }

    // All sessions (sorted by most recent)
    const sorted = [...this.sessions].sort((a, b) =>
      new Date(b.mtime || b.modified || 0).getTime() - new Date(a.mtime || a.modified || 0).getTime()
    );

    const allGroup = document.createElement('div');
    allGroup.className = 'project-group';

    const sessionsDiv = document.createElement('div');
    sessionsDiv.className = 'project-sessions';
    for (const session of sorted) {
      sessionsDiv.appendChild(this.buildSessionItem(session));
    }
    allGroup.appendChild(sessionsDiv);
    this.container.appendChild(allGroup);

    if (this.searchQuery) this.applySearch();
  }

  formatTime(timestamp) {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const days = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (days === 1) return 'Yesterday';
      if (days < 7) return date.toLocaleDateString([], { weekday: 'long' });
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
