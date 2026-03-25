# Phi — Pi SDK Usage Reference

The Pi SDK (`@mariozechner/pi-coding-agent`) is the core engine of Phi. It runs entirely in the Extension Host (Node.js). This document covers all patterns used in this project.

Official full SDK docs:
`/Users/macbook/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`

---

## Installation

```bash
pnpm add @mariozechner/pi-coding-agent    # or: npm install @mariozechner/pi-coding-agent
```

The SDK is the same package used by the Pi CLI tool. No separate installation.

---

## Session Initialization

All Pi SDK code lives in `src/agent-manager.ts`. The session is created once when the extension activates.

```typescript
import {
  createAgentSession,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

let session: AgentSession;
let cwd: string;

export async function initialize(workspaceCwd: string) {
  cwd = workspaceCwd;

  const { session: s } = await createAgentSession({
    // Resume the most recent session for this project
    // Creates a new one if none exists
    sessionManager: SessionManager.continueRecent(cwd),
    cwd,
  });

  session = s;

  // Forward ALL events to the IPC bridge
  session.subscribe((event: AgentSessionEvent) => {
    IpcBridge.forwardPiEvent(event);
  });
}
```

---

## Sending Messages

```typescript
// When agent is idle — send immediately
export async function prompt(text: string, images?: ImagePayload[]) {
  if (!session) return;

  const content = images?.length
    ? [
        { type: "text" as const, text },
        ...images.map(img => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            mediaType: img.mimeType as any,
            data: img.data.replace(/^data:[^;]+;base64,/, ""),
          },
        })),
      ]
    : text;

  await session.prompt(typeof content === "string" ? content : content[0].text, {
    images: images?.map(img => ({
      type: "image",
      source: {
        type: "base64",
        mediaType: img.mimeType,
        data: img.data.replace(/^data:[^;]+;base64,/, ""),
      },
    })),
  });
}

// When agent is streaming — queue the message
export async function steer(text: string) {
  if (!session) return;
  await session.steer(text);
}

// When agent is streaming — wait for it to finish, then send
export async function followUp(text: string) {
  if (!session) return;
  await session.followUp(text);
}
```

---

## Aborting

```typescript
export async function abort() {
  if (!session) return;
  await session.abort();
}
```

---

## Session Management

```typescript
// List all sessions for the current project
export async function getSessions(): Promise<SessionInfo[]> {
  return await SessionManager.list(cwd);
}

// Switch to a different session
export async function switchSession(sessionPath: string) {
  if (!session) return;
  await session.switchSession(sessionPath);
  // After switch, send a full sync to the webview
  IpcBridge.sendSync();
}

// Create a new empty session
export async function newSession() {
  if (!session) return;
  await session.newSession();
  IpcBridge.sendSync();
}
```

---

## Building a State Snapshot (for `sync` message)

When the webview requests a full sync (`request_sync`), build this:

```typescript
export function buildSnapshot(): SyncState {
  return {
    entries: session.messages.map(msg => ({
      type: "message",
      message: msg,
    })),
    isStreaming: session.isStreaming,
    cwd,
    sessionFile: session.sessionFile ?? "",
    model: session.model?.id ?? "unknown",
  };
}
```

---

## AgentSessionEvent Types

These are the raw events from Pi SDK that the IPC bridge forwards to the webview. The webview handles them identically to Tau.

```typescript
// Text streaming from assistant
{ type: "message_update", assistantMessageEvent: {
    type: "text_delta", delta: string
  }
}

// Thinking blocks (if thinking mode enabled)
{ type: "message_update", assistantMessageEvent: {
    type: "thinking_delta", delta: string
  }
}

// Tool execution lifecycle
{ type: "tool_execution_start", toolName: string, toolCallId: string }
{ type: "tool_execution_update", toolCallId: string, output: string }
{ type: "tool_execution_end", toolCallId: string, isError: boolean }

// Message lifecycle
{ type: "message_start", message: AgentMessage }
{ type: "message_end", message: AgentMessage }

// Agent lifecycle
{ type: "agent_start" }
{ type: "agent_end", messages: AgentMessage[] }

// Turn lifecycle
{ type: "turn_start" }
{ type: "turn_end", message: AgentMessage, toolResults: ToolResult[] }

// Auto-compaction
{ type: "auto_compaction_start" }
{ type: "auto_compaction_end", summary?: string }
```

---

## Cleanup

```typescript
export function dispose() {
  session?.dispose();
}
```

Call this from `deactivate()` in `extension.ts`.

---

## Key Rules

1. **Only `agent-manager.ts` imports from `@mariozechner/pi-coding-agent`**. All other files go through `AgentManager`.

2. **`session.prompt()` throws if called during streaming** without a `streamingBehavior` option. Always check `session.isStreaming` first, or use `steer()`/`followUp()` during streaming.

3. **Sessions persist to `~/.pi/agent/sessions/`** automatically. No manual save needed.

4. **`SessionManager.list(cwd)` returns only sessions for the current project** (matched by cwd encoding in the directory name). Do not filter client-side.

5. **Image data must have the `data:` prefix stripped** before passing to the SDK. The SDK expects raw base64, not data URIs.
