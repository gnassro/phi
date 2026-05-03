# Phi — IPC Protocol Reference

All communication between the Webview (public/) and the Extension Host (src/) uses VS Code's built-in message passing. There is no WebSocket, no HTTP, no external server.

> All messages are routed through `VscodeIPC.send()` → `panel.webview.onDidReceiveMessage()`
> → `ipc-bridge.ts` → `agent-manager.ts` → Pi SDK.

---

## Sending: Webview → Extension Host

The webview uses `acquireVsCodeApi().postMessage(message)`.

```typescript
// All possible messages the webview can send:

type WebviewMessage =
  // Chat
  | { type: "prompt"; message: string; images?: ImagePayload[] }
  | { type: "abort" }
  | { type: "request_sync" }

  // Sessions
  | { type: "get_sessions" }
  | { type: "switch_session"; sessionPath: string }
  | { type: "new_session" }

  // Model & Thinking
  | { type: "get_state" }
  | { type: "get_available_models" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "cycle_thinking_level" }

  // Agent controls
  | { type: "compact" }
  | { type: "set_auto_compaction"; enabled: boolean }
  | { type: "get_session_stats" }

  // Auth & API keys
  | { type: "login" }
  | { type: "logout"; providerId?: string; providerName?: string }
  | { type: "get_accounts" }
  | { type: "add_api_key" }
  | { type: "remove_api_key"; providerId?: string; providerName?: string }

  // Tree navigation
  | { type: "get_tree" }
  | { type: "navigate_tree"; targetId: string; summarize: boolean; customInstructions?: string }
  | { type: "set_label"; entryId: string; label: string }
  // Skills
  | { type: "get_skills" }
  // Misc
  | { type: "open_url"; url: string }
  | { type: "open_file_picker" };

interface ImagePayload {
  type: "image";
  data: string;       // base64 encoded (no data: prefix)
  mimeType: string;   // "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}
```

### Chat Messages

#### `prompt`
Send a user message to Pi. Sent when the user clicks Send or presses Enter.
```javascript
VscodeIPC.send({ type: "prompt", message: "Fix this bug", images: [...] });
```

#### `abort`
Cancel the current Pi turn.
```javascript
VscodeIPC.send({ type: "abort" });
```

#### `request_sync`
Request a full state snapshot. Sent on webview load/reload.
```javascript
VscodeIPC.send({ type: "request_sync" });
```

### Session Messages

#### `get_sessions`
Request the list of sessions for the current project.
```javascript
VscodeIPC.send({ type: "get_sessions" });
```

#### `switch_session`
Switch to a different session file.
```javascript
VscodeIPC.send({ type: "switch_session", sessionPath: "/path/to/session.jsonl" });
```

#### `new_session`
Create a new Pi session.
```javascript
VscodeIPC.send({ type: "new_session" });
```

### Model & Thinking Messages

#### `get_state`
Request current agent state (model, thinking level, auto-compaction, session name).
The extension host responds with an `rpc_response` message.
```javascript
VscodeIPC.send({ type: "get_state" });
// Response: { type: "rpc_response", command: "get_state", success: true, data: {
//   model: { id: "claude-sonnet-4-20250514", provider: "anthropic", contextWindow: 200000 },
//   thinkingLevel: "off",
//   autoCompactionEnabled: true,
//   sessionName: "Fix auth bug"
// }}
```

#### `get_available_models`
Request list of all available models.
```javascript
VscodeIPC.send({ type: "get_available_models" });
// Response: { type: "rpc_response", command: "get_available_models", success: true, data: {
//   models: [{ id: "...", provider: "...", contextWindow: 200000 }, ...]
// }}
```

#### `set_model`
Switch to a different model.
```javascript
VscodeIPC.send({ type: "set_model", provider: "anthropic", modelId: "claude-sonnet-4-20250514" });
```

#### `cycle_thinking_level`
Cycle to the next thinking level. Returns the new level.
```javascript
VscodeIPC.send({ type: "cycle_thinking_level" });
// Response: { type: "rpc_response", command: "cycle_thinking_level", success: true, data: {
//   level: "medium"
// }}
```

