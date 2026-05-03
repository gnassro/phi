import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
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
 * Owns the Pi AgentSessionRuntime lifecycle:
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

let runtime: AgentSessionRuntime | null = null;
let session: AgentSession | null = null;
let sessionUnsubscribe: (() => void) | null = null;
let authStorage: AuthStorage | null = null;
let modelRegistry: ModelRegistry | null = null;
let cwd: string = process.cwd();
const listeners: Array<(event: AgentSessionEvent) => void> = [];

function forwardEvent(event: AgentSessionEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function bindSession(nextSession: AgentSession): void {
  sessionUnsubscribe?.();
  session = nextSession;
  sessionUnsubscribe = nextSession.subscribe(forwardEvent);
}

function logRuntimeDiagnostics(
  source: string,
  diagnostics: readonly AgentSessionRuntimeDiagnostic[]
): void {
  for (const diagnostic of diagnostics) {
    const prefix = `[Phi] ${source}: ${diagnostic.message}`;
    if (diagnostic.type === 'error') {
      console.error(prefix);
    } else if (diagnostic.type === 'warning') {
      console.warn(prefix);
    } else {
      console.info(prefix);
    }
  }
}

function logModelFallbackMessage(source: string, message?: string): void {
  if (message) {
    console.warn(`[Phi] ${source}: ${message}`);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Boot the Pi session runtime for the given workspace directory.
 * Called once from extension.ts activate().
 *
 * Uses SessionManager.continueRecent() so users always resume
 * the most recent conversation for this project. Creates a new
 * session if none exists.
 */
export async function initialize(workspaceCwd: string): Promise<void> {
  cwd = workspaceCwd;

  // Phi uses its own auth file, separate from the pi CLI.
  // Sessions are still shared (default ~/.pi/agent/sessions/).
  const agentDir = getAgentDir();
  const storage = AuthStorage.create(PHI_AUTH_FILE);
  const registry = ModelRegistry.create(storage);
  authStorage = storage;
  modelRegistry = registry;

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir,
      authStorage: storage,
      modelRegistry: registry,
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
  logRuntimeDiagnostics('Session startup', runtime.diagnostics);
  logModelFallbackMessage('Session startup', runtime.modelFallbackMessage);
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
 * Dispose the Pi session runtime. Called from extension.ts deactivate().
 * Failing to call this leaks the agent process.
 */
export async function dispose(): Promise<void> {
  sessionUnsubscribe?.();
  sessionUnsubscribe = null;

  const currentRuntime = runtime;
  runtime = null;
  session = null;
  authStorage = null;
  modelRegistry = null;
  listeners.length = 0;

  await currentRuntime?.dispose();
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
  if (!runtime) throw new Error('[Phi] AgentManager not initialized');
  await runtime.switchSession(sessionPath);
  bindSession(runtime.session);
  logRuntimeDiagnostics('Session switch', runtime.diagnostics);
  logModelFallbackMessage('Session switch', runtime.modelFallbackMessage);
}

/**
 * Create a brand new empty session.
 */
export async function newSession(): Promise<void> {
  if (!runtime) throw new Error('[Phi] AgentManager not initialized');
  await runtime.newSession();
  bindSession(runtime.session);
  logRuntimeDiagnostics('New session', runtime.diagnostics);
  logModelFallbackMessage('New session', runtime.modelFallbackMessage);
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
  const stats = session.getSessionStats();

  // Pi's built-in getSessionStats only sums the current state (post-compaction).
  // To get the TRUE total cost and tokens, we must iterate over the entire session history.
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;

  for (const entry of session.sessionManager.getEntries()) {
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      const usage = entry.message.usage;
      if (usage) {
        totalInput += usage.input || 0;
        totalOutput += usage.output || 0;
        totalCacheRead += usage.cacheRead || 0;
        totalCacheWrite += usage.cacheWrite || 0;
        if (usage.cost && usage.cost.total) {
          totalCost += usage.cost.total;
        }
      }
    }
  }

  return {
    ...stats,
    tokens: {
      input: totalInput,
      output: totalOutput,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      total: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
    },
    cost: totalCost,
  };
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
export async function compact(): Promise<any> {
  if (!session) return;
  return await session.compact();
}

/**
 * Enable or disable auto-compaction.
 */
export function setAutoCompaction(enabled: boolean): void {
  if (!session) return;
  session.setAutoCompactionEnabled(enabled);
}

// ─── Auth / login-capable providers ───────────────────────────────────────────

type ProviderAuthSource =
  | 'stored'
  | 'runtime'
  | 'environment'
  | 'fallback'
  | 'models_json_key'
  | 'models_json_command';

type ProviderCredentialType = 'oauth' | 'api_key';

const BEDROCK_PROVIDER_ID = 'amazon-bedrock';
const CLOUDFLARE_PROVIDER_ID = 'cloudflare-workers-ai';

/** Built-in provider display names mirrored from Pi's interactive /login flow. */
const API_KEY_PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  [BEDROCK_PROVIDER_ID]: 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI Responses',
  cerebras: 'Cerebras',
  [CLOUDFLARE_PROVIDER_ID]: 'Cloudflare Workers AI',
  deepseek: 'DeepSeek',
  fireworks: 'Fireworks',
  google: 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  groq: 'Groq',
  huggingface: 'Hugging Face',
  'kimi-coding': 'Kimi For Coding',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax (China)',
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  xai: 'xAI',
  zai: 'ZAI',
};

export interface ProviderAuthStatusInfo {
  configured: boolean;
  source?: ProviderAuthSource;
  label?: string;
}

export interface OAuthProviderInfo {
  id: string;
  name: string;
  loggedIn: boolean;
  authStatus: ProviderAuthStatusInfo;
}

export interface ApiKeyProviderInfo {
  name: string;
  id: string;
  hasKey: boolean;
  authStatus: ProviderAuthStatusInfo;
  setupHint?: string;
}

export interface LoginProviderInfo {
  id: string;
  name: string;
  authType: ProviderCredentialType;
  storedCredentialType: ProviderCredentialType | null;
  authStatus: ProviderAuthStatusInfo;
  setupHint?: string;
  setupOnly: boolean;
}

export interface StoredCredentialProviderInfo {
  id: string;
  name: string;
  authType: ProviderCredentialType;
}

function getCurrentModelRegistry(): ModelRegistry | null {
  return modelRegistry ?? session?.modelRegistry ?? null;
}

function refreshModelRegistryAuthState(): void {
  getCurrentModelRegistry()?.refresh();
}

function getStoredCredentialType(providerId: string): ProviderCredentialType | null {
  const credential = authStorage?.get(providerId);
  if (credential?.type === 'oauth') return 'oauth';
  if (credential?.type === 'api_key') return 'api_key';
  return null;
}

function getProviderAuthStatus(providerId: string): ProviderAuthStatusInfo {
  const status = getCurrentModelRegistry()?.getProviderAuthStatus(providerId) ?? { configured: false };
  return {
    configured: !!status.configured,
    source: status.source as ProviderAuthSource | undefined,
    label: status.label,
  };
}

function getApiKeyProviderDisplayName(providerId: string): string {
  return API_KEY_PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
}

function isApiKeyLoginProvider(providerId: string, oauthProviderIds: Set<string>): boolean {
  if (providerId in API_KEY_PROVIDER_DISPLAY_NAMES) {
    return true;
  }
  return !oauthProviderIds.has(providerId);
}

function getProviderSetupHint(providerId: string): string | undefined {
  switch (providerId) {
    case BEDROCK_PROVIDER_ID:
      return 'Uses AWS credentials or bearer tokens instead of a single API key.';
    case CLOUDFLARE_PROVIDER_ID:
      return 'Requires CLOUDFLARE_ACCOUNT_ID in your environment in addition to the API key.';
    default:
      return undefined;
  }
}

/**
 * Get list of available OAuth providers with login status.
 */
export function getOAuthProviders(): OAuthProviderInfo[] {
  if (!authStorage) return [];
  const providers = authStorage.getOAuthProviders();
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    loggedIn: getStoredCredentialType(provider.id) === 'oauth',
    authStatus: getProviderAuthStatus(provider.id),
  }));
}

