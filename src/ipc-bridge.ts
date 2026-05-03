import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import * as vscode from 'vscode';
import * as AgentManager from './agent-manager.js';
import * as PanelManager from './panel-manager.js';
import * as EditorContext from './editor-context.js';

/**
 * IpcBridge
 *
 * The nervous system of Phi. Routes ALL messages between:
 *   - The webview (user actions: prompt, abort, model switch, etc.)
 *   - The extension host (Pi events, sync state, editor context)
 *
 * Initialization: call initialize() once from extension.ts after
 * both AgentManager and PanelManager are ready.
 */

type WebviewMessage =
  // Chat
  | { type: 'prompt'; message: string; images?: AgentManager.ImagePayload[] }
  | { type: 'abort' }
  | { type: 'request_sync' }
  // Sessions
  | { type: 'get_sessions' }
  | { type: 'switch_session'; sessionPath: string }
  | { type: 'new_session' }
  // Model & Thinking
  | { type: 'get_state' }
  | { type: 'get_available_models' }
  | { type: 'set_model'; provider: string; modelId: string }
  | { type: 'cycle_thinking_level' }
  // Agent controls
  | { type: 'compact' }
  | { type: 'set_auto_compaction'; enabled: boolean }
  | { type: 'get_session_stats' }
  // Auth
  | { type: 'login' }
  | { type: 'logout'; providerId?: string; providerName?: string }
  | { type: 'get_accounts' }
  | { type: 'add_api_key' }
  | { type: 'remove_api_key'; providerId?: string; providerName?: string }

  // Tree
  | { type: 'get_tree' }
  | { type: 'navigate_tree'; targetId: string; summarize: boolean; customInstructions?: string }
  | { type: 'set_label'; entryId: string; label: string }
  // Skills
  | { type: 'get_skills' }
  // Misc
  | { type: 'open_url'; url: string }
  | { type: 'open_file_picker' };

let initialized = false;

/**
 * Initialize IpcBridge. Safe to call multiple times — only the first call has effect.
 */
