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
│  │  commands.ts     (commands)     │                             │
│  │                                 │                             │
│  │  @mariozechner/pi-coding-agent  │                             │
│  │  (createAgentSession runs here) │                             │
│  └──────────────┬──────────────────┘                             │
│                 │ postMessage / onDidReceiveMessage               │
│                 │ (VS Code IPC — the ONLY channel)                │
│  ┌──────────────▼──────────────────┐                             │
│  │      WEBVIEW (Chromium)         │                             │
│  │                                 │                             │
│  │  public/index.html              │                             │
│  │  public/app.js    (coordinator) │                             │
│  │  public/chat-input.js           │                             │
│  │  public/message-renderer.js     │                             │
│  │  public/markdown.js             │                             │
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
- Call `AgentManager.initialize(cwd)` to boot the Pi session
- Call `PanelManager.initialize(ctx)` to set up webview factory
- Register all commands via `commands.ts`
- Wire `AgentManager` events → `IpcBridge` → Webview
- Call `deactivate()` on extension unload (dispose Pi session)

```typescript
export async function activate(ctx: vscode.ExtensionContext) {
  const cwd = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? process.cwd();
  await AgentManager.initialize(cwd);
  PanelManager.initialize(ctx);
  registerCommands(ctx);
}

export function deactivate() {
  AgentManager.dispose();
}
```

### `src/agent-manager.ts`
The Pi SDK wrapper. Owns the `AgentSession` lifecycle.

Responsibilities:
- `initialize(cwd)` — calls `createAgentSession()`, sets up session
- `prompt(text, images?)` — sends message when idle
- `steer(text)` — interrupts during streaming
- `abort()` — cancels current turn
- `switchSession(path)` — switches to a different session file
- `getSessions()` — returns `SessionManager.list(cwd)`
- `subscribe(listener)` — forward all `AgentSessionEvent` to callers
- `dispose()` — cleans up session on extension deactivate

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

### `src/commands.ts`
All `vscode.commands.registerCommand()` calls.

Commands registered:
- `phi.openChat` — open/reveal the Phi panel
- `phi.askAboutSelection` — get selection context → send to Pi
- `phi.newSession` — create a new Pi session
- `phi.switchSession` — triggered from webview session list

---

## Webview (public/)

The webview is a full HTML page that runs inside VS Code's sandboxed Chromium. It is adapted from Tau's frontend with WebSocket replaced by VS Code IPC.

### Key Difference from Tau

```
Tau:                            Phi:
Browser                         Webview
  ↕ WebSocket                     ↕ acquireVsCodeApi().postMessage
HTTP/WS Server                  Extension Host IPC
  ↕ Pi Extension API               ↕ Direct function calls
Pi (separate process)           Pi SDK (same Node.js process)
```

### `public/app.js`
Main coordinator. Differences from Tau's app.js:
- No `WebSocketClient` — replaced by `VscodeIPC` singleton
- `VscodeIPC.send(msg)` replaces `wsClient.send(msg)`
- `VscodeIPC.on('message', handler)` replaces WebSocket event listeners
- On load: sends `request_sync` to get current state
- Handles `pi_event` messages from extension host

### `public/vscode-ipc.js` (NEW — does not exist in Tau)
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
Identical approach to Tau. All colors use CSS variables. Theme switching works by changing `data-theme` attribute on `:root`.

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
13. message-renderer.js updates DOM (same as Tau)
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
# Compile TypeScript (src/ → dist/)
tsc --outDir dist

# Bundle webview assets (public/ → dist/public/)
esbuild public/app.js --bundle --outdir=dist/public

# Both together
pnpm run build            # or: npm run build

# Watch mode for development
pnpm run watch            # or: npm run watch
```

VS Code launches the extension from `dist/extension.js` (defined in package.json `"main"` field).

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