/**
 * Get login-capable providers, mirroring Pi's interactive /login discovery.
 * OAuth providers come from AuthStorage. API-key providers are discovered from
 * the live model registry so built-ins and models.json custom providers stay in sync.
 */
export function getLoginProviders(
  authType?: ProviderCredentialType
): LoginProviderInfo[] {
  if (!authStorage || !session) return [];

  const oauthProviders = authStorage.getOAuthProviders();
  const oauthProviderIds = new Set(oauthProviders.map((provider) => provider.id));
  const providers: LoginProviderInfo[] = [];

  if (!authType || authType === 'oauth') {
    for (const provider of oauthProviders) {
      providers.push({
        id: provider.id,
        name: provider.name,
        authType: 'oauth',
        storedCredentialType: getStoredCredentialType(provider.id),
        authStatus: getProviderAuthStatus(provider.id),
        setupHint: undefined,
        setupOnly: false,
      });
    }
  }

  if (!authType || authType === 'api_key') {
    const modelProviders = new Set(session.modelRegistry.getAll().map((model) => model.provider));
    for (const providerId of modelProviders) {
      if (!isApiKeyLoginProvider(providerId, oauthProviderIds)) continue;
      providers.push({
        id: providerId,
        name: getApiKeyProviderDisplayName(providerId),
        authType: 'api_key',
        storedCredentialType: getStoredCredentialType(providerId),
        authStatus: getProviderAuthStatus(providerId),
        setupHint: getProviderSetupHint(providerId),
        setupOnly: providerId === BEDROCK_PROVIDER_ID,
      });
    }
  }

  return providers.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get stored credentials of a specific type (or all stored credentials).
 */
export function getStoredCredentialProviders(
  authType?: ProviderCredentialType
): StoredCredentialProviderInfo[] {
  if (!authStorage) return [];

  const oauthNameById = new Map(
    authStorage.getOAuthProviders().map((provider) => [provider.id, provider.name])
  );

  const providers: StoredCredentialProviderInfo[] = [];
  for (const providerId of authStorage.list()) {
    const credential = authStorage.get(providerId);
    if (!credential) continue;
    const credentialType = credential.type === 'oauth' ? 'oauth' : 'api_key';
    if (authType && credentialType !== authType) continue;

    providers.push({
      id: providerId,
      name: credentialType === 'oauth'
        ? (oauthNameById.get(providerId) ?? providerId)
        : getApiKeyProviderDisplayName(providerId),
      authType: credentialType,
    });
  }

  return providers.sort((a, b) => a.name.localeCompare(b.name));
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
  refreshModelRegistryAuthState();
}

/**
 * Logout from a provider (clears stored OAuth credentials).
 */
export function logout(providerId: string): void {
  if (!authStorage) return;
  authStorage.logout(providerId);
  refreshModelRegistryAuthState();
}

/**
 * Check if a provider has credentials (API key or OAuth).
 */
export function hasAuth(providerId: string): boolean {
  if (!authStorage) return false;
  return authStorage.hasAuth(providerId);
}

/**
 * Get dynamic API-key providers with their stored-key status.
 */
export function getApiKeyProviders(): ApiKeyProviderInfo[] {
  return getLoginProviders('api_key').map((provider) => ({
    name: provider.name,
    id: provider.id,
    hasKey: provider.storedCredentialType === 'api_key',
    authStatus: provider.authStatus,
    setupHint: provider.setupHint,
  }));
}

/**
 * Set an API key for a provider. Saved directly to ~/.phi/auth.json.
 */
export function setApiKey(providerId: string, key: string): void {
  if (!authStorage) throw new Error('[Phi] AgentManager not initialized');
  authStorage.set(providerId, { type: 'api_key', key });
  refreshModelRegistryAuthState();
}

/**
 * Remove an API key for a provider.
 */
export function removeApiKey(providerId: string): void {
  if (!authStorage) return;
  authStorage.remove(providerId);
  refreshModelRegistryAuthState();
}

// ─── Tree / branching ─────────────────────────────────────────────────────────

/** Local mirror of SessionTreeNode (not re-exported from pi SDK package root) */
interface SessionTreeNode {
  entry: any; // SessionEntry
  children: SessionTreeNode[];
  label?: string;
}

/**
 * Serialized tree node for IPC — flat structure (no nested children).
 * The webview reconstructs the hierarchy using parentId + childIds.
 */
export interface SerializedTreeNode {
  id: string;
  parentId: string | null;
  type: string;
  label?: string;
  preview: string;        // short text preview for display
  role?: string;          // 'user' | 'assistant' for message entries
  childIds: string[];     // IDs of direct children (flat reference)
}

/**
 * Get all available skills.
 */
export function getSkills() {
  if (!session) return [];
  return session.resourceLoader.getSkills().skills;
}

/**
 * Get the session tree structure + current leaf ID.
 * Returns a flat array of nodes (no nesting) to avoid structured clone
 * failures in postMessage for deeply nested trees.
 */
export function getTree(): { nodes: SerializedTreeNode[]; leafId: string | null } {
  if (!session) return { nodes: [], leafId: null };
  const sm = session.sessionManager;
  const rawTree = sm.getTree();
  const leafId = sm.getLeafId();
  return {
    nodes: serializeTreeFlat(rawTree),
    leafId,
  };
}

/**
 * Extract a short preview string from a tree node's entry.
 */
function getEntryPreview(entry: any): { preview: string; role?: string } {
  let preview = '';
  let role: string | undefined;

  switch (entry.type) {
    case 'message': {
      const msg = entry.message;
      role = msg.role;
      if (typeof msg.content === 'string') {
        preview = msg.content.substring(0, 120);
      } else if (Array.isArray(msg.content)) {
        // Collect text content
        const textParts: string[] = [];
        const toolNames: string[] = [];
        for (const block of msg.content as any[]) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_use' && block.name) {
            const argPreview = block.input?.path || block.input?.command?.substring(0, 50) || '';
            toolNames.push(argPreview ? `${block.name}(${argPreview})` : block.name);
          } else if (block.type === 'tool_result') {
            // Skip tool results in preview
          }
        }
        if (textParts.length > 0) {
          preview = textParts.join(' ').substring(0, 120);
        } else if (toolNames.length > 0) {
          preview = toolNames.join(', ').substring(0, 120);
        }
      }
      // Fallback: if preview is still empty, show role
      if (!preview) {
        preview = role === 'user' ? '(empty)' : '(tool calls)';
      }
      break;
    }
    case 'compaction':
      preview = 'Context compacted';
      break;
    case 'branch_summary':
      preview = entry.summary?.substring(0, 80) || 'Branch summary';
      break;
    case 'model_change':
      preview = `Model → ${entry.modelId}`;
      break;
    case 'thinking_level_change':
      preview = `Thinking → ${entry.thinkingLevel}`;
      break;
    case 'custom_message':
      preview = (entry as any).content?.substring(0, 80) || 'Custom message';
      break;
    default:
      preview = entry.type;
  }

  return { preview, role };
}

