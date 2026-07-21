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
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
  type SessionEntry,
  type SessionInfo,
  type SessionStats,
} from '@earendil-works/pi-coding-agent';
import type {
  Credential,
  CredentialStore,
  AuthInteraction,
  AuthPrompt,
  AuthEvent,
  Provider,
  Model,
  Api,
} from '@earendil-works/pi-ai';
import { FileCredentialStore, type StoredCredential, LegacyLoginAdapter } from './credential-store.js';
import { legacyGoogleProvidersExtension } from './legacy-google/index.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

/**
 * AgentManager
 *
 * The ONLY module in Phi that imports from @earendil-works/pi-coding-agent.
 * All other files must go through this module's exported functions.
 *
 * Owns the Pi AgentSessionRuntime lifecycle:
 *   initialize() → prompt/steer/abort → dispose()
 *
 * Auth separation:
 *   - Phi uses its own auth file: ~/.phi/auth.json
 *   - Sessions are shared with the pi CLI: ~/.pi/agent/sessions/
 *
 * Rule: session.prompt() throws if called during streaming without
 * streamingBehavior. Always check isStreaming() first or use steer()/followUp().
 *
 * Migrated to @earendil-works/pi-coding-agent 0.80.10 (package renamed, AuthStorage removed,
 * ModelRuntime is now the canonical auth/model facade).
 */

// ─── Auth paths ──────────────────────────────────────────────────────────────

const PHI_CONFIG_DIR = path.join(os.homedir(), '.phi');
const PHI_AUTH_FILE = path.join(PHI_CONFIG_DIR, 'auth.json');

// ─── Internal state ──────────────────────────────────────────────────────────

let runtime: AgentSessionRuntime | null = null;
let session: AgentSession | null = null;
let sessionUnsubscribe: (() => void) | null = null;
let credentialStore: FileCredentialStore | null = null;
let modelRuntime: ModelRuntime | null = null;
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

// ─── Auth adapter: wraps FileCredentialStore as pi-ai CredentialStore ────────

class PhiCredentialStore implements CredentialStore {
  private store: FileCredentialStore;

  constructor(store: FileCredentialStore) {
    this.store = store;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.store.getSync(providerId) as Credential | undefined;
  }

  async list(): Promise<readonly import('@earendil-works/pi-ai').CredentialInfo[]> {
    const infos = await this.store.list();
    return infos as import('@earendil-works/pi-ai').CredentialInfo[];
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    return this.store.modify(
      providerId,
      async (current) => fn(current as Credential | undefined) as Promise<StoredCredential | undefined>
    ) as unknown as Credential | undefined;
  }

