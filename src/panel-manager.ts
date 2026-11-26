import * as vscode from 'vscode';
import { getNonce } from './utils.js';
import { icons } from '../public/icons.js';

/**
 * PanelManager
 *
 * Manages the Phi chat as a WebviewViewProvider (sidebar view).
 * This ensures Phi lives in the sidebar — files never open inside it.
 *
 * Rules:
 * - Registered as a WebviewViewProvider for the "phi.chatView" view.
 * - All assets (JS, CSS) are loaded from extensionUri (local files, no CDN).
 * - The webview HTML must include a CSP nonce on all <script> tags.
 */

let extensionCtx: vscode.ExtensionContext | null = null;
let currentView: vscode.WebviewView | null = null;

// Listeners registered for when the view sends a message to the extension host
type MessageHandler = (message: Record<string, unknown>) => void;
const messageHandlers: MessageHandler[] = [];

/**
 * The WebviewViewProvider that VS Code calls when the view container is shown.
 */
class PhiChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'phi.chatView';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _extensionMode: vscode.ExtensionMode
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    currentView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'public'),
      ],
    };

    webviewView.webview.html = buildWebviewHtml(
      webviewView.webview,
      this._extensionUri,
      this._extensionMode
    );

    // Route inbound messages to registered handlers
    webviewView.webview.onDidReceiveMessage((message: Record<string, unknown>) => {
      for (const handler of messageHandlers) {
        handler(message);
      }
    });

    // Focus the chat input whenever the Phi view becomes visible
    // (tab switch, phi.openChat, sidebar reveal).
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void webviewView.webview.postMessage({ type: 'focus_input' });
      }
    });

    // Clean up reference when view is disposed
    webviewView.onDidDispose(() => {
      currentView = null;
    });
  }
}

/**
 * Initialize PanelManager. Must be called once from extension.ts activate().
 * Registers the WebviewViewProvider for the sidebar.
 */
