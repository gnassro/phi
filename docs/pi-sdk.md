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

All Pi SDK code lives in `src/agent-manager.ts`. Phi now creates an `AgentSessionRuntime` once on activation and reads the current live `runtime.session` from it.

```typescript
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
} from "@mariozechner/pi-coding-agent";
import * as os from "os";
import * as path from "path";

let runtime: AgentSessionRuntime;
let session: AgentSession;
let unsubscribe: (() => void) | undefined;
let cwd: string;

function bindSession(nextSession: AgentSession) {
  unsubscribe?.();
  session = nextSession;
  unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    IpcBridge.forwardPiEvent(event);
  });
}

export async function initialize(workspaceCwd: string) {
  cwd = workspaceCwd;

  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create(path.join(os.homedir(), ".phi", "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage);

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      authStorage,
      modelRegistry,
    });

    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: SessionManager.continueRecent(cwd),
  });

  bindSession(runtime.session);
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
  if (!runtime) return;
  await runtime.switchSession(sessionPath);
  bindSession(runtime.session); // runtime.session changed
  IpcBridge.sendSync();
}

// Create a new empty session
export async function newSession() {
  if (!runtime) return;
  await runtime.newSession();
  bindSession(runtime.session); // runtime.session changed
  IpcBridge.sendSync();
}
```

---

## Login-Capable Provider Discovery

Phi mirrors Pi's interactive `/login` discovery logic using public SDK surfaces instead of importing Pi's internal interactive-mode code.

```typescript
export function getLoginProviders(authType?: "oauth" | "api_key") {
  const oauthProviders = authStorage.getOAuthProviders();
  const oauthIds = new Set(oauthProviders.map(provider => provider.id));

  const apiKeyProviders = new Set(
    session.modelRegistry.getAll().map(model => model.provider)
  );

  return {
    oauth: oauthProviders,
    apiKey: [...apiKeyProviders].filter((providerId) => {
      // Built-in API-key providers stay on a local display-name map.
      if (providerId in API_KEY_PROVIDER_DISPLAY_NAMES) return true;
      // Custom providers from models.json are login-capable unless they already
      // registered themselves as OAuth providers.
      return !oauthIds.has(providerId);
    }),
  };
}
```

Important details:

- **Use `authStorage.getOAuthProviders()` for subscription/OAuth providers.**
- **Use `session.modelRegistry.getAll()` to discover API-key/setup providers dynamically.** This keeps Phi aligned with built-ins added by newer Pi releases and with custom providers from `~/.pi/agent/models.json`.
- **Use `session.modelRegistry.getProviderAuthStatus(providerId)` for auth-source labels** (`environment`, `models_json_key`, etc.).
- **Check `authStorage.get(providerId)?.type` before labeling a provider as logged in or having an API key.** Some providers share the same ID across OAuth and API-key flows (for example `anthropic`), so `authStorage.has(providerId)` alone is not enough.
- **Call `modelRegistry.refresh()` after login/logout/API-key changes** so provider availability and custom `modifyModels()` hooks stay in sync.
- **After auth changes, reconcile the active model against `modelRegistry.getAvailable()`.** If the current model disappeared, switch to another available model; if none remain, clear the current model so the UI can fall back to Login/Setup instead of showing a stale provider.
- **Do not deep-import Pi internals from `dist/modes/interactive/*`.** Recreate the behavior from public SDK methods only.

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

These are the raw events from Pi SDK that the IPC bridge forwards to the webview.

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
export async function dispose() {
  unsubscribe?.();
  await runtime?.dispose();
}
```

Call this from `deactivate()` in `extension.ts` and await it.

---

## Key Rules

1. **Only `agent-manager.ts` imports from `@mariozechner/pi-coding-agent`**. All other files go through `AgentManager`.

2. **Phi uses `AgentSessionRuntime` for session replacement**. `newSession()` / `switchSession()` now go through the runtime, not `AgentSession`.

3. **After runtime session replacement, re-bind event subscriptions**. `runtime.session` changes after `newSession()` / `switchSession()`.

4. **`session.prompt()` throws if called during streaming** without a `streamingBehavior` option. Always check `session.isStreaming` first, or use `steer()`/`followUp()` during streaming.

5. **Sessions persist to `~/.pi/agent/sessions/`** automatically. No manual save needed.

6. **`SessionManager.list(cwd)` returns only sessions for the current project** (matched by cwd encoding in the directory name). Do not filter client-side.

7. **Image data must have the `data:` prefix stripped** before passing to the SDK. The SDK expects raw base64, not data URIs.

8. **Dispose the runtime in `deactivate()`**. Call `await runtime.dispose()` to avoid leaking the agent process.

9. **Mirror Pi's `/login` discovery using public SDK methods only**. Use `authStorage.getOAuthProviders()`, `session.modelRegistry.getAll()`, and `session.modelRegistry.getProviderAuthStatus()` instead of hardcoding provider lists or deep-importing Pi's interactive-mode internals.

10. **After auth changes, reconcile the current model before refreshing the UI.** The selected model can become invalid after logout or API-key removal. Switch to another available model if possible; otherwise clear `session.state.model` so Phi shows Login/Setup instead of a stale model label.
