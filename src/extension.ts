import * as vscode from 'vscode';
import * as AgentManager from './agent-manager.js';
import * as PanelManager from './panel-manager.js';
import * as IpcBridge from './ipc-bridge.js';
import { registerCommands } from './commands.js';
import * as EditorContext from './editor-context.js';

/**
 * Called by VS Code when the extension activates.
 * Activation is triggered by "onStartupFinished" — runs shortly after
 * VS Code finishes loading the workspace.
 *
 * Boot order:
 *  1. Determine the workspace CWD
 *  2. Initialize AgentManager (boots Pi SDK session)
 *  3. Initialize PanelManager (registers webview factory)
 *  4. Wire Pi events → IpcBridge → Webview
 *  5. Register all VS Code commands
 */
export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  console.log('[Phi] Activating...');

  // Determine CWD — use first workspace folder, fall back to process.cwd()
  const cwd =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // 1. Boot the Pi agent session
  try {
    await AgentManager.initialize(cwd);
    console.log(`[Phi] Pi session ready. CWD: ${cwd}`);
  } catch (err) {
    vscode.window.showErrorMessage(
      `[Phi] Failed to start Pi session: ${(err as Error).message}`
    );
    return;
  }

  // 2. Initialize the webview panel factory (pass extensionUri for asset loading)
  PanelManager.initialize(ctx);

  // 3. Initialize IPC bridge IMMEDIATELY so it's ready when the webview opens
  // (The sidebar view can open before any command is called)
  IpcBridge.initialize();

  // 4. Wire Pi SDK events → IpcBridge so they reach the webview
  AgentManager.subscribe((event) => {
    IpcBridge.forwardPiEvent(event);
  });

  // 5. Register all commands (phi.openChat, phi.askAboutSelection, etc.)
  registerCommands(ctx);

  // 5. Register floating "Chat ⌘+" button on text selection
  const selectionButtonDisposables = EditorContext.registerSelectionButton();
  ctx.subscriptions.push(...selectionButtonDisposables);

  // 6. On first activation, move Phi to the secondary (right) sidebar
  const hasMovedToRight = ctx.globalState.get<boolean>('phi.movedToSecondarySidebar');
  if (!hasMovedToRight) {
    ctx.globalState.update('phi.movedToSecondarySidebar', true);
    setTimeout(async () => {
      try {
        // Focus the Phi view (creates it if needed)
        await vscode.commands.executeCommand('phi.chatView.focus');
        // Small delay for the view to render
        await new Promise(r => setTimeout(r, 300));
        // Move the focused view to the secondary sidebar
        await vscode.commands.executeCommand(
          'workbench.action.moveFocusedView',
          { destination: 'workbench.auxiliarybar' }
        );
      } catch {
        // If programmatic move fails, show a tip
        vscode.window.showInformationMessage(
          'Tip: Right-click the Phi icon in the sidebar → "Move to Secondary Side Bar" to place it on the right.',
          'Got it'
        );
      }
    }, 1500);
  }

  // 7. Watch for workspace folder changes (user adds/removes a folder)
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newCwd =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      AgentManager.setCwd(newCwd);
    })
  );

  console.log('[Phi] Activation complete.');
}

/**
 * Called by VS Code when the extension deactivates (VS Code closing,
 * extension disabled, or developer reloads the Extension Host).
 *
 * Must dispose the Pi session to avoid leaking agent processes.
 */
export function deactivate(): void {
  console.log('[Phi] Deactivating — disposing Pi session...');
  AgentManager.dispose();
}
