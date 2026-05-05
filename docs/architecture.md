# Phi — Architecture Reference

## Overview

Phi is a VS Code extension. It has two runtime environments that are completely isolated from each other and communicate only via message passing.

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS CODE PROCESS                           │
│                                                                   │
│  ┌─────────────────────────────────┐                             │
│  │      EXTENSION HOST (Node.js)   │                             │
│  │                                 │                             │
│  │  extension.ts    (entry point)  │                             │
│  │  agent-manager.ts (Pi SDK)      │                             │
│  │  panel-manager.ts (Webview)     │      VS Code API            │
│  │  ipc-bridge.ts   (routing)      │◄────(vscode.*)─────────────►│
│  │  editor-context.ts (VS Code)    │                             │
│  │  env-manager.ts  (provider env) │                             │
│  │  commands.ts     (commands)     │                             │
│  │  legacy-google/  (providers +   │                             │
│  │                  OAuth resolver) │                             │
│  │                                 │                             │
│  │  @mariozechner/pi-coding-agent      │                         │
│  │  (createAgentSessionRuntime runs here) │                      │
│  └──────────────┬──────────────────┘                             │
│                 │ postMessage / onDidReceiveMessage               │
│                 │ (VS Code IPC — the ONLY channel)                │
│  ┌──────────────▼──────────────────┐                             │
│  │      WEBVIEW (Chromium)         │                             │
│  │                                 │                             │
│  │  (no index.html — generated)    │                             │
│  │  public/app.js    (coordinator) │                             │
│  │  public/vscode-ipc.js           │                             │
│  │  public/chat-input.js           │                             │
│  │  public/message-renderer.js     │                             │
│  │  public/tool-card.js            │                             │
│  │  public/state.js                │                             │
│  │  public/session-sidebar.js      │                             │
│  │  public/markdown.js             │                             │
│  │  public/syntax-highlighter.js   │                             │
│  │  public/themes.js  (no-op)      │                             │
│  │  public/style.css               │                             │
│  │                                 │                             │
│  │  acquireVsCodeApi() → vscode    │                             │
│  │  vscode.postMessage(msg)        │                             │
│  └─────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Responsibilities

### `src/extension.ts`
The entry point. VS Code calls `activate(ctx)` when the extension loads.

Responsibilities:
- Call `EnvManager.initialize(ctx)` before Pi boots so Phi-local provider env vars are visible to the SDK
- Call `AgentManager.initialize(cwd)` to boot the Pi session
- Call `PanelManager.initialize(ctx)` to set up webview factory
- Register all commands via `commands.ts`
- Wire `AgentManager` events → `IpcBridge` → Webview
- Call `deactivate()` on extension unload (dispose Pi session)

```typescript
export async function activate(ctx: vscode.ExtensionContext) {
  const cwd = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? process.cwd();
  await EnvManager.initialize(ctx);
  await AgentManager.initialize(cwd);
  PanelManager.initialize(ctx);
  registerCommands(ctx);
}

export async function deactivate() {
  await AgentManager.dispose();
}
```

### `src/agent-manager.ts`
The Pi SDK wrapper. Owns the `AgentSessionRuntime` lifecycle and binds the current live `runtime.session`.

Responsibilities:
- `initialize(cwd)` — calls `createAgentSessionRuntime()`, sets up runtime + current session
- `prompt(text, images?)` — sends message when idle
- `steer(text)` — interrupts during streaming
- `abort()` — cancels current turn
- `switchSession(path)` — replaces the active session via `runtime.switchSession()` and rebinds listeners
- `newSession()` — replaces the active session via `runtime.newSession()` and rebinds listeners
- `getSessions()` — returns `SessionManager.list(cwd)`
- `getHistoryEntries()` — returns the full current branch from `session.sessionManager.getBranch()` so restored chats can show pre-compaction messages and compaction markers
- `subscribe(listener)` — forward all `AgentSessionEvent` to callers
- `dispose()` — cleans up runtime on extension deactivate

**Key rule:** This is the ONLY file that imports from `@mariozechner/pi-coding-agent`.

### `src/panel-manager.ts`
Manages the VS Code `WebviewPanel`.

