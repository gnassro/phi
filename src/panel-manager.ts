import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce } from './utils';

/**
 * PanelManager
 *
 * Manages the single Phi WebviewPanel.
 *
 * Rules:
 * - Only ONE panel may exist at a time.
 * - If openPanel() is called while a panel exists, reveal it — never create a second.
 * - All assets (JS, CSS) are loaded from extensionUri (local files, no CDN).
 * - The webview HTML must include a CSP nonce on all <script> tags.
 */

let currentPanel: vscode.WebviewPanel | null = null;
let extensionCtx: vscode.ExtensionContext | null = null;

// Listeners registered for when the panel sends a message to the extension host
type MessageHandler = (message: Record<string, unknown>) => void;
const messageHandlers: MessageHandler[] = [];

/**
 * Initialize PanelManager. Must be called once from extension.ts activate().
 */
export function initialize(ctx: vscode.ExtensionContext): void {
  extensionCtx = ctx;
}

/**
 * Open the Phi chat panel, or reveal it if already open.
 * Returns the panel (useful for IpcBridge to send messages).
 */
export function openPanel(): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    return currentPanel;
  }

  if (!extensionCtx) {
    throw new Error('[Phi] PanelManager not initialized. Call initialize() first.');
  }

  const panel = vscode.window.createWebviewPanel(
    'phiChat',                       // Internal ID
    'Phi',                           // Tab title
    vscode.ViewColumn.Beside,        // Opens next to the active editor
    {
      enableScripts: true,           // Required for the webview JS to run
      retainContextWhenHidden: true, // Keep JS state when panel is hidden (e.g. switched tabs)
      localResourceRoots: [
        // Only allow loading files from dist/public/
        vscode.Uri.joinPath(extensionCtx.extensionUri, 'dist', 'public'),
      ],
    }
  );

  currentPanel = panel;

  // Load the webview HTML
  panel.webview.html = buildWebviewHtml(panel.webview, extensionCtx.extensionUri);

  // Route inbound messages to registered handlers
  panel.webview.onDidReceiveMessage(
    (message: Record<string, unknown>) => {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
    undefined,
    extensionCtx.subscriptions
  );

  // Clean up when the user closes the panel
  panel.onDidDispose(
    () => {
      currentPanel = null;
    },
    undefined,
    extensionCtx.subscriptions
  );

  return panel;
}

/**
 * Get the current panel, or null if it's not open.
 */
export function getPanel(): vscode.WebviewPanel | null {
  return currentPanel;
}

/**
 * Send a message from the extension host to the webview.
 * Silently does nothing if the panel is not open.
 */
export function send(message: Record<string, unknown>): void {
  currentPanel?.webview.postMessage(message);
}

/**
 * Register a handler for messages coming FROM the webview TO the extension host.
 * Used by IpcBridge to receive user actions (prompt, abort, etc.).
 */
export function onMessage(handler: MessageHandler): void {
  messageHandlers.push(handler);
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();

  // Convert local file URIs to webview-safe URIs
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'public', 'app.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'public', 'style.css')
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en" data-theme="night">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!--
    Content Security Policy:
    - default-src 'none'          → block everything by default
    - script-src 'nonce-...'      → only scripts with the correct nonce
    - style-src ... 'unsafe-inline' → allow our stylesheet + VS Code injected styles
    - img-src ... data:            → allow local images + base64 data URIs (for attached images)
    - font-src ...                 → allow local fonts if any
  -->
  <meta http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      script-src 'nonce-${nonce}';
      style-src ${webview.cspSource} 'unsafe-inline';
      img-src ${webview.cspSource} data: blob:;
      font-src ${webview.cspSource};
    ">

  <link rel="stylesheet" href="${styleUri}">
  <title>Phi</title>
</head>
<body>
  <div class="app-layout">

    <!-- ── Messages area ── -->
    <div class="messages-wrapper">
      <div class="messages" id="messages">
        <!-- Typing indicator lives inside the messages container -->
        <div class="typing-indicator hidden" id="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-text" id="typing-text">Thinking</span>
        </div>
      </div>
    </div>

    <!-- ── Input area ── -->
    <div class="input-area">
      <!-- Image previews (shown above input when images are attached) -->
      <div class="image-previews hidden" id="image-previews"></div>

      <!-- Queued messages (shown when agent is busy and user queues a message) -->
      <div class="queued-messages hidden" id="queued-messages"></div>

      <form id="chat-form">
        <div class="input-left-actions">
          <!-- Attach image button -->
          <button type="button" class="input-icon-btn" id="attach-btn"
            title="Attach image" aria-label="Attach image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
          </button>
          <input type="file" id="image-input" accept="image/*" multiple style="display:none">
        </div>

        <div class="input-bubble">
          <div id="message-input" contenteditable="true"
            aria-placeholder="Message Pi… (Enter to send, Shift+Enter for newline)">
          </div>
          <!-- Mic button (voice input — placeholder for future feature) -->
          <button type="button" class="input-mic-btn hidden" id="mic-btn"
            title="Voice input" aria-label="Voice input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </button>
        </div>

        <div class="input-actions">
          <button type="submit" id="send-btn" title="Send message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
          <button type="button" id="abort-btn" class="hidden"
            title="Abort (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        </div>
      </form>
    </div>

  </div>

  <!-- Main app script — must carry the nonce -->
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
