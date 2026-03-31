# Phi (φ) — AI Agent Guidelines

## CRITICAL: Documentation Is Your Responsibility

**Before making any change, read this section. Before finishing any task, verify this section.**

As an AI agent working on this project, you have an ACTIVE DUTY to keep all documentation in sync with the codebase. This is not optional.

### When You MUST Update Docs

| Change You Made | Files to Update |
|---|---|
| Added/removed/renamed a source file | `AGENTS.md` (file list), `docs/architecture.md` (file responsibilities), `docs/TASKS.md` |
| Changed the IPC message protocol | `docs/ipc-protocol.md`, `AGENTS.md` (protocol section) |
| Changed how Pi SDK is used | `docs/pi-sdk.md` |
| Added/removed a VS Code command | `AGENTS.md` (commands list), `README.md` (usage table), `package.json` |
| Changed the webview ↔ extension host communication pattern | `docs/ipc-protocol.md`, `docs/architecture.md` |
| Added a new public/ UI file | `AGENTS.md` (file list), `docs/architecture.md`, `docs/TASKS.md` |
| Changed the build system | `AGENTS.md` (build section), `docs/architecture.md` |
| Completed a task | Check it off in `docs/TASKS.md`, update `docs/ROADMAP.md` if a milestone is reached |
| Discovered a rule that prevented a bug | Add it to "Development Rules" in `AGENTS.md` |
| Changed any CSS variable name | `AGENTS.md` (styling rules) |
| Started or completed a milestone | Update `docs/ROADMAP.md` |

### The Update Rule Is Simple

```
You touched it → You document it.
You broke it → You document the fix and why.
You added it → You describe it.
You removed it → You remove its description.
```

Do NOT leave documentation out of sync with the code. Future agents (and humans) depend on these docs being accurate.

---

## What Is Phi?

**Phi** (φ, the golden ratio) is a **VS Code extension** that brings the full power of the **Pi AI coding agent** (`@mariozechner/pi-coding-agent`) natively into VS Code.

- **It is the agent itself**, running inside VS Code's Node.js extension host

The name Phi (φ) is deliberately in the same Greek-letter family as Pi (π), signaling that this is a companion product.

---

## Goal

Get the full Pi agent experience inside VS Code — boots automatically when VS Code opens, chat panel accessible via `Cmd+Shift+L`, deep editor integration (selection, diagnostics, open file), and session continuity across restarts.

```
Users install Phi → Pi SDK boots inside VS Code → full agent, full sessions,
full streaming, deep editor integration (selection, diagnostics, open file)
```

---

## Project Structure