Responsibilities:
- `openPanel()` — creates a new panel OR reveals the existing one (only one panel at a time)
- `getPanel()` — returns current panel (may be undefined)
- `send(message)` — sends a message to the webview
- Handles `onDidDispose` to clean up panel reference
- Sets up Content Security Policy in webview HTML
- Loads `public/` assets from `extensionUri`

### `src/ipc-bridge.ts`
Routes messages between the webview and the extension host. This is the nervous system of the extension.

Responsibilities:
- Receives raw `WebviewMessage` from panel
- Dispatches to `AgentManager`, `EditorContext`, etc.
- Receives `AgentSessionEvent` from `AgentManager`
- Formats and sends `ExtensionMessage` back to webview
- Handles `editor_context` push on panel open and on selection change

### `src/editor-context.ts`
Reads VS Code editor state. **Read-only. Never writes.**

Responsibilities:
- `getActiveFileContext()` — returns current file path + full content
- `getSelectionContext()` — returns selected text + file + line range
- `getDiagnosticsContext()` — returns all errors/warnings in workspace
- `watchSelection(callback)` — fires callback when user changes selection
- `watchDiagnostics(callback)` — fires callback when errors change

### `src/legacy-google/`
Contains the Phi-maintained compatibility extension for Google Cloud Code Assist / Gemini CLI and Google Antigravity providers removed from newer Pi SDK versions. `oauth-credentials.ts` resolves Google OAuth credentials from build-time embedded values first, then runtime env/SecretStorage values. No OAuth client ID/secret is committed to source.

### `src/env-manager.ts`
Manages Phi-local provider environment setup.

Responsibilities:
- Store provider-specific env preferences in VS Code global state
- Store Phi-local env values in VS Code `SecretStorage`
- Apply Phi-local env values to `process.env` before the Pi SDK initializes
- Guide provider setup flows for required env vars such as `CLOUDFLARE_ACCOUNT_ID`
- Prompt for Phi-local legacy Google OAuth client credentials when a build does not include embedded Google credentials
- Prefer existing global VS Code process env vars when the user chooses them

### `src/commands.ts`
All `vscode.commands.registerCommand()` calls.

Commands registered:
- `phi.openChat` — open/reveal the Phi panel
- `phi.askAboutSelection` — get selection context → send to Pi
- `phi.newSession` — create a new Pi session
- `phi.abortSession` — abort the current Pi turn
- `phi.login` — unified provider login/setup (auth method picker → provider picker → OAuth browser flow or API-key/setup guidance)
- `phi.logout` — OAuth logout (QuickPick)
- `phi.addApiKey` — direct API-key setup shortcut (provider picker → masked input → `~/.phi/auth.json`)
- `phi.removeApiKey` — remove stored API key (QuickPick → `~/.phi/auth.json`)
- `phi.openTree` — open conversation tree panel (browse/navigate branches)

---

## Webview (public/)

The webview is a full HTML page that runs inside VS Code's sandboxed Chromium. All communication uses VS Code IPC (message passing via `acquireVsCodeApi()`).

### Architecture

```
Webview                         Extension Host
  ↕ acquireVsCodeApi().postMessage
Extension Host IPC
  ↕ Direct function calls
Pi SDK (same Node.js process)
```

### `public/app.js`
Slim orchestrator (~430 lines):
- Uses `VscodeIPC` singleton for all communication
- `VscodeIPC.send(msg)` sends messages to extension host
- `VscodeIPC.on('type', handler)` receives messages from extension host
- On load: sends `request_sync` to get current state
- Handles `pi_event` messages from extension host
- Delegates to extracted modules: `AttachmentManager`, `ModelPicker`, `CostMonitor`, `CommandPalette`, `TreePanel`, `PromptAutocomplete`, `Panels`

### `public/markdown.js`
Renders assistant/user markdown into webview HTML. Fenced code blocks are routed through `syntax-highlighter.js`, then rendered with local copy buttons that use delegated `addEventListener` handlers instead of inline event attributes.

