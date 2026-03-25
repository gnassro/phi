# Phi — IPC Protocol Reference

All communication between the Webview (public/) and the Extension Host (src/) uses VS Code's built-in message passing. There is no WebSocket, no HTTP, no external server.

---

## Sending: Webview → Extension Host

The webview uses `acquireVsCodeApi().postMessage(message)`.

```typescript
// All possible messages the webview can send:

type WebviewMessage =
  | { type: "prompt"; text: string; images?: ImagePayload[] }
  | { type: "abort" }
  | { type: "request_sync" }
  | { type: "get_sessions" }
  | { type: "switch_session"; sessionPath: string }
  | { type: "new_session" };

interface ImagePayload {
  type: "image";
  data: string;       // base64 encoded
  mimeType: string;   // "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}
```

### `prompt`
Send a user message to Pi. Sent when the user clicks Send or presses Enter.
```javascript
VscodeIPC.send({ type: "prompt", text: "Fix this bug", images: [...] });
```

### `abort`
Cancel the current Pi turn.
```javascript
VscodeIPC.send({ type: "abort" });
```

### `request_sync`
Request a full state snapshot. Sent on webview load/reload.
```javascript
VscodeIPC.send({ type: "request_sync" });
```

### `get_sessions`
Request the list of sessions for the current project.
```javascript
VscodeIPC.send({ type: "get_sessions" });
```

### `switch_session`
Switch to a different session file.
```javascript
VscodeIPC.send({ type: "switch_session", sessionPath: "/path/to/session.jsonl" });
```

### `new_session`
Create a new Pi session.
```javascript
VscodeIPC.send({ type: "new_session" });
```

---

## Sending: Extension Host → Webview

The extension host uses `panel.webview.postMessage(message)`.

```typescript
// All possible messages the extension host can send:

type ExtensionMessage =
  | { type: "pi_event"; event: AgentSessionEvent }
  | { type: "sync"; state: SyncState }
  | { type: "sessions_list"; sessions: SessionInfo[] }
  | { type: "editor_context"; context: EditorContext };
```

### `pi_event`
A raw Pi SDK event forwarded directly to the webview. The webview handles all event types identically to how Tau handles WebSocket events.

```typescript
// AgentSessionEvent types the webview must handle:
// (same as Tau's handleRPCEvent)

{ type: "agent_start" }
{ type: "agent_end"; messages: AgentMessage[] }
{ type: "message_start"; message: AgentMessage }
{ type: "message_update"; assistantMessageEvent: AssistantMessageEvent }
{ type: "message_end"; message: AgentMessage }
{ type: "turn_start" }
{ type: "turn_end"; message: AgentMessage; toolResults: ToolResult[] }
{ type: "tool_execution_start"; toolName: string; toolCallId: string }
{ type: "tool_execution_update"; toolCallId: string; output: string }
{ type: "tool_execution_end"; toolCallId: string; isError: boolean }
{ type: "auto_compaction_start" }
{ type: "auto_compaction_end"; summary?: string }
```

The webview's `handlePiEvent(event)` function routes these identically to Tau's `handleRPCEvent()`.

### `sync`
Full state snapshot. Sent in response to `request_sync` and after session switches.

```typescript
interface SyncState {
  entries: SessionEntry[];    // full message history
  isStreaming: boolean;
  cwd: string;
  sessionFile: string;
  model: string;
}
```

### `sessions_list`
List of sessions for the current project.

```typescript
// SessionInfo from Pi SDK SessionManager.list()
interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}
```

### `editor_context`
Current VS Code editor state. Pushed to webview when:
- Phi panel first opens
- User changes their selection (debounced 300ms)
- Active file changes

```typescript
interface EditorContext {
  file: string | null;           // absolute path of active file
  language: string | null;       // "typescript", "python", etc.
  selection: {
    text: string;
    startLine: number;
    endLine: number;
  } | null;                      // null if no selection
  diagnostics: Array<{
    file: string;
    line: number;
    message: string;
    severity: "error" | "warning";
  }>;
}
```

---

## Receiving in the Webview

```javascript
// public/vscode-ipc.js
const vscode = acquireVsCodeApi();

window.addEventListener('message', (event) => {
  const message = event.data; // ExtensionMessage
  switch (message.type) {
    case 'pi_event':
      handlePiEvent(message.event);
      break;
    case 'sync':
      handleSync(message.state);
      break;
    case 'sessions_list':
      handleSessionsList(message.sessions);
      break;
    case 'editor_context':
      handleEditorContext(message.context);
      break;
  }
});
```

---

## Receiving in the Extension Host

```typescript
// src/ipc-bridge.ts
panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
  switch (message.type) {
    case "prompt":
      AgentManager.prompt(message.text, message.images);
      break;
    case "abort":
      AgentManager.abort();
      break;
    case "request_sync":
      IpcBridge.sendSync();
      break;
    case "get_sessions":
      AgentManager.getSessions().then(sessions =>
        PanelManager.send({ type: "sessions_list", sessions })
      );
      break;
    case "switch_session":
      AgentManager.switchSession(message.sessionPath);
      break;
    case "new_session":
      AgentManager.newSession();
      break;
  }
});
```