/**
 * Serialize the tree into a flat array of nodes.
 * Uses iterative DFS. Each node stores childIds instead of nested children,
 * keeping the payload flat so postMessage structured clone doesn't fail
 * on deeply nested sessions (~1,500+ depth crashes Chrome's cloner).
 */
function serializeTreeFlat(roots: SessionTreeNode[]): SerializedTreeNode[] {
  const result: SerializedTreeNode[] = [];
  const stack: SessionTreeNode[] = [];

  // Push roots in reverse so they appear in order
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push(roots[i]);
  }

  while (stack.length > 0) {
    const node = stack.pop()!;
    const { preview, role } = getEntryPreview(node.entry);
    result.push({
      id: node.entry.id,
      parentId: node.entry.parentId,
      type: node.entry.type,
      label: node.label,
      preview,
      role,
      childIds: node.children.map(c => c.entry.id),
    });
    // Push children in reverse so they're processed in order
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }

  return result;
}

/**
 * Navigate to a different point in the tree.
 */
export async function navigateTree(
  targetId: string,
  options: {
    summarize?: boolean;
    customInstructions?: string;
  } = {}
): Promise<{ cancelled: boolean }> {
  if (!session) return { cancelled: true };
  const result = await session.navigateTree(targetId, {
    summarize: options.summarize,
    customInstructions: options.customInstructions,
  });
  return { cancelled: result.cancelled };
}

/**
 * Set or clear a label on an entry.
 */
export function setLabel(entryId: string, label: string | undefined): void {
  if (!session) return;
  session.sessionManager.appendLabelChange(entryId, label ?? '');
}