  async delete(providerId: string): Promise<void> {
    await this.store.delete(providerId);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Boot the Pi session runtime for the given workspace directory.
 * Called once from extension.ts activate().
 *
 * Migrated 0.80.10: AuthStorage is no longer exported. We use
 * ModelRuntime + FileCredentialStore instead.
 */
export async function initialize(workspaceCwd: string): Promise<void> {
  cwd = workspaceCwd;

  const agentDir = getAgentDir();
  credentialStore = new FileCredentialStore(PHI_AUTH_FILE);

  // Create ModelRuntime with our credential store (replaces old AuthStorage).
  const phiCredStore = new PhiCredentialStore(credentialStore);
  modelRuntime = await ModelRuntime.create({
    credentials: phiCredStore,
    authPath: PHI_AUTH_FILE,
  });

  // ModelRegistry is a sync compatibility facade wrapping ModelRuntime.
  modelRegistry = new ModelRegistry(modelRuntime);

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const disabledIds = vscode.workspace.getConfiguration('phi').get<string[]>('disabledExtensions') || [];
    const disabledSet = new Set(disabledIds.filter((id) => !id.startsWith('<inline:')));

    const activeFactories = [];
    if (!disabledSet.has('phi.legacy-google-providers')) {
      activeFactories.push(legacyGoogleProvidersExtension);
    }

    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir,
      modelRuntime: modelRuntime ?? undefined,
      resourceLoaderOptions: {
        extensionFactories: activeFactories,
        extensionsOverride: (base) => {
          const userExtensions = base.extensions.filter((ext) => !ext.path.startsWith('<inline:'));

          loadedExtensions = [
            {
              id: 'phi.legacy-google-providers',
              name: 'Google Cloud Code Assist & Antigravity (Legacy)',
              enabled: !disabledSet.has('phi.legacy-google-providers'),
              isBuiltIn: true,
            },
            ...userExtensions.map((ext) => ({
              id: ext.path,
              name: path.basename(ext.path),
              enabled: !disabledSet.has(ext.path),
              isBuiltIn: false,
            })),
          ];

          return {
            ...base,
            extensions: base.extensions.filter((ext) => !disabledSet.has(ext.path)),
          };
        },
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
  await reconcileModelAfterAuthChange();
  logRuntimeDiagnostics('Session startup', runtime.diagnostics);
  logModelFallbackMessage('Session startup', runtime.modelFallbackMessage);
}

export function setCwd(newCwd: string): void {
  cwd = newCwd;
}

export async function dispose(): Promise<void> {
  sessionUnsubscribe?.();
  sessionUnsubscribe = null;

  const currentRuntime = runtime;
  runtime = null;
  session = null;
  credentialStore = null;
  modelRuntime = null;
  modelRegistry = null;
  listeners.length = 0;

  await currentRuntime?.dispose();
}

// ─── Event subscription ───────────────────────────────────────────────────────

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
  data: string;
  mimeType: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

let loadedExtensions: ExtensionInfo[] = [];

export async function prompt(
  text: string,
  images?: ImagePayload[]
): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');

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

export async function followUp(text: string): Promise<void> {
  if (!session) throw new Error('[Phi] AgentManager not initialized');
  await session.followUp(text);
}

export async function abort(): Promise<void> {
  if (!session) return;
  await session.abort();
}

// ─── Session management ───────────────────────────────────────────────────────

export async function getSessions(): Promise<SessionInfo[]> {
  return await SessionManager.list(cwd);
}

export async function switchSession(sessionPath: string): Promise<void> {
  if (!runtime) throw new Error('[Phi] AgentManager not initialized');
  await runtime.switchSession(sessionPath);
  bindSession(runtime.session);
  await reconcileModelAfterAuthChange();
  logRuntimeDiagnostics('Session switch', runtime.diagnostics);
  logModelFallbackMessage('Session switch', runtime.modelFallbackMessage);
}

export async function newSession(): Promise<void> {
  if (!runtime) throw new Error('[Phi] AgentManager not initialized');
  await runtime.newSession();
  bindSession(runtime.session);
  await reconcileModelAfterAuthChange();
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

export function getHistoryEntries(): SessionEntry[] {
  return session?.sessionManager.getBranch() ?? [];
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

function serializeModelInfo(model: { id: string; provider: string; contextWindow: number } | null) {
  return model
    ? { id: model.id, provider: model.provider, contextWindow: model.contextWindow }
    : null;
}

function resolveCurrentAvailableModel() {
  if (!session) return null;
  const currentModel = session.model;
  if (!currentModel) return null;
  const available = session.modelRuntime.getAvailableSnapshot();
  return available.find(
    (m: Model<Api>) => m.id === currentModel.id && m.provider === currentModel.provider
  ) ?? null;
}

// ─── Model & thinking ─────────────────────────────────────────────────────────

export function getState() {
  if (!session) return null;
  const model = resolveCurrentAvailableModel();
  return {
    model: serializeModelInfo(model),
    thinkingLevel: session.thinkingLevel,
    autoCompactionEnabled: session.autoCompactionEnabled,
    sessionName: session.sessionName ?? null,
  };
}

export function getAvailableModels() {
  if (!session) return [];
  return session.modelRuntime.getAvailableSnapshot().map((m: Model<Api>) => ({
    id: m.id,
    provider: m.provider,
    contextWindow: m.contextWindow,
  }));
}

export async function setModel(provider: string, modelId: string): Promise<boolean> {
  if (!session) return false;
  const models = session.modelRuntime.getAvailableSnapshot();
  const target = models.find((m: Model<Api>) => m.id === modelId && m.provider === provider);
  if (!target) return false;
  await session.setModel(target);
  return true;
}

export function cycleThinkingLevel(): string | undefined {
  if (!session) return undefined;
  return session.cycleThinkingLevel();
}

export function getSessionStats(): SessionStats | null {
  if (!session) return null;
  const stats = session.getSessionStats();

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

export function getContextUsage() {
  if (!session) return null;
  return session.getContextUsage() ?? null;
}

export async function compact(): Promise<any> {
  if (!session) return;
  return await session.compact();
}

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

function getCurrentModelRuntime(): ModelRuntime | null {
  return modelRuntime ?? session?.modelRuntime ?? null;
}

/**
 * Refresh model registry auth state.
 * Migrated 0.80.8+: refresh() is now async (was sync void).
 */
async function refreshModelRegistryAuthState(): Promise<void> {
  const mr = getCurrentModelRuntime();
  if (mr) {
    await mr.refresh();
  }
}

export interface AuthModelReconciliationResult {
  selectedModel: { id: string; provider: string; contextWindow: number } | null;
  switchedModel: boolean;
  clearedModel: boolean;
}

/**
 * After auth changes, ensure the active model still points to an available model.
 */
export async function reconcileModelAfterAuthChange(): Promise<AuthModelReconciliationResult> {
  if (!session) {
    return { selectedModel: null, switchedModel: false, clearedModel: false };
  }

  await refreshModelRegistryAuthState();

  const availableModels = [...session.modelRuntime.getAvailableSnapshot()] as Array<{ id: string; provider: string; contextWindow: number }>;
  const currentModel = session.model;
  const matchingModel = currentModel
    ? availableModels.find(
      (model) => model.id === currentModel.id && model.provider === currentModel.provider
    ) ?? null
    : null;

  if (matchingModel) {
    if (currentModel !== matchingModel) {
      (session.state as any).model = matchingModel;
    }
    return {
      selectedModel: serializeModelInfo(matchingModel),
      switchedModel: false,
      clearedModel: false,
    };
  }

  const fallbackModel = availableModels[0] ?? null;
  if (fallbackModel) {
    await session.setModel(fallbackModel as Model<Api>);
    return {
      selectedModel: serializeModelInfo(fallbackModel),
      switchedModel: true,
      clearedModel: false,
    };
  }

  if (currentModel) {
    (session.state as any).model = undefined;
  }

  return {
    selectedModel: null,
    switchedModel: false,
    clearedModel: !!currentModel,
  };
}

function getStoredCredentialType(providerId: string): ProviderCredentialType | null {
  const credential = credentialStore?.getSync(providerId);
  if (credential?.type === 'oauth') return 'oauth';
  if (credential?.type === 'api_key') return 'api_key';
  return null;
}

function getProviderAuthStatus(providerId: string): ProviderAuthStatusInfo {
  const status = getCurrentModelRuntime()?.getProviderAuthStatus(providerId) ?? { configured: false };
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
 * Migrated: uses ModelRuntime.getProviders() instead of AuthStorage.getOAuthProviders().
 */
export function getOAuthProviders(): OAuthProviderInfo[] {
  const mr = getCurrentModelRuntime();
  if (!mr) return [];
  const providers = mr.getProviders();
  return providers
    .filter((p: Provider) => p.auth?.oauth)
    .map((p: Provider) => ({
      id: p.id,
      name: p.name,
      loggedIn: getStoredCredentialType(p.id) === 'oauth',
      authStatus: getProviderAuthStatus(p.id),
    }));
}

/**
 * Get login-capable providers, mirroring Pi's interactive /login discovery.
 */
export function getLoginProviders(
  authType?: ProviderCredentialType
): LoginProviderInfo[] {
  const mr = getCurrentModelRuntime();
  if (!mr || !session) return [];

  const allProviders = mr.getProviders();
  const oauthProviders = allProviders.filter((p: Provider) => p.auth?.oauth);
  const oauthProviderIds = new Set(oauthProviders.map((p: Provider) => p.id));

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
    const modelProviders = new Set(session.modelRuntime.getModels().map((m: Model<Api>) => m.provider));
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
  const mr = getCurrentModelRuntime();
  const nameById = new Map(
    (mr?.getProviders() ?? []).map((p: Provider) => [p.id, p.name])
  );

  const providers: StoredCredentialProviderInfo[] = [];
  for (const providerId of credentialStore?.listIds() ?? []) {
    const credential = credentialStore?.getSync(providerId);
    if (!credential) continue;
    const credentialType = credential.type === 'oauth' ? 'oauth' : 'api_key';
    if (authType && credentialType !== authType) continue;

    providers.push({
      id: providerId,
      name: credentialType === 'oauth'
        ? (nameById.get(providerId) ?? providerId)
        : getApiKeyProviderDisplayName(providerId),
      authType: credentialType,
    });
  }

  return providers.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Login to an OAuth provider.
 * Migrated 0.80.8+: Uses ModelRuntime.login() with AuthInteraction.
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
  if (!modelRuntime) throw new Error('[Phi] AgentManager not initialized');

  const adapter = new LegacyLoginAdapter(callbacks);
  const interaction = adapter.toAuthInteraction();

  const credential = await modelRuntime.login(providerId, 'oauth', interaction);

  // Persist credential to our file-based store
  await credentialStore!.modify(providerId, async () => credential as unknown as StoredCredential);
  await refreshModelRegistryAuthState();
}

/**
 * Logout from a provider (clears stored OAuth credentials).
 */
export async function logout(providerId: string): Promise<void> {
  if (!credentialStore) return;
  await credentialStore.delete(providerId);
  try {
    await modelRuntime?.logout(providerId);
  } catch {
    // ModelRuntime logout may fail if provider isn't registered — ignore
  }
  await refreshModelRegistryAuthState();
}

/**
 * Check if a provider has credentials (API key or OAuth).
 */
export function hasAuth(providerId: string): boolean {
  if (!credentialStore) return false;
  return credentialStore.has(providerId);
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
export async function setApiKey(providerId: string, key: string): Promise<void> {
  if (!credentialStore) throw new Error('[Phi] AgentManager not initialized');
  await credentialStore.modify(providerId, async () => ({
    type: 'api_key' as const,
    key,
  } as unknown as StoredCredential));
  await refreshModelRegistryAuthState();
}

/**
 * Remove an API key for a provider.
 */
export async function removeApiKey(providerId: string): Promise<void> {
  if (!credentialStore) return;
  await credentialStore.delete(providerId);
  await refreshModelRegistryAuthState();
}

/**
 * Get all loaded extensions
 */
export function getExtensionsList(): ExtensionInfo[] {
  return loadedExtensions;
}

/**
 * Toggle an extension's enabled state and restart the runtime to apply changes.
 */
export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('phi');
  let disabledIds = [...(config.get<string[]>('disabledExtensions') || [])]
    .filter((x) => !x.startsWith('<inline:'));

  if (enabled) {
    disabledIds = disabledIds.filter((x) => x !== id);
  } else if (!disabledIds.includes(id)) {
    disabledIds.push(id);
  }

  await config.update('disabledExtensions', disabledIds, vscode.ConfigurationTarget.Global);

  await dispose();
  await initialize(cwd);
}

// ─── Tree / branching ─────────────────────────────────────────────────────────

interface SessionTreeNode {
  entry: any;
  children: SessionTreeNode[];
  label?: string;
}

export interface SerializedTreeNode {
  id: string;
  parentId: string | null;
  type: string;
  label?: string;
  preview: string;
  role?: string;
  childIds: string[];
}

export function getSkills() {
  if (!session) return [];
  return session.resourceLoader.getSkills().skills;
}

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
        const textParts: string[] = [];
        const toolNames: string[] = [];
        for (const block of msg.content as any[]) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_use' && block.name) {
            const argPreview = block.input?.path || block.input?.command?.substring(0, 50) || '';
            toolNames.push(argPreview ? `${block.name}(${argPreview})` : block.name);
          } else if (block.type === 'tool_result') {
            // Skip
          }
        }
        if (textParts.length > 0) {
          preview = textParts.join(' ').substring(0, 120);
        } else if (toolNames.length > 0) {
          preview = toolNames.join(', ').substring(0, 120);
        }
      }
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

function serializeTreeFlat(roots: SessionTreeNode[]): SerializedTreeNode[] {
  const result: SerializedTreeNode[] = [];
  const stack: SessionTreeNode[] = [];

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
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }

  return result;
}

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