### Agent Control Messages

#### `compact`
Trigger context compaction manually.
```javascript
VscodeIPC.send({ type: "compact" });
```

#### `set_auto_compaction`
Enable or disable auto-compaction.
```javascript
VscodeIPC.send({ type: "set_auto_compaction", enabled: true });
```

#### `get_session_stats`
Request session statistics.
```javascript
VscodeIPC.send({ type: "get_session_stats" });
// Response: { type: "rpc_response", command: "get_session_stats", success: true, data: {
//   totalMessages: 42, userMessages: 15, assistantMessages: 15, toolCalls: 12,
//   tokens: { input: 50000, output: 12000, cacheRead: 30000, cacheWrite: 5000, total: 97000 },
//   cost: 0.0234
// }}
```

### Auth & API Key Messages

#### `login`
Opens VS Code QuickPick for unified provider login/setup. Users first choose subscription vs API key/setup, then select a provider. OAuth providers open a browser flow; non-OAuth providers prompt for an API key or show setup guidance.
```javascript
VscodeIPC.send({ type: "login" });
```

#### `logout`
Without a provider ID, opens VS Code QuickPick to select a stored OAuth provider. With `providerId`, asks for confirmation and logs out that specific provider directly.
```javascript
VscodeIPC.send({ type: "logout" });
VscodeIPC.send({ type: "logout", providerId: "anthropic", providerName: "Anthropic" });
```

#### `get_accounts`
Request OAuth providers and dynamically discovered API-key providers with their status.
```javascript
VscodeIPC.send({ type: "get_accounts" });
// Response: { type: "accounts_list", providers: [...], apiKeyProviders: [...] }
```

