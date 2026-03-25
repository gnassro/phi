import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import * as AgentManager from './agent-manager';
import * as PanelManager from './panel-manager';
import * as EditorContext from './editor-context';

/**
 * IpcBridge
 *
 * The nervous system of Phi. Routes ALL messages between:
 *   - The webview (user actions: prompt, abort, etc.)
 *   - The extension host (Pi events, sync state, editor context)
 *
 * Initialization: call initialize() once from extension.ts after
 * both AgentManager and PanelManager are ready.
 *
 * Architecture:
 *   Webview → onDidReceiveMessage → IpcBridge.handleWebviewMessage()
 *   Pi SDK  → AgentManager.subscribe() → IpcBridge.forwardPiEvent()
 *   VS Code → EditorContext.watch() → IpcBridge.pushEditorContext()
 */

type WebviewMessage =
  | { type: 'prompt'; text: string; images?: AgentManager.ImagePayload[] }
  | { type: 'abort' }
  | { type: 'request_sync' }
  | { type: 'get_sessions' }
  | { type: 'switch_session'; sessionPath: string }
  | { type: 'new_session' };

/**
 * Initialize IpcBridge.
 *
 * Registers the webview message handler on PanelManager and
 * sets up editor context watching.
 */
export function initialize(): void {
  // Handle messages from the webview
  PanelManager.onMessage((raw) => {
    handleWebviewMessage(raw as WebviewMessage);
  });

  // Push editor context changes to webview (debounced 300ms)
  EditorContext.watchSelection(() => {
    pushEditorContext();
  });

  EditorContext.watchDiagnostics(() => {
    pushEditorContext();
  });
}

/**
 * Route an incoming webview message to the correct handler.
 */
async function handleWebviewMessage(message: WebviewMessage): Promise<void> {
  switch (message.type) {
    case 'prompt':
      await AgentManager.prompt(message.text, message.images);
      break;

    case 'abort':
      await AgentManager.abort();
      break;

    case 'request_sync':
      sendSync();
      // Also push current editor context on full sync
      pushEditorContext();
      break;

    case 'get_sessions': {
      const sessions = await AgentManager.getSessions();
      PanelManager.send({ type: 'sessions_list', sessions });
      break;
    }

    case 'switch_session':
      await AgentManager.switchSession(message.sessionPath);
      // After a session switch, send a full sync so the webview rebuilds history
      sendSync();
      break;

    case 'new_session':
      await AgentManager.newSession();
      sendSync();
      break;

    default:
      console.warn('[Phi] IpcBridge received unknown message type:', (message as { type: string }).type);
  }
}

/**
 * Forward a raw Pi SDK AgentSessionEvent to the webview.
 * Called by the subscriber registered in extension.ts.
 */
export function forwardPiEvent(event: AgentSessionEvent): void {
  PanelManager.send({ type: 'pi_event', event });
}

/**
 * Build and send a full state snapshot to the webview.
 * Called on:
 *   - Webview load / reload (request_sync)
 *   - Session switch
 *   - New session creation
 */
export function sendSync(): void {
  const messages = AgentManager.getMessages();

  // Convert AgentMessage[] to the entry format the webview expects
  const entries = messages.map((msg) => ({
    type: 'message' as const,
    message: msg,
  }));

  PanelManager.send({
    type: 'sync',
    state: {
      entries,
      isStreaming: AgentManager.isStreaming(),
      cwd: AgentManager.getCwd(),
      sessionFile: AgentManager.getSessionFile(),
      model: AgentManager.getModel(),
    },
  });
}

/**
 * Read current editor context and push it to the webview.
 * Called on:
 *   - Full sync (request_sync)
 *   - Selection change (debounced)
 *   - Diagnostics change (debounced)
 */
export function pushEditorContext(): void {
  const context = EditorContext.getContext();
  PanelManager.send({ type: 'editor_context', context });
}
