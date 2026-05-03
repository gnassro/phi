# Phi — Task Tracker

This file tracks all tasks for the Phi project.
**Agents: update this file whenever you complete a task or identify a new one.**

---

## ✅ Done

### Project Scaffold
- [x] Project directory created at `/Users/macbook/StudioProjects/phi/`
- [x] `package.json` — extension manifest, scripts, dependencies
- [x] `tsconfig.json` — TypeScript compiler config (ESM, Node16 module resolution)
- [x] `.vscodeignore` — files excluded from `.vsix` package

### Documentation
- [x] `AGENTS.md` — master AI agent guide with doc-update mandate
- [x] `README.md` — user-facing project description
- [x] `docs/architecture.md` — full system design and data flows
- [x] `docs/ipc-protocol.md` — complete message protocol specification
- [x] `docs/pi-sdk.md` — Pi SDK usage patterns for this project
- [x] `docs/TASKS.md` — this file
- [x] `docs/ROADMAP.md` — project roadmap

### Extension Host (`src/`)
- [x] `src/extension.ts` — `activate()` / `deactivate()` entry point
- [x] `src/agent-manager.ts` — Pi SDK session lifecycle wrapper
- [x] `src/panel-manager.ts` — WebviewPanel creation with CSP nonce
- [x] `src/ipc-bridge.ts` — message routing between webview and extension host
- [x] `src/editor-context.ts` — reads VS Code selection, diagnostics (read-only)
- [x] `src/commands.ts` — all four VS Code commands registered
- [x] `src/utils.ts` — `getNonce()` helper for Content Security Policy

### Webview UI (`public/`)
- [x] `public/vscode-ipc.js` — `acquireVsCodeApi()` wrapper (replaces WebSocket)
- [x] `public/app.js` — main UI coordinator (basic version)
- [x] `public/chat-input.js` — ContentEditable rich-text input
- [x] `public/message-renderer.js` — message DOM rendering
- [x] `public/markdown.js` — Markdown → HTML renderer
- [x] `public/style.css` — basic styles

### Build & Launch
- [x] `pnpm install` succeeds
- [x] `pnpm run build` compiles with no TypeScript errors
- [x] F5 launches Extension Development Host
- [x] Webview panel opens via `Cmd+Shift+L`
- [x] Basic prompt → Pi response round-trip works

---

## 🔲 Pending

### Full Feature Set

> **Principle:** Phi is a standalone VS Code extension — Pi SDK runs directly in the extension host.
> All communication uses VS Code IPC (`VscodeIPC.send()` → `ipc-bridge.ts` → `agent-manager.ts` → Pi SDK).
>
> **Not included:** File browser (VS Code has Explorer), code editor pane (VS Code IS the editor),
> launcher/project picker (VS Code workspaces), PWA/service worker/manifest, mobile UI,
> custom theme picker (VS Code handles theming natively).

#### Tool Cards — `public/tool-card.js`, `public/state.js` ✅
- [x] Create `public/state.js` — StateManager for tracking tool execution state
- [x] Create `public/tool-card.js` — ToolCardRenderer
- [x] Wire `tool_execution_start/update/end` events in `app.js` → ToolCardRenderer
- [x] Add tool card CSS to `style.css`
- [x] Collapsible cards with chevron toggle (fixed CSP: uses addEventListener, not inline onclick)
- [x] Tool name + args preview in header (path for read/edit/write, command for bash)
- [x] Live streaming output while tool runs
- [x] Spinner while running, hidden when done (no text status labels)
- [x] Diff view for `edit` tool (red removed, green added)
- [x] Copy output button
- [x] Auto-collapse on completion

#### Header Bar ✅
- [x] Add header bar to webview HTML (in `panel-manager.ts` `buildWebviewHtml()`)
- [x] Model dropdown (label + chevron, dropdown with search)
- [x] Thinking level button (cycles off/low/medium/high)
- [x] New Chat button
- [x] History button (opens session history panel)
- [x] Settings button (opens settings panel)

#### Session History Panel — `public/session-sidebar.js` ✅
- [x] Create `public/session-sidebar.js` — session history panel
- [x] Overlay panel (not a sidebar — VS Code already has sidebars)
- [x] Session list grouped by project
- [x] Session search (title filter)
- [x] Session switching via IPC (`switch_session`)
- [x] Favourites (localStorage)
- [x] Time formatting (relative: "2h ago", "Yesterday")
- [x] Add history panel HTML to webview
- [x] Add history panel CSS to `style.css`

