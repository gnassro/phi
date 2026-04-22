# Changelog

## [0.3.3] - 2026-04-22

### Docs
- move donation link from README to GitHub Sponsors config


## [0.3.2] - 2026-04-22

### Fixed
- remove custom provider option from add api key flow
- upgrade phi to pi sdk 0.68.1


## [0.3.1] - 2026-04-14

### Fixed
- migrate phi to pi sdk 0.67.1

### Docs
- document custom provider setup in README


## [0.3.0] - 2026-04-01

### Added
- add CI/CD pipeline — GitHub Actions auto-publish to Open VSX on tag push
- expand attach button to all file types, rename image-manager to attachment-manager
- add delete session functionality via system trash
- release script queries Open VSX API for real production version
- add automated release versioning with .published-version tracking

### Fixed
- release script requires master branch and shows summary before proceeding
- remove auto-commit instruction from phi-developer skill (contradicted rule 15)
- remove drag-and-drop code (unsupported in VS Code webview iframes)
- upgrade pi-coding-agent to 0.64.0 and update tool rendering
- tree panel crashes on large sessions — send flat array instead of nested tree
- tree panel stuck on Loading for large sessions (stack overflow)

### Docs
- add attach button and paste image to README
- update commit workflow rule — let user control when to commit, check git status for manual changes
- add rule 17 (flatten trees for IPC) and update tree_data IPC table
- update ipc-protocol.md — tree_data uses flat nodes array, not nested tree
- add mandatory post-change checklist to phi-developer skill
- add rule 15 — commit after every change with conventional commit messages
- sync AGENTS.md with current state — fix version, IPC tables, deduplicate commands
- update all docs for app.js modularization and new IPC messages
- add screenshot to README for Open VSX listing

### Changed
- remove .published-version, simplify release script — no offline fallback, no build-number in releases
- remove unpublished 0.2.1 changelog section (version will be 0.3.0)


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
