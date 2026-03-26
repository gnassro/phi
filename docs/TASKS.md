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
- [x] `public/chat-input.js` — ContentEditable rich-text input (from Tau)
- [x] `public/message-renderer.js` — message DOM rendering (from Tau)
- [x] `public/markdown.js` — Markdown → HTML renderer (from Tau)
- [x] `public/style.css` — basic styles

### Build & Launch
- [x] `pnpm install` succeeds
- [x] `pnpm run build` compiles with no TypeScript errors
- [x] F5 launches Extension Development Host
- [x] Webview panel opens via `Cmd+Shift+L`
- [x] Basic prompt → Pi response round-trip works

---

## 🔲 Pending

### Feature Parity with Tau (adapted for VS Code extension)

> **Principle:** Tau is a web mirror of a running Pi CLI (requires `pi` running first).
> Phi is a standalone VS Code extension — Pi SDK runs directly in the extension host.
> All Tau features that use `fetch('/api/...')` or WebSocket must be adapted to use
> VS Code IPC (`VscodeIPC.send()` → `ipc-bridge.ts` → `agent-manager.ts` → Pi SDK).
>
> **Excluded from Tau:** File browser (VS Code has Explorer), code editor pane (VS Code IS the editor),
> launcher/project picker (VS Code workspaces), PWA/service worker/manifest, mobile splash,
> Tailscale, auth toggle, mirror mode, swipe gestures, tab title notifications,
> **custom theme picker** (VS Code handles theming natively).

#### Tool Cards — `public/tool-card.js`, `public/state.js` ✅
- [x] Create `public/state.js` — StateManager for tracking tool execution state (from Tau)
- [x] Create `public/tool-card.js` — ToolCardRenderer (from Tau)
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
- [x] Create `public/session-sidebar.js` — adapted from Tau
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
- [x] ~~Theme grid~~ — REMOVED: VS Code handles theming natively via `--vscode-*` variables
- [x] Accounts section moved to separate Accounts panel

#### Accounts Panel ✅
- [x] Separate panel with 🔑 key icon button in header (next to ⚙️ settings)
- [x] OAuth Login button (triggers VS Code QuickPick → browser auth)
- [x] API Keys Add/Remove buttons (VS Code QuickPick + masked input)
- [x] 17 predefined providers + custom provider option
- [x] Shows only active accounts (logged-in OAuth + set API keys)
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
- [x] `getOAuthProviders()` — returns OAuth provider list with login status
- [x] `login(providerId, callbacks)` — OAuth login via AuthStorage
- [x] `logout(providerId)` — OAuth logout via AuthStorage
- [x] `getApiKeyProviders()` — returns predefined API key providers with status
- [x] `setApiKey(providerId, key)` — saves API key to `~/.phi/auth.json`
- [x] `removeApiKey(providerId)` — removes API key from `~/.phi/auth.json`

### Bug Fixes Applied
- [x] IPC field name mismatch: `message.text` → `message.message` in ipc-bridge.ts prompt handler
- [x] CSP violation: inline `onclick` handlers in tool-card.js and message-renderer.js → replaced with `addEventListener`
- [x] Thinking block collapse broken: same CSP issue — `renderThinkingBlock` now returns DOM elements with proper event listeners
- [x] `IpcBridge.initialize()` only called in command handler, not on activation → moved to `activate()` with idempotence guard
- [x] OAuth manual code input box lingering after success → cancelled via `CancellationTokenSource`

### Context Ref Display ✅
- [x] File path references in rendered user messages show filename only (not full path)
- [x] `renderInline()` in markdown.js detects backtick-wrapped paths and renders as styled chips with file icon
- [x] Full path preserved in `title` attribute (visible on hover)
- [x] CSS class `.context-ref-inline` styled to match input chips

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
- [ ] Verify editor context: select code → "Phi: Ask About Selection" → correct file + lines in prompt
- [ ] Verify image attachment: attach image → send → Pi receives it
- [ ] Verify abort: click abort button → Pi stops streaming
- [ ] Verify session continuity: close and reopen VS Code → session history preserved

### Packaging & Local Install
- [ ] Create a 128×128 `assets/phi-icon.png` icon
- [ ] Run `pnpm run build` (or `npm run build`) with no errors
- [ ] Run `pnpm exec vsce package` (or `npx vsce package`) → produces a valid `.vsix`
- [ ] Install `.vsix` locally via `code --install-extension phi-agent-0.1.0.vsix`
- [ ] Verify the installed extension works on a clean VS Code window