#### `add_api_key`
Opens the direct API-key setup shortcut: provider picker (from Pi's discovered non-OAuth providers, excluding setup-only entries like Bedrock) followed by masked input. Saved to `~/.phi/auth.json`.
```javascript
VscodeIPC.send({ type: "add_api_key" });
```

#### `remove_api_key`
Without a provider ID, opens VS Code QuickPick showing providers with stored API keys. With `providerId`, asks for confirmation and removes that specific key from `~/.phi/auth.json` directly.
```javascript
VscodeIPC.send({ type: "remove_api_key" });
VscodeIPC.send({ type: "remove_api_key", providerId: "openai", providerName: "OpenAI" });
```

---

The extension host uses `panel.webview.postMessage(message)`.

```typescript
// All possible messages the extension host can send:

type ExtensionMessage =
  | { type: "pi_event"; event: AgentSessionEvent }
  | { type: "sync"; state: SyncState }
  | { type: "sessions_list"; sessions: SessionInfo[] }
  | { type: "editor_context"; context: EditorContext }
  | { type: "add_context"; context: ContextBlock }
  | { type: "prefill_input"; text: string }
  | { type: "rpc_response"; command: string; success: boolean; data?: unknown; error?: string }
  | { type: "accounts_list"; providers: OAuthProviderStatus[]; apiKeyProviders: ApiKeyProviderStatus[] }
  | { type: "tree_data"; nodes: SerializedTreeNode[]; leafId: string | null; error?: string }
  | { type: "navigate_result"; success: boolean; cancelled?: boolean; error?: string }
  | { type: "open_tree" }
  | { type: "skills_data"; skills: Skill[] }
  | { type: "add_image_attachment"; data: string; mimeType: string };
```

### `pi_event`
A raw Pi SDK event forwarded directly to the webview. The webview handles all event types.

```typescript
// AgentSessionEvent types the webview must handle:

{ type: "agent_start" }
{ type: "agent_end"; messages: AgentMessage[] }
{ type: "message_start"; message: AgentMessage }
{ type: "message_update"; assistantMessageEvent: AssistantMessageEvent }
{ type: "message_end"; message: AgentMessage }
{ type: "turn_start" }
{ type: "turn_end"; message: AgentMessage; toolResults: ToolResult[] }
{ type: "tool_execution_start"; toolName: string; toolCallId: string; args: Record<string, unknown> }
{ type: "tool_execution_update"; toolCallId: string; partialResult: unknown }
{ type: "tool_execution_end"; toolCallId: string; result: unknown; isError: boolean }
{ type: "auto_compaction_start" }
{ type: "auto_compaction_end"; result?: CompactionResult; aborted: boolean }
{ type: "session_name"; name: string }
{ type: "extension_ui_request"; method: string; ... }
{ type: "extension_error"; error: string }
```

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
Current VS Code editor state. Pushed when panel opens, selection changes, or active file changes.

```typescript
interface EditorContext {
  file: string | null;           // absolute path of active file
  language: string | null;       // "typescript", "python", etc.
  selection: {
    text: string;
    startLine: number;
    endLine: number;
  } | null;
  diagnostics: Array<{
    file: string;
    line: number;
    message: string;
    severity: "error" | "warning";
  }>;
}
```

### `add_context`
Adds a context block (code selection or file) to the chat input area. Sent when user right-clicks "Add to Chat" or uses `Cmd+Shift+L` with a selection.

```typescript
// Selection context:
{
  type: "add_context",
  context: {
    type: "selection",
    filePath: "src/app.ts",         // workspace-relative path
    language: "typescript",
    startLine: 42,
    endLine: 58,
    content: "function foo() { ... }"
  }
}

// File context:
{
  type: "add_context",
  context: {
    type: "file",
    filePath: "src/utils.ts",
    language: "typescript",
    content: "// full file content...",
    truncated: false                // true if > 500 lines
  }
}
```

The webview renders context blocks as removable chips above the input. When the user sends a message, context blocks are prepended to the prompt as formatted code blocks and then cleared.

### `prefill_input`
Prefills the chat input with text. Used by "Phi: Ask About Selection".

```typescript
{ type: "prefill_input", text: "In `src/app.ts` lines 42-58:\n```\ncode...\n```" }
```

### `rpc_response`
Generic response to RPC-style commands (`get_state`, `get_available_models`, `cycle_thinking_level`, `get_session_stats`).

```typescript
interface RpcResponse {
  type: "rpc_response";
  command: string;        // matches the original request type
  success: boolean;
  data?: unknown;         // command-specific response data
  error?: string;         // error message if success is false
}
```

### `open_file_picker`
Webview requests the extension host to open VS Code's native file picker. Supports multi-select.
Images are returned as `add_image_attachment` messages, non-image files as `add_context` messages.

```typescript
// Webview → Extension Host
{ type: "open_file_picker" }

// Extension Host → Webview (for each image picked)
{ type: "add_image_attachment", data: "base64...", mimeType: "image/png" }

// Extension Host → Webview (for each non-image file picked)
{ type: "add_context", context: { type: "file", filePath: "src/app.ts" } }
```

### `add_image_attachment`
Sends base64-encoded image data from the extension host to the webview for preview rendering.

```typescript
{ type: "add_image_attachment", data: "base64...", mimeType: "image/png" }
```

---

## Message Flow Examples

### User sends a prompt
```
Webview                    Extension Host              Pi SDK
  │                              │                        │
  │── { type: "prompt" } ──────►│                        │
  │                              │── session.prompt() ──►│
  │                              │◄── agent_start ────── │
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── message_start ──── │
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── message_update ──── │ (repeated)
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── tool_exec_start ── │
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── tool_exec_end ──── │
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── message_end ────── │
  │◄── { type: "pi_event" } ────│                        │
  │                              │◄── agent_end ──────── │
  │◄── { type: "pi_event" } ────│                        │
```

### Model switching
```
Webview                    Extension Host              Pi SDK
  │                              │                        │
  │── { type: "set_model" } ───►│                        │
  │                              │── session.setModel()─►│
  │◄── { type: "rpc_response" }─│                        │
```