```
phi/
├── src/                          ← Extension Host (TypeScript, Node.js)
│   ├── extension.ts              ← Entry point: activate() / deactivate()
│   ├── agent-manager.ts          ← Pi SDK session lifecycle (ONLY file that imports Pi SDK)
│   ├── panel-manager.ts          ← WebviewPanel creation, lifecycle, asset loading
│   ├── ipc-bridge.ts             ← Routes messages: Webview ↔ Extension Host
│   ├── editor-context.ts         ← Reads VS Code editor state (read-only)
│   ├── commands.ts               ← All vscode.commands.registerCommand() calls
│   └── utils.ts                  ← Shared helpers (getNonce for CSP)
├── public/                       ← Webview UI (Vanilla JS + CSS, no React)
│   ├── app.js                    ← Main UI coordinator (slim orchestrator)
│   ├── vscode-ipc.js             ← VS Code IPC wrapper
│   ├── chat-input.js             ← ContentEditable rich-text input
│   ├── message-renderer.js       ← Renders user/assistant messages
│   ├── tool-card.js              ← Tool execution cards: bash, edit, read, write
│   ├── state.js                  ← StateManager for tool execution tracking
│   ├── session-sidebar.js        ← Session history panel
│   ├── image-manager.js          ← Image paste, drag-drop, file picker, previews
│   ├── model-picker.js           ← Model dropdown, search, thinking level
│   ├── cost-monitor.js           ← Cost/token display, context visualization
│   ├── command-palette.js        ← Command palette overlay
│   ├── tree-panel.js             ← Conversation tree panel (navigation, labeling)
│   ├── prompt-autocomplete.js    ← Slash-command autocomplete popup
│   ├── panels.js                 ← Settings, About, Accounts, History, Skills panels
│   ├── themes.js                 ← No-op stub (VS Code handles theming natively)
│   ├── markdown.js               ← Markdown → HTML renderer
│   └── style.css                 ← All styles using CSS variables
├── docs/
│   ├── architecture.md           ← Full system design and data flows
│   ├── ipc-protocol.md           ← Complete message protocol specification
│   ├── pi-sdk.md                 ← Pi SDK usage patterns for this project
│   ├── TASKS.md                  ← Granular task checklist
│   └── ROADMAP.md                ← Milestone-level project roadmap
├── assets/
│   └── phi-icon.png              ← Extension icon (128x128, dark background)
├── AGENTS.md                     ← THIS FILE — master guide for AI agents
├── README.md                     ← User-facing documentation
├── package.json                  ← Extension manifest + dependencies
├── tsconfig.json                 ← TypeScript compiler config
└── .vscodeignore                 ← Files excluded from extension package
```

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Extension host language | TypeScript | Type-safe VS Code API access |
| Pi agent engine | `@mariozechner/pi-coding-agent` | The Pi SDK — runs in extension host only |
| UI framework | Vanilla JS + CSS | No build complexity for webview |
| Webview bundler | `esbuild` | Fast, zero-config, single-file output |
| TypeScript compiler | `tsc` | Type checking (`pnpm run typecheck`) |
| VS Code types | `@types/vscode` | Full type coverage for VS Code API |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS CODE PROCESS                           │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              EXTENSION HOST  (Node.js)                    │   │
│  │                                                           │   │
│  │  extension.ts      ← activate() / deactivate()           │   │
│  │  agent-manager.ts  ← createAgentSession(), Pi events     │   │
│  │  panel-manager.ts  ← WebviewPanel lifecycle               │   │
│  │  ipc-bridge.ts     ← message routing                     │   │
│  │  editor-context.ts ← vscode.window, workspace, git       │   │
│  │  commands.ts       ← vscode.commands                     │   │
│  │                                                           │   │
│  └───────────────┬───────────────────────────────────────────┘   │
│                  │  panel.webview.postMessage()                   │
│                  │  panel.webview.onDidReceiveMessage()           │
│                  │  (VS Code IPC — THE ONLY CHANNEL)             │
│  ┌───────────────▼───────────────────────────────────────────┐   │
│  │              WEBVIEW  (Chromium sandbox)                  │   │
│  │                                                           │   │
│  │  index.html           ← HTML shell with CSP nonce        │   │
│  │  app.js               ← UI coordinator (slim)            │   │
│  │  vscode-ipc.js        ← acquireVsCodeApi() wrapper       │   │
│  │  chat-input.js        ← ContentEditable input            │   │
│  │  message-renderer.js  ← Chat message DOM rendering       │   │
│  │  tool-card.js         ← Tool execution cards             │   │
│  │  state.js             ← Tool execution state tracking    │   │
│  │  session-sidebar.js   ← Session history panel            │   │
│  │  image-manager.js     ← Image attachments                │   │
│  │  model-picker.js      ← Model dropdown + thinking        │   │
│  │  cost-monitor.js      ← Cost/token/context viz           │   │
│  │  command-palette.js   ← Command palette                  │   │
│  │  tree-panel.js        ← Conversation tree                │   │
│  │  prompt-autocomplete.js ← Slash autocomplete             │   │
│  │  panels.js            ← Side panels (settings, etc.)     │   │
│  │  themes.js            ← No-op (VS Code theming)          │   │
│  │  markdown.js          ← Markdown → HTML                  │   │
│  │  style.css            ← All visual styles                │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**The two environments cannot share memory or modules.** Communication is message-only.

---

## IPC Message Protocol (Summary)

Full specification: `docs/ipc-protocol.md`

### Webview → Extension Host

| Message type | Purpose |
|---|---|
| `prompt` | Send user message (text + optional images) to Pi |
| `abort` | Cancel the current Pi turn |
| `request_sync` | Request full state snapshot on webview load |
| `get_sessions` | Fetch session list for current project |
| `switch_session` | Switch to a different session file |
| `new_session` | Create a new Pi session |
| `get_state` | Request model, thinking level, auto-compaction state |
| `get_available_models` | Fetch list of all available models |
| `set_model` | Switch to a different model (provider + modelId) |
| `cycle_thinking_level` | Cycle thinking level, returns new level |
| `compact` | Trigger context compaction |
| `set_auto_compaction` | Enable/disable auto-compaction |
| `get_session_stats` | Fetch session statistics (messages, tokens, cost) |
| `login` | Trigger OAuth login (opens VS Code QuickPick) |
| `logout` | Trigger OAuth logout (opens VS Code QuickPick) |
| `get_accounts` | Fetch OAuth + API key provider status |
| `add_api_key` | Add API key (opens VS Code QuickPick + masked input) |
| `remove_api_key` | Remove API key (opens VS Code QuickPick) |
| `get_tree` | Fetch conversation tree structure |
| `navigate_tree` | Navigate to a tree node (with optional branch summary) |
| `set_label` | Set or clear a label on a tree entry |