export function initialize(ctx: vscode.ExtensionContext): void {
  extensionCtx = ctx;

  const provider = new PhiChatViewProvider(ctx.extensionUri, ctx.extensionMode);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PhiChatViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

/**
 * Open / reveal the Phi chat view.
 * Focuses the sidebar view; VS Code will call resolveWebviewView if needed.
 */
export function openPanel(): void {
  // This command focuses the view container, triggering resolveWebviewView
  vscode.commands.executeCommand('phi.chatView.focus');
}

/**
 * Get the current webview view, or null if not resolved.
 */
export function getView(): vscode.WebviewView | null {
  return currentView;
}

/**
 * Send a message from the extension host to the webview.
 * Silently does nothing if the view is not open.
 * Returns a promise that resolves to true if delivered.
 */
export async function send(message: Record<string, unknown>): Promise<boolean> {
  if (!currentView) return false;
  return currentView.webview.postMessage(message);
}

/**
 * Register a handler for messages coming FROM the webview TO the extension host.
 * Used by IpcBridge to receive user actions (prompt, abort, etc.).
 */
export function onMessage(handler: MessageHandler): void {
  messageHandlers.push(handler);
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/** Thinking-level picker markup. Reused by the composer footer and the Settings panel. */
function thinkingPickerHtml(id: string): string {
  return `
        <div class="model-dropdown thinking-dropdown" id="${id}">
          <button type="button" class="model-dropdown-btn has-tooltip has-tooltip-top">
            ${icons.thinkingLevels({ className: 'selector-icon' })}
            <span class="model-dropdown-label">off</span>
            ${icons.chevronDown({ className: 'model-dropdown-chevron' })}
          </button>
          <div class="model-dropdown-menu hidden"></div>
        </div>`;
}

/** Model picker markup. Lives in the input footer, next to the thinking picker. */
function modelPickerHtml(): string {
  return `
        <div class="model-dropdown" id="model-dropdown">
          <button type="button" class="model-dropdown-btn has-tooltip has-tooltip-top" id="model-dropdown-btn">
            ${icons.robot({ className: 'selector-icon' })}
            <span class="model-dropdown-label" id="model-dropdown-label">model</span>
          </button>
          <div class="model-dropdown-menu hidden" id="model-dropdown-menu"></div>
        </div>`;
}

function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  extensionMode: vscode.ExtensionMode
): string {
  const nonce = getNonce();
  const cacheBust = Date.now();
  const webviewMode = extensionMode === vscode.ExtensionMode.Development ? 'development' : 'production';

  // Convert local file URIs to webview-safe URIs
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'public', 'app.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'public', 'style.css')
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      script-src 'nonce-${nonce}';
      style-src ${webview.cspSource} 'unsafe-inline';
      img-src ${webview.cspSource} data: blob:;
      font-src ${webview.cspSource};
    ">
  <link rel="stylesheet" href="${styleUri}?v=${cacheBust}">
  <title>Phi</title>
</head>
<body data-extension-mode="${webviewMode}">
  <div class="app-layout">

    <!-- ── Header ── -->
    <div class="header">
      <div class="header-right">
        <button class="icon-btn has-tooltip" id="new-chat-btn" aria-label="New Chat" data-tooltip="New Chat">
          ${icons.plus()}
        </button>
        <button class="icon-btn has-tooltip" id="history-btn" aria-label="Session History" data-tooltip="History">
          ${icons.history()}
        </button>
        <button class="icon-btn has-tooltip" id="tree-btn" aria-label="Conversation Tree" data-tooltip="Tree">
          ${icons.tree()}
        </button>
        <button class="icon-btn has-tooltip" id="skills-btn" aria-label="Loaded Skills" data-tooltip="Skills">
          ${icons.skills()}
        </button>
        <button class="icon-btn has-tooltip" id="settings-btn" aria-label="Settings" data-tooltip="Settings">
          ${icons.settings()}
        </button>
        <button class="icon-btn has-tooltip" id="accounts-btn" aria-label="Accounts" data-tooltip="Accounts">
          ${icons.accounts()}
        </button>
      </div>
    </div>

    <!-- ── Messages area ── -->
    <div class="messages" id="messages">
      <div class="typing-indicator hidden" id="typing-indicator">
        <span class="typing-text" id="typing-text">Thinking</span>
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>

    <!-- ── Scroll to bottom ── -->
    <button class="scroll-bottom-btn hidden" id="scroll-bottom-btn">
      <span class="scroll-bottom-badge hidden" id="scroll-bottom-badge">New</span>
      ${icons.arrowDown()}
    </button>

    <!-- ── Input area ── -->
    <div class="input-area">
      <div class="queued-messages hidden" id="queued-messages"></div>
      <div class="image-previews hidden" id="image-previews"></div>
      
      <!-- Commands modal: same shell as settings/skills, only the alignment differs -->
      <div class="settings-overlay hidden" id="command-palette-overlay"></div>
      <div class="settings-panel command-palette hidden" id="command-palette">
        <div class="settings-header">
          <h3>Commands</h3>
          <button class="settings-close" id="command-palette-close">
            ${icons.close()}
          </button>
        </div>
        <div class="settings-body">
          <div class="command-list" id="command-list"></div>
        </div>
      </div>

      <form id="chat-form">
        <div class="input-bubble">
          <div id="message-input" contenteditable="true"
            aria-placeholder="What should we build?">
          </div>
        </div>

        <div class="input-toolbar">
          <div class="input-left-actions">
            <button type="button" class="input-icon-btn has-tooltip has-tooltip-top" id="command-btn"
              aria-label="Commands" data-tooltip="Commands" tabindex="-1">
              ${icons.command()}
            </button>
            <button type="button" class="input-icon-btn has-tooltip has-tooltip-top" id="attach-btn"
              aria-label="Attach file" data-tooltip="Attach file" tabindex="-1">
              ${icons.paperclip()}
            </button>
            <input type="file" id="file-input" multiple style="display:none">
          </div>

          <div class="input-right-actions">
            <button type="submit" id="send-btn" class="has-tooltip has-tooltip-top"
              aria-label="Send message" data-tooltip="Send message" tabindex="-1">
              ${icons.send()}
            </button>
            <button type="button" id="abort-btn" class="hidden has-tooltip has-tooltip-top"
              aria-label="Abort (Esc)" data-tooltip="Abort (Esc)" tabindex="-1">
              ${icons.abort()}
            </button>
          </div>
        </div>
      </form>

      <!-- Context usage footer -->
      <div class="input-footer">
        <div class="pill session-cost" id="session-cost" title="Session cost"></div>
        <div class="model-selector-group">
          ${modelPickerHtml()}
          ${thinkingPickerHtml('thinking-dropdown')}
        </div>
        <div class="input-footer-ctx" id="input-footer-ctx">
          <button class="ctx-usage-btn" id="token-usage" aria-label="Context usage"></button>
          <div class="context-viz hidden" id="context-viz">
            <div class="context-viz-title">Context Window</div>
            <div class="context-bar" id="context-bar"></div>
            <div class="context-legend" id="context-legend"></div>
            <div class="context-viz-footer">
              <span id="context-viz-used"></span>
              <span id="context-viz-total"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Settings Overlay ── -->
  <div class="settings-overlay hidden" id="settings-overlay"></div>
  <div class="settings-panel hidden" id="settings-panel">
    <div class="settings-header">
      <h3>Settings</h3>
      <button class="settings-close" id="settings-close">
        ${icons.close()}
      </button>
    </div>
    <div class="settings-body">
      <div class="settings-section">
        <div class="settings-section-title">Agent</div>
        <div class="settings-row">
          <span class="settings-label">Auto-compaction</span>
          <button class="settings-toggle" id="toggle-auto-compact"></button>
        </div>
        <div class="settings-row">
          <span class="settings-label">Thinking level</span>
          ${thinkingPickerHtml('settings-thinking-dropdown')}
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Display</div>
        <div class="settings-row">
          <span class="settings-label">Show thinking</span>
          <button class="settings-toggle on" id="toggle-show-thinking"></button>
        </div>
        <div class="settings-row settings-row-stack">
          <div class="settings-row-text">
            <span class="settings-label">Task alert sounds</span>
            <span class="settings-meta">Experimental — still under development and testing</span>
          </div>
          <button class="settings-toggle" id="toggle-completion-sound"></button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <div class="settings-row" style="cursor: pointer;" id="about-info-btn">
          <span class="settings-label">Extension Info</span>
          <span style="opacity: 0.5; font-size: 12px;">
            ${icons.chevronRight()}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── About Modal ── -->
  <div class="settings-overlay hidden" id="about-overlay"></div>
  <div class="about-modal hidden" id="about-modal">
    <div class="settings-header">
      <h3>About Phi</h3>
      <button class="settings-close" id="about-close">
        ${icons.close()}
      </button>
    </div>
    <div class="about-body">
      <div class="about-name">Phi — AI Coding Agent</div>
      <div class="about-desc">The Pi coding agent, natively inside VS Code.</div>
      <div class="about-table">
        <div class="about-row"><span class="about-key">Version</span><span class="about-val" id="about-version">—</span></div>
        <div class="about-row"><span class="about-key">Pi SDK</span><span class="about-val" id="about-pi-version">—</span></div>
        <div class="about-row"><span class="about-key">Author</span><span class="about-val">gnassro</span></div>
        <div class="about-row"><span class="about-key">License</span><span class="about-val">MIT</span></div>
        <div class="about-row"><span class="about-key">Engine</span><span class="about-val">VS Code ≥1.85</span></div>
      </div>
      <div class="about-links">
        <button class="about-link-btn" id="about-report-issue">
          ${icons.info()}
          Report Issue
        </button>
        <button class="about-link-btn" id="about-github">
          ${icons.github()}
          GitHub
        </button>
      </div>
    </div>
  </div>

  <!-- ── Accounts Overlay ── -->
  <div class="settings-overlay hidden" id="accounts-overlay"></div>
  <div class="settings-panel hidden" id="accounts-panel">
    <div class="settings-header">
      <h3>Accounts</h3>
      <button class="settings-close" id="accounts-close">
        ${icons.close()}
      </button>
    </div>
    <div class="settings-body" style="padding: 0;">
      <div id="accounts-list" class="accounts-list"></div>
      <div class="accounts-actions">
        <button class="accounts-action-btn" id="btn-login">
          ${icons.logIn()}
          Login / Setup
        </button>
      </div>
    </div>
  </div>

  <!-- ── Skills Overlay ── -->
  <div class="settings-overlay hidden" id="skills-overlay"></div>
  <div class="settings-panel hidden" id="skills-panel">
    <div class="settings-header">
      <h3>Loaded Skills</h3>
      <button class="icon-btn" id="close-skills-btn" title="Close">${icons.close(16)}</button>
    </div>
    <div class="settings-body" id="skills-list" style="padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto;">
      <div style="opacity:0.5; text-align:center; padding: 20px 0;">Loading skills...</div>
    </div>
  </div>

  <!-- ── History Overlay ── -->
  <div class="settings-overlay hidden" id="history-overlay"></div>
  <div class="settings-panel hidden" id="history-panel">
    <div class="settings-header">
      <h3>Session History</h3>
      <button class="settings-close" id="history-close">
        ${icons.close()}
      </button>
    </div>
    <div class="settings-body" style="padding: 0;">
      <div style="padding: 8px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));">
        <input type="text" id="session-search-input" class="sidebar-search-input" placeholder="Search sessions..." autocomplete="off" />
      </div>
      <div class="session-list" id="session-list" style="flex:1; overflow-y:auto; padding:8px;">
        <div class="session-loading">Loading sessions...</div>
      </div>
    </div>
  </div>

  <!-- ── Tree Panel ── -->
  <div class="settings-overlay hidden" id="tree-overlay"></div>
  <div class="settings-panel hidden" id="tree-panel">
    <div class="settings-header">
      <h3>Conversation Tree</h3>
      <button class="settings-close" id="tree-close">
        ${icons.close()}
      </button>
    </div>
    <div class="settings-body" style="padding: 0;">
      <div class="tree-toolbar">
        <select id="tree-filter" class="tree-filter-select">
          <option value="default">User + Assistant</option>
          <option value="user-only">User only</option>
          <option value="labeled-only">Labeled only</option>
          <option value="all">All entries</option>
        </select>
      </div>
      <div class="tree-view" id="tree-view">
        <div class="tree-loading">Loading tree...</div>
      </div>
    </div>
  </div>

  <!-- ── Command Palette ── -->

  <script type="module" nonce="${nonce}" src="${scriptUri}?v=${cacheBust}"></script>
</body>
</html>`;
}
