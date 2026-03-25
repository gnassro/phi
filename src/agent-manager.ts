import {
  createAgentSession,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type SessionInfo,
} from '@mariozechner/pi-coding-agent';

/**
 * AgentManager
 *
 * The ONLY module in Phi that imports from @mariozechner/pi-coding-agent.
 * All other files must go through this module's exported functions.
 *
 * Owns the Pi AgentSession lifecycle:
 *   initialize() → prompt/steer/abort → dispose()
 *
 * Rule: session.prompt() throws if called during streaming without
 * streamingBehavior. Always check isStreaming() first or use steer()/followUp().
 */

// ─── Internal state ──────────────────────────────────────────────────────────

let session: AgentSession | null = null;
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

  const { session: s } = await createAgentSession({
    sessionManager: SessionManager.continueRecent(cwd),
    cwd,
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
    source: {
      type: 'base64' as const,
      mediaType: img.mimeType as
        | 'image/png'
        | 'image/jpeg'
        | 'image/gif'
        | 'image/webp',
      // Strip "data:mime;base64," prefix if present
      data: img.data.replace(/^data:[^;]+;base64,/, ''),
    },
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
