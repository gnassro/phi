# Phi — Pi SDK Usage Reference

The Pi SDK (`@earendil-works/pi-coding-agent`) is the core engine of Phi. It runs entirely in the Extension Host (Node.js). This document covers all patterns used in this project.

Official full SDK docs:
`node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`

> **Current SDK version: `0.83.0`** (migrated from `0.80.10`).
> The 0.80.8 release removed `AuthStorage` and the synchronous `ModelRegistry` projection.
> Phi was migrated to `ModelRuntime` + `FileCredentialStore` in `0.80.10` and the public SDK surface remained stable through `0.83.0`. Phi's single-file bundle additionally registers the SDK's built-in OAuth loaders so subscription flows are available after packaging.

---

## Installation

```bash
pnpm add @earendil-works/pi-coding-agent    # or: npm install @earendil-works/pi-coding-agent
```

The SDK is the same package used by the Pi CLI tool. No separate installation.

The three Pi packages are pinned to the same version and must be bumped together:

```json
"@earendil-works/pi-agent-core": "0.83.0",
"@earendil-works/pi-ai": "0.83.0",
"@earendil-works/pi-coding-agent": "0.83.0"
```

---

## Session Initialization

All Pi SDK code lives in `src/agent-manager.ts`. Phi applies Phi-local provider environment variables before this step (`EnvManager.initialize(ctx)` in `extension.ts`), then creates an `AgentSessionRuntime` once on activation and reads the current live `runtime.session` from it.

```typescript
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  ModelRegistry,
  ModelRuntime,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
} from '@earendil-works/pi-coding-agent';
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth';
import { FileCredentialStore } from './credential-store.js';
import * as os from 'os';
import * as path from 'path';

let runtime: AgentSessionRuntime;
let session: AgentSession;
let unsubscribe: (() => void) | undefined;
let cwd: string;
let modelRuntime: ModelRuntime | null = null;

function bindSession(nextSession: AgentSession) {
  unsubscribe?.();
  session = nextSession;
  unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    IpcBridge.forwardPiEvent(event);
  });
}

export async function initialize(workspaceCwd: string) {
  cwd = workspaceCwd;

  // Phi ships as one esbuild bundle, so make Pi's built-in OAuth flows
  // available without runtime-relative dist/<provider>.js files.
  registerBunOAuthFlows();

  const agentDir = getAgentDir();
  const authPath = path.join(os.homedir(), '.phi', 'auth.json');
  const credentialStore = new FileCredentialStore(authPath);
  modelRuntime = await ModelRuntime.create({
    credentials: new PhiCredentialStore(credentialStore),
    authPath,
  });
  // ModelRegistry is a sync compatibility facade wrapping ModelRuntime.
  const modelRegistry = new ModelRegistry(modelRuntime);

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      modelRuntime,
      resourceLoaderOptions: {
        // optional: extensions, extensionsOverride
      },
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

`PhiCredentialStore` is a thin adapter that wraps `FileCredentialStore` and
implements the `pi-ai` `CredentialStore` interface (read/list/modify/delete).
See `src/credential-store.ts` for the full implementation.

`@earendil-works/pi-ai` keeps its Node-only OAuth implementations behind
bundler-opaque dynamic imports. That is useful for other runtimes, but Phi's
single-file `dist/extension.js` has no neighboring `dist/anthropic.js`,
`dist/openai-codex.js`, or equivalent provider files. Registering the bundled
loaders before `ModelRuntime.create()` embeds those flows and keeps subscription
login working in packaged installs.

---

## Sending Messages

```typescript
export async function prompt(text: string, images?: ImagePayload[]) {
  if (!session) return;

  const imagePayloads = images?.map((img) => ({
    type: 'image' as const,
    data: img.data.replace(/^data:[^;]+;base64,/, ''),
    mimeType: img.mimeType,
  }));

  if (session.isStreaming) {
    await session.steer(text);
  } else {
    await session.prompt(text, { images: imagePayloads });
  }
}

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

## Phi-Local Provider Environment

Provider environment variables that are required in addition to auth credentials are handled outside the Pi SDK in `src/env-manager.ts`.