export function initialize(): void {
  if (initialized) return;
  initialized = true;

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
    // ── Chat ──
    case 'prompt':
      await AgentManager.prompt(message.message, message.images);
      break;

    case 'abort':
      await AgentManager.abort();
      break;

    case 'request_sync':
      sendSync();
      pushEditorContext();
      break;

    // ── Sessions ──
    case 'get_sessions': {
      const sessions = await AgentManager.getSessions();
      PanelManager.send({ type: 'sessions_list', sessions });
      break;
    }

    case 'switch_session':
      await AgentManager.switchSession(message.sessionPath);
      sendSync();
      break;

    case 'new_session':
      await AgentManager.newSession();
      sendSync();
      break;

    // ── Model & Thinking ──
    case 'get_state': {
      const state = AgentManager.getState();
      sendRpcResponse('get_state', true, state);
      break;
    }

    case 'get_available_models': {
      const models = AgentManager.getAvailableModels();
      sendRpcResponse('get_available_models', true, { models });
      break;
    }

    case 'set_model': {
      const success = await AgentManager.setModel(message.provider, message.modelId);
      if (success) {
        sendRpcResponse('set_model', true);
      } else {
        sendRpcResponse('set_model', false, undefined, 'Model not found');
      }
      break;
    }

    case 'cycle_thinking_level': {
      const level = AgentManager.cycleThinkingLevel();
      sendRpcResponse('cycle_thinking_level', true, { level });
      break;
    }

    // ── Agent controls ──
    case 'compact':
      try {
        // Notify webview that compaction has started
        PanelManager.send({ type: 'pi_event', event: { type: 'auto_compaction_start' } });
        const result = await AgentManager.compact();
        // Notify webview with the result
        PanelManager.send({ type: 'pi_event', event: { type: 'auto_compaction_end', result } });
        sendRpcResponse('compact', true);
      } catch (err) {
        // Clear the spinner on error
        PanelManager.send({ type: 'pi_event', event: { type: 'auto_compaction_end', result: undefined } });
        sendRpcResponse('compact', false, undefined, (err as Error).message);
      }
      break;

    case 'set_auto_compaction':
      AgentManager.setAutoCompaction(message.enabled);
      sendRpcResponse('set_auto_compaction', true);
      break;

    case 'get_session_stats': {
      const stats = AgentManager.getSessionStats();
      const contextUsage = AgentManager.getContextUsage();
      sendRpcResponse('get_session_stats', true, { ...stats, contextUsage });
      break;
    }

    // ── Auth ──
    case 'login':
      vscode.commands.executeCommand('phi.login');
      break;

    case 'logout':
      vscode.commands.executeCommand('phi.logout', message.providerId, message.providerName);
      break;

    case 'get_accounts': {
      const providers = AgentManager.getOAuthProviders();
      const apiKeyProviders = AgentManager.getApiKeyProviders();
      PanelManager.send({ type: 'accounts_list', providers, apiKeyProviders });
      break;
    }

    case 'add_api_key':
      vscode.commands.executeCommand('phi.addApiKey');
      break;

    case 'remove_api_key':
      vscode.commands.executeCommand('phi.removeApiKey', message.providerId, message.providerName);
      break;

    // ── Skills ──
    case 'get_skills': {
      const skills = AgentManager.getSkills();
      PanelManager.send({ type: 'skills_data', skills });
      break;
    }

    // ── Misc ──
    case 'open_url': {
      const urlMsg = message as { url: string };
      if (urlMsg.url) {
        vscode.env.openExternal(vscode.Uri.parse(urlMsg.url));
      }
      break;
    }

    case 'open_file_picker': {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        title: 'Attach files to chat',
      });
      if (uris && uris.length > 0) {
        for (const uri of uris) {
          const ext = uri.fsPath.split('.').pop()?.toLowerCase() || '';
          const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
          if (isImage) {
            // Read image and send base64 to webview
            try {
              const data = await vscode.workspace.fs.readFile(uri);
              let mimeType = 'image/png';
              if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
              else if (ext === 'gif') mimeType = 'image/gif';
              else if (ext === 'webp') mimeType = 'image/webp';
              PanelManager.send({
                type: 'add_image_attachment',
                data: Buffer.from(data).toString('base64'),
                mimeType,
              });
            } catch (err) {
              vscode.window.showWarningMessage(`[Phi] Could not read image: ${uri.fsPath}`);
            }
          } else {
            // Non-image file: add as context reference
            const contextBlock = EditorContext.buildFileContext(uri);
            if (contextBlock) {
              PanelManager.send({ type: 'add_context', context: contextBlock });
            }
          }
        }
      }
      break;
    }

    // ── Tree ──
    case 'get_tree': {
      try {
        const t0 = Date.now();
        const treeData = AgentManager.getTree();
        const t1 = Date.now();
        const nodeCount = treeData.nodes.length;
        console.log(`[Phi] get_tree: ${nodeCount} nodes, serialized in ${t1 - t0}ms`);
        const delivered = await PanelManager.send({ type: 'tree_data', ...treeData });
        console.log(`[Phi] get_tree: postMessage ${delivered ? 'delivered' : 'FAILED'} in ${Date.now() - t1}ms`);
      } catch (err) {
        console.error('[Phi] Failed to get tree:', err);
        PanelManager.send({ type: 'tree_data', nodes: [], leafId: null, error: (err as Error).message });
      }
      break;
    }

    case 'navigate_tree': {
      const navMsg = message as { targetId: string; summarize: boolean; customInstructions?: string };
      try {
        const result = await AgentManager.navigateTree(navMsg.targetId, {
          summarize: navMsg.summarize,
          customInstructions: navMsg.customInstructions,
        });
        PanelManager.send({ type: 'navigate_result', success: !result.cancelled, cancelled: result.cancelled });
        if (!result.cancelled) {
          // Sync chat after navigation
          sendSync();
        }
      } catch (err) {
        PanelManager.send({ type: 'navigate_result', success: false, error: (err as Error).message });
      }
      break;
    }

    case 'set_label': {
      const labelMsg = message as { entryId: string; label: string };
      AgentManager.setLabel(labelMsg.entryId, labelMsg.label || undefined);
      // Refresh tree after label change
      const updated = AgentManager.getTree();
      PanelManager.send({ type: 'tree_data', ...updated });
      break;
    }

    default:
      console.warn('[Phi] IpcBridge received unknown message type:', (message as { type: string }).type);
  }
}

/**
 * Forward a raw Pi SDK AgentSessionEvent to the webview.
 */
export function forwardPiEvent(event: AgentSessionEvent): void {
  PanelManager.send({ type: 'pi_event', event });
}

/**
 * Build and send a full state snapshot to the webview.
 */
export function sendSync(): void {
  const messages = AgentManager.getMessages();
  const entries = messages.map((msg) => ({
    type: 'message' as const,
    message: msg,
  }));

  const state = AgentManager.getState();
  const sessionStats = AgentManager.getSessionStats();
  const skills = AgentManager.getSkills();

  PanelManager.send({
    type: 'sync',
    state: {
      entries,
      isStreaming: AgentManager.isStreaming(),
      cwd: AgentManager.getCwd(),
      sessionFile: AgentManager.getSessionFile(),
      model: state?.model ?? null,
      thinkingLevel: state?.thinkingLevel ?? 'off',
      sessionStats: sessionStats ?? null,
      skills,
    },
  });
}

/**
 * Send an RPC-style response to the webview.
 */
function sendRpcResponse(command: string, success: boolean, data?: unknown, error?: string): void {
  PanelManager.send({ type: 'rpc_response', command, success, data, error });
}

/**
 * Read current editor context and push it to the webview.
 */
export function pushEditorContext(): void {
  const context = EditorContext.getContext();
  PanelManager.send({ type: 'editor_context', context });
}
