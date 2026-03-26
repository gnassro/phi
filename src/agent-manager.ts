import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type AgentSessionEvent,
  type SessionInfo,
  type SessionStats,
} from '@mariozechner/pi-coding-agent';
import * as path from 'path';
import * as os from 'os';

/**
 * AgentManager
 *
 * The ONLY module in Phi that imports from @mariozechner/pi-coding-agent.
 * All other files must go through this module's exported functions.
 *
 * Owns the Pi AgentSession lifecycle:
 *   initialize() → prompt/steer/abort → dispose()
 *
 * Auth separation:
 *   - Phi uses its own auth file: ~/.phi/auth.json
 *   - Sessions are shared with the pi CLI: ~/.pi/agent/sessions/
 *   This means Phi has its own API keys independent from the pi CLI,
 *   but both can access the same conversation history.
 *
 * Rule: session.prompt() throws if called during streaming without
 * streamingBehavior. Always check isStreaming() first or use steer()/followUp().
 */

// ─── Auth paths ──────────────────────────────────────────────────────────────

/** Phi's own config directory — separate from pi CLI's ~/.pi/agent/ */
const PHI_CONFIG_DIR = path.join(os.homedir(), '.phi');

/** Phi stores its API keys here, independent from the pi CLI */
const PHI_AUTH_FILE = path.join(PHI_CONFIG_DIR, 'auth.json');

// ─── Internal state ──────────────────────────────────────────────────────────

let session: AgentSession | null = null;
let authStorage: AuthStorage | null = null;
let modelRegistry: ModelRegistry | null = null;
let cwd: string = process.cwd();
const listeners: Array<(event: AgentSessionEvent) => void> = [];

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Boot the Pi session for the given workspace directory.
 * Called once from extension.ts activate().
 *
 * Uses SessionManager.continueRecent() so users always resume
 * the most recent conversation for this project. Creates a new
 * session if none exists.
 */
export async function initialize(workspaceCwd: string): Promise<void> {
  cwd = workspaceCwd;

  // Phi uses its own auth file, separate from the pi CLI
  // Sessions are still shared (default ~/.pi/agent/sessions/)
  authStorage = AuthStorage.create(PHI_AUTH_FILE);
  modelRegistry = new ModelRegistry(authStorage);

  const { session: s } = await createAgentSession({
    sessionManager: SessionManager.continueRecent(cwd),
    cwd,
    authStorage,
    modelRegistry,
  });

  session = s;

  // Forward every Pi event to all registered listeners (IpcBridge)
  session.subscribe((event: AgentSessionEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  });
}

/**
 * Update the CWD when the workspace changes.
 * Does NOT restart the session — the existing session keeps its history.
 * A full restart (new session) would require calling dispose() + initialize().
 */
export function setCwd(newCwd: string): void {
  cwd = newCwd;
}

/**
 * Dispose the Pi session. Called from extension.ts deactivate().
 * Failing to call this leaks the agent process.
 */
export function dispose(): void {
  session?.dispose();
  session = null;
  listeners.length = 0;
}

// ─── Event subscription ───────────────────────────────────────────────────────

/**
 * Register a listener for Pi AgentSessionEvents.
 * Used by IpcBridge to forward events to the webview.
 * Returns an unsubscribe function.
 */
export function subscribe(
  listener: (event: AgentSessionEvent) => void
): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface ImagePayload {
  type: 'image';
  data: string;     // raw base64 (NO data: prefix)
  mimeType: string; // 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

/**
 * Send a user prompt to Pi.
 *
 * If the agent is idle → sends immediately via session.prompt()
 * If the agent is streaming → queues via session.steer() (interrupts current turn)
 *
 * Images: strips the "data:mime;base64," prefix before sending to the SDK.
 */
export async function prompt(
  text: string,
  images?: ImagePayload[]
): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');

  const imagePayloads = images?.map((img) => ({
    type: 'image' as const,
    // Strip "data:mime;base64," prefix if present — SDK expects raw base64
    data: img.data.replace(/^data:[^;]+;base64,/, ''),
    mimeType: img.mimeType,
  }));

  if (session.isStreaming) {
    // Steer: delivered after the current assistant turn finishes its tool calls
    await session.steer(text);
  } else {
    await session.prompt(text, { images: imagePayloads });
  }
}

/**
 * Queue a message to be delivered only after the agent fully finishes.
 * Use this for "after you're done, also do X" style messages.
 */
export async function followUp(text: string): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');
  await session.followUp(text);
}

/**
 * Abort the current Pi turn immediately.
 */
export async function abort(): Promise<void> {
  if (!session) return;
  await session.abort();
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * List all sessions for the current project (matched by CWD).
 * Returns only sessions for this workspace — no client-side filtering needed.
 */
export async function getSessions(): Promise<SessionInfo[]> {
  return await SessionManager.list(cwd);
}

/**
 * Switch to a different session file.
 * After switching, callers should request a full sync from IpcBridge.
 */
export async function switchSession(sessionPath: string): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');
  await session.switchSession(sessionPath);
}

/**
 * Create a brand new empty session.
 */
export async function newSession(): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');
  await session.newSession();
}

// ─── State accessors ──────────────────────────────────────────────────────────

export function isStreaming(): boolean {
  return session?.isStreaming ?? false;
}

export function getMessages() {
  return session?.messages ?? [];
}

export function getSessionFile(): string {
  return session?.sessionFile ?? '';
}

export function getModel(): string {
  return session?.model?.id ?? 'unknown';
}

export function getCwd(): string {
  return cwd;
}