#### Settings Panel ✅
- [x] Create settings overlay panel in webview HTML
- [x] Show thinking toggle (local pref, hide/show `.thinking-block`)
- [x] Thinking level cycle button
- [x] Auto-compaction toggle
- [x] Experimental task alert sounds toggle (local pref for success/failure sounds, still under development/testing)
- [x] ~~Theme grid~~ — REMOVED: VS Code handles theming natively via `--vscode-*` variables
- [x] Accounts section moved to separate Accounts panel

#### Accounts Panel ✅
- [x] Separate panel with 🔑 key icon button in header (next to ⚙️ settings)
- [x] Login / Setup button (subscription OAuth + API-key/provider setup via VS Code QuickPick)
- [x] Per-account Logout / Remove actions in the active accounts list
- [x] `Phi: Add API Key` kept as a command shortcut instead of a separate Accounts-panel button
- [x] Dynamic API-key provider discovery from Pi's model registry (built-ins + custom providers)
- [x] Shows only active accounts (logged-in OAuth + stored API keys)
- [x] Empty state: "No accounts configured"
- [x] Closes with ✕, overlay click, or Escape

#### Themes ✅ (N/A)
- [x] **Decision:** No custom themes — extension uses VS Code's built-in `--vscode-*` CSS variables
- [x] `themes.js` reduced to no-op stub (exports empty functions)
- [x] All CSS rewritten to use `--vscode-*` variables exclusively
- [x] Theme grid removed from settings panel

#### Scroll-to-Bottom Button ✅
- [x] Add floating scroll-to-bottom button in webview HTML
- [x] Show when scrolled up, hide when at bottom
- [x] "New" badge when new messages arrive while scrolled up
- [x] Add CSS for scroll button

#### Cost & Token Display ✅
- [x] Add footer below input with session cost pill and token usage button
- [x] Track `sessionTotalCost` from `message_end` usage data
- [x] Track `lastInputTokens` from usage data
- [x] Show cost pill when cost > 0
- [x] Show context percentage when token data available
- [x] Warning (60%+) and critical (80%+) color states

#### Context Window Visualizer ✅
- [x] Clickable token usage → expand context breakdown
- [x] Stacked bar: Cached | Input | Available
- [x] Legend with token counts
- [x] Footer: "X% used — Xk / Xk tokens"

#### Command Palette ✅
- [x] Add command palette overlay in webview HTML
- [x] Command button in input area
- [x] Commands: Compact, Session Stats, Expand All Tools, Collapse All Tools
- [x] Add CSS for command palette

#### Keyboard Shortcuts ✅
- [x] `Escape` — abort streaming, or close open panels (settings, history, command palette, model dropdown)
- [x] `/` — focus message input (when not already in an input)

#### History Rendering Improvements ✅
- [x] Render tool cards in session history (not just user/assistant messages)
- [x] Render `toolResult` entries → attach output to tool cards
- [x] Render thinking blocks in history assistant messages
- [x] Proper content block handling (text + thinking interleaved)

### New IPC Messages ✅

#### Webview → Extension Host (all implemented)
- [x] `get_state` — returns model info, thinking level, auto-compaction state, session name
- [x] `get_available_models` — returns list of all models with provider, contextWindow
- [x] `set_model` — switch to a different model (provider + modelId)
- [x] `cycle_thinking_level` — cycle thinking level, returns new level
- [x] `compact` — trigger context compaction
- [x] `set_auto_compaction` — enable/disable auto-compaction
- [x] `get_session_stats` — returns SessionStats (message counts, token usage, cost)

#### Extension Host → Webview (all implemented)
- [x] `rpc_response` — generic response for RPC-style commands (success, data, error)
- [x] `accounts_list` — OAuth providers + API key providers with active status

### Agent Manager Additions (`src/agent-manager.ts`) ✅
- [x] `getState()` — returns `{ model, thinkingLevel, autoCompactionEnabled, sessionName }`
- [x] `getAvailableModels()` — returns `session.modelRegistry.getAvailable()`
- [x] `setModel(provider, modelId)` — finds model and calls `session.setModel()`
- [x] `cycleThinkingLevel()` — calls `session.cycleThinkingLevel()`, returns new level
- [x] `compact()` — calls `session.compact()`
- [x] `setAutoCompaction(enabled)` — calls `session.setAutoCompactionEnabled()`
- [x] `getSessionStats()` — calls `session.getSessionStats()`
- [x] `getContextUsage()` — calls `session.getContextUsage()`
- [x] `getOAuthProviders()` — returns OAuth provider list with typed login status
- [x] `getLoginProviders(authType)` — mirrors Pi's `/login` provider discovery using OAuth providers + model registry providers
- [x] `getStoredCredentialProviders(authType)` — lists stored OAuth/API-key credentials for removal flows
- [x] `login(providerId, callbacks)` — OAuth login via AuthStorage
- [x] `logout(providerId)` — OAuth logout via AuthStorage
- [x] `getApiKeyProviders()` — returns dynamically discovered API-key providers with stored-key status
- [x] `setApiKey(providerId, key)` — saves API key to `~/.phi/auth.json`
- [x] `removeApiKey(providerId)` — removes API key from `~/.phi/auth.json`

