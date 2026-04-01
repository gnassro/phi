# Changelog

## [0.2.0] - 2026-03-30

### Added
- **Skills Panel** — view all loaded Pi skills from the header toolbar
- **Slash command autocomplete** — type `/` in chat input for inline command & skill suggestions with arrow key navigation
- **Status bar button** — "Phi" button in the bottom status bar to quickly open chat from anywhere
- **About dialog** — Settings → Extension Info shows version, Pi SDK version, author, license, with Report Issue and GitHub links
- **Accounts auto-refresh** — panel updates instantly after login, logout, or API key changes
- **Inline account actions** — Logout and Remove buttons directly on each account row
- **phi-developer skill** — built-in project skill for AI agents working on the Phi codebase

### Fixed
- Skills data now correctly extracted from `resourceLoader.getSkills().skills` (was passing the wrapper object)
- Markdown renderer no longer misidentifies directory paths (e.g. `~/.pi/skills/`) as inline file pills
- Accurate session cost calculation matching Pi CLI (sums all entries, not just post-compaction)
- About modal z-index fixed so buttons are clickable above the overlay

### Changed
- Version display moved from footer pill to About dialog
- Pi SDK version auto-detected at build time
- **Modularized `app.js`** — extracted 7 ES6 class modules (`image-manager.js`, `model-picker.js`, `cost-monitor.js`, `command-palette.js`, `tree-panel.js`, `prompt-autocomplete.js`, `panels.js`), reducing app.js from ~1,732 to ~430 lines

## [0.1.0] - 2026-03-28

### Added
- Full AI chat interface in VS Code sidebar
- Tool execution cards (read, write, edit, bash) with live streaming output
- Inline diff view for edit tool
- Collapsible thinking blocks with toggle in settings
- Session history panel with search and favorites
- Conversation tree — browse branches, navigate with summary, set labels
- Model dropdown with search across all available providers
- Thinking level cycling (off / low / medium / high)
- Context compaction (auto + manual with progress indicator)
- Session cost and token usage display with context window visualizer
- OAuth login (Claude, ChatGPT, GitHub Copilot, Google Gemini, and more)
- API key management for 17+ providers
- Editor context integration — add selection or file to chat
- Keyboard shortcuts: `⌘+Shift+L` (open chat), `⌘+` (add selection), `Escape` (abort)
- Native VS Code theming via `--vscode-*` CSS variables
- CSS tooltips on all header buttons
- Cache-busting for webview assets
