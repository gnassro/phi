import * as vscode from 'vscode';
import * as PanelManager from './panel-manager';
import * as AgentManager from './agent-manager';
import * as IpcBridge from './ipc-bridge';
import * as EditorContext from './editor-context';

/**
 * registerCommands
 *
 * Registers all VS Code commands contributed by Phi.
 * Called once from extension.ts activate().
 *
 * Commands registered:
 *   phi.openChat           — Open / reveal the Phi chat panel
 *   phi.askAboutSelection  — Send selected code to Pi as context
 *   phi.newSession         — Start a new Pi session
 *   phi.abortSession       — Abort the current Pi turn
 *
 * All commands must be listed in package.json "contributes.commands".
 * If you add a command here, update package.json AND AGENTS.md.
 */
export function registerCommands(ctx: vscode.ExtensionContext): void {
  // ── phi.openChat ──────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.openChat', () => {
      const panel = PanelManager.openPanel();

      // Initialize the IPC bridge now that the panel exists
      IpcBridge.initialize();

      // Push current editor context immediately on open
      IpcBridge.pushEditorContext();

      // Apply user's theme preference from VS Code settings
      const theme = vscode.workspace
        .getConfiguration('phi')
        .get<string>('theme', 'night');
      panel.webview.postMessage({ type: 'set_theme', theme });
    })
  );

  // ── phi.askAboutSelection ─────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.askAboutSelection', async () => {
      const selectionPrompt = EditorContext.buildSelectionPrompt();

      if (!selectionPrompt) {
        vscode.window.showInformationMessage(
          '[Phi] Select some code first, then use "Ask About Selection".'
        );
        return;
      }

      // Open the panel first (creates it if needed)
      PanelManager.openPanel();
      IpcBridge.initialize();

      // Send the formatted selection as a pre-filled prompt to the webview
      // The webview will display it in the input and let the user add a question
      PanelManager.send({
        type: 'prefill_input',
        text: selectionPrompt,
      });
    })
  );

  // ── phi.newSession ────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.newSession', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'Start a new Pi session? The current conversation will be saved.',
        { modal: true },
        'New Session'
      );

      if (confirmed === 'New Session') {
        await AgentManager.newSession();
        IpcBridge.sendSync();
        vscode.window.showInformationMessage('[Phi] New session started.');
      }
    })
  );

  // ── phi.abortSession ──────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.abortSession', async () => {
      if (!AgentManager.isStreaming()) return;
      await AgentManager.abort();
    })
  );
}