### Bug Fixes Applied
- [x] IPC field name mismatch: `message.text` → `message.message` in ipc-bridge.ts prompt handler
- [x] CSP violation: inline `onclick` handlers in tool-card.js and message-renderer.js → replaced with `addEventListener`
- [x] Thinking block collapse broken: same CSP issue — `renderThinkingBlock` now returns DOM elements with proper event listeners
- [x] `IpcBridge.initialize()` only called in command handler, not on activation → moved to `activate()` with idempotence guard
- [x] OAuth manual code input box lingering after success → cancelled via `CancellationTokenSource`
- [x] Shared provider IDs (e.g. Anthropic) now distinguish stored OAuth vs stored API key so accounts don’t appear in the wrong section
- [x] After auth changes, current model is reconciled to another available provider or cleared so the header can fall back to Login / Setup
- [x] Error-only assistant messages: inline layout with copy button at right (`.assistant-error-row`)
- [x] Error tooltips: CSS `::after` pseudo-element via `data-error` attribute (native `title` unreliable in webviews)
- [x] Copy button on error-only messages: `_setupCopyBtn` falls back to `.assistant-error` when `.message-content` absent
- [x] Paste broken in chat input: added Range API fallback when `document.execCommand('insertText')` fails in VS Code webview
- [x] Image paste: added missing `e.preventDefault()` to prevent double-paste
- [x] Stray `w` character in app.js line 8 caused entire webview JS to fail silently — removed
- [x] Mic/voice button removed — Web Speech API not available in VS Code webviews (Electron limitation)

### Context Ref Display ✅
- [x] File path references in rendered user messages show filename only (not full path)
- [x] `renderInline()` in markdown.js detects backtick-wrapped paths and renders as styled chips with file icon
- [x] Full path preserved in `title` attribute (visible on hover)
- [x] CSS class `.context-ref-inline` styled to match input chips

### Skills Panel & Slash Commands ✅
- [x] Backend IPC for loading skills from `session.resourceLoader.getSkills()`
- [x] Skills UI panel in the extension header
- [x] `/skill:name` autocomplete built cleanly into the chat input
- [x] Arrow navigation and Enter to autocomplete skill names

### UI Polish ✅
- [x] Header buttons: CSS tooltips via `data-tooltip` + `.has-tooltip::after` (native `title` unreliable in webviews)
- [x] Accounts button: person-in-circle SVG icon (replaces key icon)
- [x] Webview asset cache-busting: `?v=${Date.now()}` on script and style URIs in `panel-manager.ts`
- [x] Display auto-incremented version+build number (`v0.1.0+X`) centered and dimmed in the footer

### Conversation Tree ✅
- [x] Tree button (🌿) in header bar between History and Settings
- [x] Tree panel (overlay) showing conversation structure
- [x] Serialized tree data via IPC (`get_tree` → `tree_data`)
- [x] Filter modes: User+Assistant, User only, Labeled only, All entries
- [x] Visual tree with role icons (→ user, ← assistant), compaction/summary markers
- [x] Current leaf highlighted with ● indicator and accent border
- [x] Branch count badges on nodes with multiple children
- [x] Click to navigate: inline options (No summary / With summary / Custom summary)
- [x] Custom summary: inline text input for summarization instructions
- [x] Right-click to set/clear labels on entries
- [x] Branch summarization on navigation via `session.navigateTree()`
- [x] Chat syncs after navigation
- [x] Available in command palette: "Conversation Tree"
- [x] `phi.openTree` VS Code command registered
- [x] Tree CSS using `--vscode-*` variables