Key behaviors:

- Initialize `EnvManager` before `AgentManager.initialize(cwd)` so `process.env` is ready when `ModelRuntime` and provider code load.
- Store Phi-local env values in VS Code `SecretStorage`.
- Store per-provider preferences (`global` vs `local`) in VS Code global state.
- If a global env var is present in the VS Code extension host process, offer to use it instead of storing a Phi-local value.
- After env changes, call `await modelRuntime.refresh()` and reconcile the active model.

Currently guided providers include Cloudflare Workers AI, Azure OpenAI Responses, Amazon Bedrock, Google Vertex AI, and optional Google Gemini CLI paid project setup.

---

## Login-Capable Provider Discovery

Phi mirrors Pi's interactive `/login` discovery logic using public SDK surfaces instead of importing Pi's internal interactive-mode code.

```typescript
export function getLoginProviders(authType?: 'oauth' | 'api_key') {
  const mr = modelRuntime ?? session?.modelRuntime ?? null;
  if (!mr) return [];

  const allProviders = mr.getProviders();
  const oauthProviders = allProviders.filter((p) => p.auth?.oauth);
  const oauthIds = new Set(oauthProviders.map((p) => p.id));

  const apiKeyProviders = new Set(
    session.modelRuntime.getModels().map((m) => m.provider)
  );

  return {
    oauth: oauthProviders.map((p) => ({
      id: p.id,
      name: p.name,
      loggedIn: getStoredCredentialType(p.id) === 'oauth',
    })),
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

- **Use `modelRuntime.getProviders()` for subscription/OAuth providers.** It returns
  the canonical provider list, including any extension-registered providers.
- **Use `session.modelRuntime.getModels()` to discover API-key/setup providers dynamically.** This keeps Phi aligned with built-ins added by newer Pi releases
  (e.g. `qwen-token-plan`, `qwen-token-plan-cn` added in `0.81.0`) and with
  custom providers from `~/.pi/agent/models.json`.
- **Use `modelRuntime.getProviderAuthStatus(providerId)` for auth-source labels** (`environment`, `models_json_key`, `stored`, etc.).
- **Check `credentialStore.getSync(providerId)?.type` before labeling a provider as logged in or having an API key.** Some providers share the same ID across OAuth and API-key flows (for example `anthropic`), so a plain `has(providerId)` check is not enough. See `AGENTS.md` rule #18.
- **Call `await modelRuntime.refresh()` after direct credential/API-key mutations** so provider availability and custom `refreshModels()` hooks stay in sync. `ModelRuntime.login()` and `ModelRuntime.logout()` already refresh internally; Phi's command layer only reconciles the selected model afterward.
- **After auth changes, reconcile the active model against `modelRuntime.getAvailableSnapshot()`.** If the current model disappeared, switch to another available model; if none remain, clear the current model so the UI can fall back to Login/Setup instead of showing a stale provider. See `AGENTS.md` rule #19.
- **Do not deep-import Pi internals from `dist/modes/interactive/*`.** Recreate the behavior from public SDK methods only.
- **Handle both `auth_url` and `device_code` notifications.** Device-code providers
  such as GitHub Copilot, Kimi Code, and xAI provide a `verificationUri` and
  `userCode` through `AuthInteraction.notify()`. Phi forwards those to VS Code's
  browser opener and displays the code while polling continues.

---

## Login Flow

Phi uses the SDK's `modelRuntime.login(providerId, 'oauth', interaction)` API:

```typescript
import { ModelRuntime, type AuthInteraction } from '@earendil-works/pi-coding-agent';

const interaction: AuthInteraction = {
  signal: abortController.signal,
  prompt: async (prompt) => {
    if (prompt.type === 'manual_code') {
      return await vscodeWindow.showInputBox({ prompt: prompt.message });
    }
    if (prompt.type === 'secret' || prompt.type === 'text') {
      return await vscodeWindow.showInputBox({ prompt: prompt.message });
    }
    return '';
  },
  notify: (event) => {
    if (event.type === 'auth_url') {
      vscodeEnv.openExternal(vscode.Uri.parse(event.url));
    } else if (event.type === 'device_code') {
      vscodeEnv.openExternal(vscode.Uri.parse(event.verificationUri));
      outputChannel.appendLine(`Enter code ${event.userCode} in the browser.`);
    } else if (event.type === 'progress') {
      outputChannel.appendLine(event.message);
    }
  },
};

// ModelRuntime.login() persists the credential and refreshes availability.
await modelRuntime.login(providerId, 'oauth', interaction);
```

---

## Building a State Snapshot (for `sync` message)

When the webview requests a full sync (`request_sync`), send the current session branch, not just `session.messages`:

```typescript
export function getHistoryEntries() {
  return session.sessionManager.getBranch();
}

export function buildSnapshot(): SyncState {
  return {
    entries: getHistoryEntries(),
    isStreaming: session.isStreaming,
    cwd,
    sessionFile: session.sessionFile ?? '',
    model: session.model?.id ?? 'unknown',
  };
}
```

`session.messages` is the current LLM context. After compaction it contains a compaction summary plus kept/post-compaction messages, so it can omit older visible conversation messages. `session.sessionManager.getBranch()` preserves the current visible branch, including pre-compaction messages and `compaction` entries for UI markers.

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
{ type: "agent_end", messages: AgentMessage[], willRetry: boolean }
{ type: "agent_settled" }                  // added in 0.80.4

// Turn lifecycle
{ type: "turn_start" }
{ type: "turn_end", message: AgentMessage, toolResults: ToolResult[] }

// Auto-compaction
{ type: "compaction_start", reason: "manual" | "threshold" | "overflow" }
{ type: "compaction_end", reason, result, aborted, willRetry, errorMessage? }

// Auto-retry (added 0.80.6 / 0.81.1)
{ type: "auto_retry_start", attempt, maxAttempts, delayMs, errorMessage }
{ type: "auto_retry_end", success, attempt, finalError? }
{ type: "summarization_retry_scheduled", attempt, maxAttempts, delayMs, errorMessage }
{ type: "summarization_retry_attempt_start", source: "branchSummary" | "compaction", reason? }
{ type: "summarization_retry_finished" }

// Session info
{ type: "session_info_changed", name: string | undefined }
{ type: "thinking_level_changed", level: ThinkingLevel }
{ type: "entry_appended", entry: SessionEntry }

// Bash streaming (added 0.82.0)
{ type: "bash_execution_update", id?: string, delta: string }
```

Phi only forwards events; the webview ignores anything it doesn't render. Adding
new event types on the SDK side is a non-breaking change for Phi.

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

1. **Only `agent-manager.ts` imports from `@earendil-works/pi-coding-agent`**. All other files go through `AgentManager`.

2. **Phi uses `AgentSessionRuntime` for session replacement**. `newSession()` / `switchSession()` go through the runtime, not `AgentSession`.

3. **After runtime session replacement, re-bind event subscriptions**. `runtime.session` changes after `newSession()` / `switchSession()`.

4. **`session.prompt()` throws if called during streaming** without a `streamingBehavior` option. Always check `session.isStreaming` first, or use `steer()`/`followUp()` during streaming.

5. **Sessions persist to `~/.pi/agent/sessions/`** automatically. No manual save needed.

6. **`SessionManager.list(cwd)` returns only sessions for the current project** (matched by cwd encoding in the directory name). Do not filter client-side.

7. **Image data must have the `data:` prefix stripped** before passing to the SDK. The SDK expects raw base64, not data URIs.

8. **Dispose the runtime in `deactivate()`**. Call `await runtime.dispose()` to avoid leaking the agent process.

9. **Mirror Pi's `/login` discovery using public SDK methods only**. Use `modelRuntime.getProviders()`, `modelRuntime.getAvailableSnapshot()`, and `modelRuntime.getProviderAuthStatus()` instead of hardcoding provider lists or deep-importing Pi's interactive-mode internals. `AuthStorage` was removed in pi-coding-agent `0.80.8`; use `ModelRuntime` + `FileCredentialStore` instead.

10. **After auth changes, reconcile the current model before refreshing the UI.** The selected model can become invalid after logout or API-key removal. Switch to another available model if possible; otherwise clear `session.state.model` so Phi shows Login/Setup instead of a stale model label.

---

## Migration notes

### `0.80.10` → `0.83.0` (2026-07-29)

**No API migration changes were required.** Bumping the three Pi packages in
`package.json` preserved the public API surface Phi uses. Because Phi packages the
extension host as one esbuild file, it separately registers the SDK's built-in
OAuth loaders before `ModelRuntime.create()` (see the Session Initialization
section above).

- `ModelRuntime.create({ credentials, authPath })` — unchanged
- `ModelRegistry` sync facade — unchanged
- `AgentSessionRuntime` / `createAgentSessionRuntime` / `createAgentSessionServices` / `createAgentSessionFromServices` — unchanged
- `AgentSession` public methods (`subscribe`, `prompt`, `steer`, `followUp`, `abort`, `setModel`, `cycleThinkingLevel`, `compact`, `setAutoCompactionEnabled`, `navigateTree`, `getSessionStats`, `getContextUsage`, `model`, `modelRuntime`, `state`, `messages`, `sessionManager`, `sessionFile`, `sessionName`, `thinkingLevel`, `autoCompactionEnabled`, `isStreaming`, `resourceLoader.getSkills()`) — unchanged
- `SessionInfo` / `SessionEntry` / `SessionManager.list` / `getAgentDir` — unchanged
- `@earendil-works/pi-ai` `CredentialStore` / `Credential` / `AuthInteraction` / `Provider` / `Model` / `Api` — unchanged

Notable SDK-side changes since 0.80.10 that are inert for Phi:

- **0.81.0**: Persisted tool/compaction/branch-summary usage in `getSessionStats()`.
  Phi's `getSessionStats()` in `agent-manager.ts` manually aggregates from
  `session.sessionManager.getEntries()` and was not affected.
- **0.81.0**: New built-in providers `qwen-token-plan` and `qwen-token-plan-cn`.
  Phi's `getLoginProviders()` already uses `modelRuntime.getProviders()` and
  `getModels()` so they appear automatically.
- **0.81.0**: `llama.cpp` router, full provider extensions, `get_available_thinking_levels` RPC command — not used by Phi.
- **0.82.0/0.82.1**: Constrained tool sampling, OpenRouter/Kimi Code OAuth,
  `ANTHROPIC_AUTH_TOKEN`, Claude Opus 5 — inert for Phi.
- **0.83.0**: New `StopReason: "pending"`, `rawStopReason` on messages, `usage?` on tool results, `fetch` injection on `Model`/`StreamOptions`, `pi auth print-api-key` CLI command — inert for Phi.
- **0.83.0**: TypeBox bumped from `1.1.38` → `1.3.7`. Phi does not import
  TypeBox directly (only transitively through the SDK) and none of the
  removed aliases (`Type.Base`, `Type.Awaited`, `Type.Promise`,
  `Type.AsyncIterator`, `Type.Iterator`, `Type.Options`, `Value.Mutate`)
  are referenced anywhere in `src/`, `public/`, or the legacy Google
  extension code, so the upgrade is safe.
- **0.83.0**: OAuth credential resolution now refreshes tokens with less than
  5 minutes of validity (vs. waiting until expiration). Phi's
  `modelRuntime.login()` flow automatically benefits.

### Earlier breakages worth knowing about

- **`0.80.8` removed `AuthStorage`** and the `modelRegistry` /
  `authStorage` options on `createAgentSessionServices()`. Phi was migrated
  to `ModelRuntime` + `FileCredentialStore` in `0.80.10` (see rule #9 above).
- **`0.80.8` made `ModelRegistry.refresh()` async** (`Promise<void>`). Phi
  always `await`s it after auth changes.
- **`0.80.6` introduced a `max` thinking level** above `xhigh`. Phi's
  `cycleThinkingLevel()` passes through whatever the SDK returns, so the new
  level is reachable without code changes.