// ─── Model & thinking ─────────────────────────────────────────────────────────

/**
 * Get current agent state for the webview.
 */
export function getState() {
  if (!session) return null;
  const model = session.model;
  return {
    model: model
      ? { id: model.id, provider: model.provider, contextWindow: model.contextWindow }
      : null,
    thinkingLevel: session.thinkingLevel,
    autoCompactionEnabled: session.autoCompactionEnabled,
    sessionName: session.sessionName ?? null,
  };
}

/**
 * Get all available models from the model registry.
 */
export function getAvailableModels() {
  if (!session) return [];
  return session.modelRegistry.getAvailable().map((m) => ({
    id: m.id,
    provider: m.provider,
    contextWindow: m.contextWindow,
  }));
}

/**
 * Switch to a different model by provider + modelId.
 */
export async function setModel(provider: string, modelId: string): Promise<boolean> {
  if (!session) return false;
  const models = session.modelRegistry.getAvailable();
  const target = models.find((m) => m.id === modelId && m.provider === provider);
  if (!target) return false;
  await session.setModel(target);
  return true;
}

/**
 * Cycle thinking level. Returns the new level, or undefined if not supported.
 */
export function cycleThinkingLevel(): string | undefined {
  if (!session) return undefined;
  return session.cycleThinkingLevel();
}

/**
 * Get session statistics (message counts, tokens, cost).
 */
export function getSessionStats(): SessionStats | null {
  if (!session) return null;
  return session.getSessionStats();
}

/**
 * Get context usage info (tokens used / context window).
 */
export function getContextUsage() {
  if (!session) return null;
  return session.getContextUsage() ?? null;
}

/**
 * Trigger manual context compaction.
 */
export async function compact(): Promise<void> {
  if (!session) return;
  await session.compact();
}

/**
 * Enable or disable auto-compaction.
 */
export function setAutoCompaction(enabled: boolean): void {
  if (!session) return;
  session.setAutoCompactionEnabled(enabled);
}

// ─── OAuth login ──────────────────────────────────────────────────────────────

/** Predefined API key providers (name → auth.json key) */
const API_KEY_PROVIDERS: Array<{ name: string; id: string }> = [
  { name: 'Anthropic', id: 'anthropic' },
  { name: 'OpenAI', id: 'openai' },
  { name: 'Google Gemini', id: 'google' },
  { name: 'Azure OpenAI Responses', id: 'azure-openai-responses' },
  { name: 'Mistral', id: 'mistral' },
  { name: 'Groq', id: 'groq' },
  { name: 'Cerebras', id: 'cerebras' },
  { name: 'xAI', id: 'xai' },
  { name: 'OpenRouter', id: 'openrouter' },
  { name: 'Vercel AI Gateway', id: 'vercel-ai-gateway' },
  { name: 'ZAI', id: 'zai' },
  { name: 'OpenCode Zen', id: 'opencode' },
  { name: 'OpenCode Go', id: 'opencode-go' },
  { name: 'Hugging Face', id: 'huggingface' },
  { name: 'Kimi For Coding', id: 'kimi-coding' },
  { name: 'MiniMax', id: 'minimax' },
  { name: 'MiniMax (China)', id: 'minimax-cn' },
];

export interface OAuthProviderInfo {
  id: string;
  name: string;
  loggedIn: boolean;
}

/**
 * Get list of available OAuth providers with login status.
 */
export function getOAuthProviders(): OAuthProviderInfo[] {
  if (!authStorage) return [];
  const providers = authStorage.getOAuthProviders();
  return providers.map(p => ({
    id: p.id,
    name: p.name,
    loggedIn: authStorage!.has(p.id),
  }));
}

/**
 * Login to an OAuth provider.
 * Returns callbacks interface so the caller (commands.ts) can wire up
 * VS Code UI (open browser, show input boxes, progress notifications).
 */
export async function login(
  providerId: string,
  callbacks: {
    onAuth: (info: { url: string; instructions?: string }) => void;
    onPrompt: (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => Promise<string>;
    onProgress?: (message: string) => void;
    onManualCodeInput?: () => Promise<string>;
    signal?: AbortSignal;
  }
): Promise<void> {
  if (!authStorage) throw new Error('[Phi] AgentManager not initialized');
  await authStorage.login(providerId, callbacks);
}

/**
 * Logout from a provider (clears stored OAuth credentials).
 */
export function logout(providerId: string): void {
  if (!authStorage) return;
  authStorage.logout(providerId);
}

/**
 * Check if a provider has credentials (API key or OAuth).
 */
export function hasAuth(providerId: string): boolean {
  if (!authStorage) return false;
  return authStorage.hasAuth(providerId);
}

// ─── API key management ───────────────────────────────────────────────────────

export interface ApiKeyProviderInfo {
  name: string;
  id: string;
  hasKey: boolean;
}

/**
 * Get list of predefined API key providers with their status.
 */
export function getApiKeyProviders(): ApiKeyProviderInfo[] {
  if (!authStorage) return [];
  return API_KEY_PROVIDERS.map(p => ({
    name: p.name,
    id: p.id,
    hasKey: authStorage!.has(p.id),
  }));
}

/**
 * Set an API key for a provider. Saved directly to ~/.phi/auth.json.
 */
export function setApiKey(providerId: string, key: string): void {
  if (!authStorage) throw new Error('[Phi] AgentManager not initialized');
  authStorage.set(providerId, { type: 'api_key', key });
}

/**
 * Remove an API key for a provider.
 */
export function removeApiKey(providerId: string): void {
  if (!authStorage) return;
  authStorage.remove(providerId);
}