### Context Integration (Add to Chat) ✅
- [x] `phi.addSelectionToChat` command — adds selected code as context chip in chat
- [x] `phi.addFileToChat` command — adds file content as context chip in chat (explorer right-click)
- [x] Editor right-click context menu: "Phi: Add to Chat" (when selection exists)
- [x] Explorer right-click context menu: "Phi: Add File to Chat" (files only, not folders)
- [x] `Cmd+Shift+L` when selection exists → adds selection to chat (opens panel if needed)
- [x] `Cmd+Shift+L` when no selection → opens chat panel (existing behavior)
- [x] Context chips rendered above input with file icon, path, line range
- [x] Click chip label → toggle code preview popup
- [x] Remove button (×) on each chip
- [x] Context prepended to prompt on send (formatted as code blocks)
- [x] `buildSelectionContext()` in editor-context.ts (workspace-relative paths)
- [x] `buildFileContext()` in editor-context.ts (reads file, caps at 500 lines)
- [x] CSS for context chips, preview popup
- [x] `add_context` IPC message (Extension Host → Webview)

### Code Quality ✅
- [x] Refactored `public/app.js` from ~1,732 lines to ~430 lines
  - [x] `public/attachment-manager.js` — File attachments: image paste, native file picker, previews
  - [x] `public/model-picker.js` — Model dropdown, search, thinking level
  - [x] `public/cost-monitor.js` — Cost/token display, context visualization
  - [x] `public/command-palette.js` — Command palette overlay
  - [x] `public/tree-panel.js` — Conversation tree panel (navigation, labeling)
  - [x] `public/prompt-autocomplete.js` — Slash-command autocomplete popup
  - [x] `public/panels.js` — Settings, About, Accounts, History, Skills panels
  - [x] Updated `AGENTS.md` file list and architecture diagram
  - [x] Updated `docs/TASKS.md`

### Testing (needs manual verification)
- [ ] Verify tool cards render during live streaming
- [ ] Verify tool cards render in session history restore
- [ ] Verify edit tool shows diff view
- [ ] Verify model switching works via IPC
- [ ] Verify thinking level cycling works via IPC
- [ ] Verify session history panel lists sessions and switching works
- [ ] Verify compaction via command palette works
- [ ] Verify scroll-to-bottom button appears/hides correctly
- [ ] Verify cost and token display updates after each assistant message
- [ ] Verify context visualizer shows correct breakdown
- [ ] Verify unified login flow: `Phi: Login` shows both subscription and API-key/provider setup modes
- [ ] Verify API-key provider discovery includes custom/model-registry providers and excludes OAuth-only providers from the API-key shortcut
- [ ] Verify shared provider IDs (Anthropic) appear in the correct Accounts section depending on stored credential type
- [ ] Verify logout/remove-key from the active model provider automatically switches to another available model, or shows Login in the header when none remain
- [ ] Verify Bedrock shows setup guidance instead of an API-key prompt
- [ ] Verify Cloudflare save flow reminds users about `CLOUDFLARE_ACCOUNT_ID`
- [ ] Verify editor context: select code → "Phi: Ask About Selection" → correct file + lines in prompt
- [ ] Verify image attachment: attach image → send → Pi receives it
- [ ] Verify abort: click abort button → Pi stops streaming
- [ ] Verify experimental task alert sounds: enable toggle → success and failure runs play distinct short alerts
- [ ] Verify session continuity: close and reopen VS Code → session history preserved

### Packaging & Local Install
- [x] Create a 128×128 `assets/phi-icon.png` icon
- [x] Run `pnpm run build` (or `npm run build`) with no errors
- [x] Extension host bundled with esbuild (Pi SDK included, no `node_modules` needed)
- [x] Run `pnpm run package` → produces a valid `.vsix` (1.5 MB, 11 files)
- [x] `CHANGELOG.md` created (required by Open VSX)
- [x] `LICENSE` file (MIT) created
- [x] Publisher set to `gnassro`
- [x] Pi SDK updated to `^0.70.6`
- [x] AgentManager migrated from direct `AgentSession` replacement APIs to `AgentSessionRuntime`
- [ ] Install `.vsix` locally via `code --install-extension phi-agent-0.1.0.vsix`
- [ ] Verify the installed extension works on a clean VS Code window
- [ ] Test on Windows and Linux

### CI/CD — Automated Publishing
- [x] `.github/workflows/publish.yml` — GitHub Actions workflow triggered on `v*` tag push
- [x] Workflow validates tag matches `package.json` version before publishing
- [x] Workflow runs `typecheck` → `package` → `ovsx publish`
- [x] Workflow auto-generates changelog from conventional commits
- [x] Workflow creates GitHub Release with changelog + `.vsix` attached
- [x] `scripts/release.mjs` — one-command release: bump → changelog → commit → tag → push
- [x] `pnpm run release` / `release:status` / `release:publish` npm scripts added
- [ ] Add `OVSX_PAT` secret to GitHub repo settings (manual, one-time)