### `public/syntax-highlighter.js`
Wraps the bundled `shiki` full language build. It uses TextMate grammars for broad language coverage, lazily loads explicitly tagged fenced-code languages, converts Shiki's Dark+ token palette to VS Code theme variables, and falls back to escaped plain text if a grammar is unavailable.

### `public/panels.js`
Manages Settings, About, Accounts, History, and Skills panels. The Settings panel includes a Manage Pi Extensions row that opens a dedicated extensions box, requests `get_extensions`, renders enabled/disabled toggles, and sends `toggle_extension` so the extension host can persist the setting and restart the Pi runtime.

### `public/vscode-ipc.js`
Thin wrapper around VS Code's message API:

```javascript
const vscode = acquireVsCodeApi();

export const VscodeIPC = {
  send(message) {
    vscode.postMessage(message);
  },
  on(type, handler) {
    window.addEventListener('message', (event) => {
      if (event.data.type === type) handler(event.data);
    });
  }
};
```

### CSS / Styling
All styles use VS Code's built-in `--vscode-*` CSS variables exclusively. The extension automatically follows the user's VS Code theme (dark, light, high contrast). There is no custom theme system — `themes.js` is a no-op stub.

---

## Data Flow: User Sends a Message

```
1. User types in public/app.js contenteditable input
2. User clicks Send (or presses Enter)
3. app.js calls VscodeIPC.send({ type: 'prompt', text, images })
4. VS Code delivers message to extension host onDidReceiveMessage
5. ipc-bridge.ts receives { type: 'prompt', text, images }
6. ipc-bridge.ts calls AgentManager.prompt(text, images)
7. AgentManager calls session.prompt(text, { images })
8. Pi SDK begins streaming AgentSessionEvents
9. AgentManager.subscribe fires for each event
10. ipc-bridge.ts receives event, calls PanelManager.send({ type: 'pi_event', event })
11. Webview receives message via window.addEventListener('message')
12. app.js handlePiEvent(event) routes to message-renderer.js
13. message-renderer.js updates DOM
```

---

## Data Flow: User Selects Code → Ask Pi

```
1. User selects text in VS Code editor
2. User right-clicks → "Phi: Ask About Selection"
3. commands.ts fires phi.askAboutSelection
4. editor-context.ts.getSelectionContext() called
5. Returns { file, startLine, endLine, text, language }
6. PanelManager.openPanel() (reveals panel)
7. ipc-bridge.ts sends { type: 'editor_context', context } to webview
8. app.js receives context, auto-populates chat input with code chip
9. User adds their question, sends
10. Normal prompt flow (see above)
```

---

## Build System

```bash
# Auto-increment build number (creates src/version.ts and public/version.js)
node scripts/build-num.mjs

# Bundle extension host (src/ + Pi SDK → dist/extension.js)
# Optional PHI_EMBEDDED_GOOGLE_* env vars are injected here for Pi-like Google OAuth defaults.
node scripts/build-ext.mjs

# Bundle webview assets (public/ → dist/public/)
esbuild public/app.js --bundle --outdir=dist/public

# All together (build-num.mjs -> build:ext -> build:web)
pnpm run build            # or: npm run build

# Type check only (no output)
pnpm run typecheck        # or: npx tsc --noEmit

# Watch mode for development
pnpm run watch            # or: npm run watch
```

VS Code launches the extension from `dist/extension.js` (defined in package.json `"main"` field). The Pi SDK and all dependencies are bundled into this single file — no `node_modules` needed at runtime. `scripts/build-ext.mjs` loads local `.env` values before bundling. If the optional `PHI_EMBEDDED_GOOGLE_*` variables are present during `build:ext`, the resulting bundle includes legacy Google OAuth defaults so users get Pi-like Google login behavior; the values must come from CI/local secrets and must never be committed to source. `.env` / `.env.*` are ignored by git and excluded from VSIX packaging.

---

## Security Model

VS Code enforces a Content Security Policy on all webviews. The `panel-manager.ts` must generate a nonce and include it in the CSP header:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           script-src 'nonce-${nonce}';
           style-src ${webview.cspSource} 'unsafe-inline';
           img-src ${webview.cspSource} data:;">
```

All `<script>` tags must carry the same nonce. No inline event handlers. No external URLs.