### Extension Host → Webview

| Message type | Purpose |
|---|---|
| `pi_event` | Raw Pi SDK `AgentSessionEvent` forwarded to webview |
| `sync` | Full state snapshot (history, isStreaming, model, cwd) |
| `sessions_list` | Array of `SessionInfo` for the current project |
| `editor_context` | Active file, selection, language, diagnostics from VS Code |
| `add_context` | Context block from editor selection or file (right-click / Cmd+Shift+L) |
| `prefill_input` | Prefill the chat input with text (Ask About Selection) |
| `rpc_response` | Response to RPC commands (get_state, set_model, etc.) |
| `accounts_list` | OAuth providers + API key providers with active status |
| `tree_data` | Serialized session tree + current leaf ID |
| `navigate_result` | Result of tree navigation (success/cancelled) |
| `open_tree` | Signal webview to open the tree panel |

---

## VS Code Commands

| Command ID | Title | Keybinding | When |
|---|---|---|---|
| `phi.openChat` | Phi: Open Chat | `Cmd+Shift+L` / `Ctrl+Shift+L` | Always |
| `phi.addSelectionToChat` | Phi: Add to Chat | `Cmd+Shift+=` / `Ctrl+Shift+=` | `editorHasSelection` |
| `phi.addFileToChat` | Phi: Add File to Chat | — | Explorer right-click (files only) |
| `phi.askAboutSelection` | Phi: Ask About Selection | — | `editorHasSelection` |
| `phi.newSession` | Phi: New Session | — | Always |
| `phi.abortSession` | Phi: Abort Current Turn | `Escape` | Panel focused |
| `phi.login` | Phi: Login | — | Always |
| `phi.logout` | Phi: Logout | — | Always |
| `phi.addApiKey` | Phi: Add API Key | — | Always |
| `phi.removeApiKey` | Phi: Remove API Key | — | Always |
| `phi.openTree` | Phi: Open Conversation Tree | — | Always |
| `phi.login` | Phi: Login | — | Always |
| `phi.logout` | Phi: Logout | — | Always |

---

## Pi SDK Integration Rules

Full reference: `docs/pi-sdk.md`

1. **Only `src/agent-manager.ts` imports from `@mariozechner/pi-coding-agent`.** No other file may import the Pi SDK directly.

2. **`session.prompt()` throws if called during streaming** without a `streamingBehavior` option. Always check `session.isStreaming` first, or use `steer()` / `followUp()`.

3. **Sessions persist automatically** to `~/.pi/agent/sessions/`. No manual save needed.

4. **`SessionManager.list(cwd)` returns only sessions for the current project.** Do not filter client-side.

5. **Image data must have the `data:` prefix stripped** before passing to the SDK. The SDK expects raw base64, not data URIs.

6. **Call `session.dispose()` in `deactivate()`.** Failing to do so leaks the agent process.

---

## Development Rules

1. **No WebSocket.** IPC is the only communication channel. `public/vscode-ipc.js` wraps `acquireVsCodeApi()`.

2. **No React, no Vue, no framework.** The webview uses vanilla JS. This avoids a build pipeline for the frontend and keeps things simple. If a component pattern is needed, use plain ES6 classes.

3. **Pi SDK stays in the extension host.** Never import `@mariozechner/pi-coding-agent` in any `public/` file. It is a Node.js library and will fail in Chromium.

4. **Use `--vscode-*` CSS variables for everything.** Every color, border, and shadow must use VS Code's built-in CSS variables (e.g. `var(--vscode-editor-background)`, `var(--vscode-foreground)`). No hardcoded `#hex` or `rgb()` in component styles. No custom theme definitions — the extension follows the user's VS Code theme automatically.

5. **One panel at a time.** `panel-manager.ts` enforces that only one Phi WebviewPanel exists. If `phi.openChat` is called while a panel already exists, reveal the existing one — never create a second.

6. **Content Security Policy is mandatory.** The webview HTML must include a strict CSP with a nonce. All `<script>` tags must use the same nonce. No inline event handlers (`onclick=`, `onerror=`, etc.). VS Code enforces this.

7. **All assets load from `extensionUri`.** No CDN imports. No external URLs. VS Code's CSP and offline requirements both demand this. Use `webview.asWebviewUri()` to convert file paths to webview-safe URIs.

8. **`editor-context.ts` is read-only.** It reads VS Code state but never modifies the editor, never calls `vscode.workspace.applyEdit()`, never writes files. All file modifications go through Pi's built-in tools (`bash`, `edit`, `write`).

9. **`sendMessage(text)` must always receive a string.** Guard against Event objects being passed accidentally — use `typeof text === 'string' ? text : chatInput.getText()`.

10. **Update docs when you change things.** See the "Documentation Is Your Responsibility" section at the top.

11. **No inline event handlers — ever.** VS Code's CSP blocks `onclick="..."`, `onerror="..."`, etc. in webview HTML. Always use `element.addEventListener('click', ...)`. This applies to both generated HTML strings and DOM element creation. If you use `innerHTML`, the content must not contain event handler attributes.

12. **Use CSS tooltips, not `title` attributes.** Native `title` tooltips are unreliable in VS Code webviews (inconsistent timing, sometimes don't show). Use `data-tooltip` or `data-error` attributes with CSS `::after` pseudo-elements instead.

13. **Use `data-*` attributes for DOM-stored metadata.** Don't rely on `title` or other standard attributes for storing data the JS needs to read back (e.g. error messages for copy). Use `dataset.*` properties.

14. **Cache-bust webview assets.** Webview JS/CSS can be cached aggressively by VS Code. `panel-manager.ts` appends `?v=${Date.now()}` to script and style URIs to force fresh loads after rebuilds.

---

## Styling Rules

- All styles live in `public/style.css`
- **All CSS uses VS Code's built-in `--vscode-*` CSS variables** — no custom theme definitions
- The extension automatically follows the user's VS Code theme (dark, light, high contrast)
- There is no theme picker — theming is handled entirely by VS Code
- `themes.js` exists as a no-op stub (exports empty functions to avoid breaking imports)
- Scrollbars: use `::-webkit-scrollbar` with `width: 6px`, `var(--vscode-scrollbarSlider-background)` thumb

---

## Build System

```bash
# Install dependencies (pnpm preferred — uses hard-linked global store, saves disk & time)
pnpm install              # or: npm install

# Build everything (extension host + webview)
pnpm run build            # or: npm run build

# Type check only (no output)
pnpm run typecheck        # or: npx tsc --noEmit

# Watch mode during development
pnpm run watch            # or: npm run watch

# Package into a .vsix for local install or publishing (automatically runs build)
pnpm run package          # or: npm run package

# Install locally (no marketplace needed)
code --install-extension phi-agent-0.1.0.vsix

# Launch Extension Development Host (press F5 in VS Code)
# Configured in .vscode/launch.json
```

**Build details:**
- `build` — first runs `scripts/build-num.mjs` to auto-increment `.build-number` and generate `src/version.ts` / `public/version.js`, then runs `build:ext` and `build:web`
- `build:ext` — bundles `src/extension.ts` + all dependencies (including Pi SDK) into a single `dist/extension.js` via esbuild (ESM, Node.js, minified)
- `build:web` — bundles `public/app.js` into `dist/public/app.js` via esbuild (ESM) + copies `style.css`
- `vscode` is marked as external (provided by VS Code at runtime)

**Output structure after build:**
```
dist/
├── extension.js       ← bundled extension host (includes Pi SDK)
└── public/
    ├── app.js         ← bundled webview JS
    └── style.css      ← (copied, not bundled)
```

---

## Reference

| Resource | Path | What It Provides |
|---|---|---|
| **Pi SDK docs** | `/Users/macbook/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md` | All Pi SDK patterns and event types |
| **Pi extension API** | `/Users/macbook/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md` | AgentSessionEvent shapes |

---

## Task & Roadmap Tracking

Tasks and roadmap are tracked in dedicated files. **Always update them when you complete work or identify new tasks.**

- **`docs/TASKS.md`** — granular checklist of everything done and everything pending
- **`docs/ROADMAP.md`** — milestone-level view of where the project is heading

When you finish a task: check it off in `docs/TASKS.md` and update the "Current Status" line in `docs/ROADMAP.md` if a milestone has been reached.

