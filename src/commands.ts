import * as vscode from 'vscode';
import * as PanelManager from './panel-manager.js';
import * as AgentManager from './agent-manager.js';
import * as IpcBridge from './ipc-bridge.js';
import * as EditorContext from './editor-context.js';

/**
 * Push updated accounts list to the webview.
 * Called after login, logout, addApiKey, removeApiKey to auto-refresh the panel.
 */
function refreshAccountsList(): void {
  const providers = AgentManager.getOAuthProviders();
  const apiKeyProviders = AgentManager.getApiKeyProviders();
  PanelManager.send({ type: 'accounts_list', providers, apiKeyProviders });
}

/**
 * registerCommands
 *
 * Registers all VS Code commands contributed by Phi.
 * Called once from extension.ts activate().
 *
 * NOTE: IpcBridge.initialize() is called once in extension.ts activate(),
 * NOT here. Commands just open the panel and send messages.
 */
export function registerCommands(ctx: vscode.ExtensionContext): void {
  // ── phi.openChat ──────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.openChat', () => {
      PanelManager.openPanel();
    })
  );

  // ── phi.addSelectionToChat ────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.addSelectionToChat', () => {
      const contextBlock = EditorContext.buildSelectionContext();
      if (!contextBlock) {
        vscode.window.showInformationMessage('[Phi] Select some code first.');
        return;
      }
      PanelManager.openPanel();
      PanelManager.send({ type: 'add_context', context: contextBlock });
    })
  );

  // ── phi.addFileToChat ─────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.addFileToChat', (uri?: vscode.Uri) => {
      if (!uri) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('[Phi] No file selected.');
          return;
        }
        uri = editor.document.uri;
      }
      const contextBlock = EditorContext.buildFileContext(uri);
      if (!contextBlock) {
        vscode.window.showInformationMessage('[Phi] Could not read file.');
        return;
      }
      PanelManager.openPanel();
      PanelManager.send({ type: 'add_context', context: contextBlock });
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
      PanelManager.openPanel();
      PanelManager.send({ type: 'prefill_input', text: selectionPrompt });
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

  // ── phi.deleteSession ─────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.deleteSession', async (sessionPath?: string) => {
      if (!sessionPath) return;
      const answer = await vscode.window.showWarningMessage(
        "Are you sure you want to delete this session? It will be moved to the system trash.",
        { modal: true },
        "Move to Trash"
      );

      if (answer === "Move to Trash") {
        try {
          const fileUri = vscode.Uri.file(sessionPath);
          await vscode.workspace.fs.delete(fileUri, { useTrash: true });
          
          // If the deleted session is the currently active one, start a new session
          const activeSessionPath = AgentManager.getSessionFile();
          if (activeSessionPath && activeSessionPath === sessionPath) {
            await AgentManager.newSession();
            IpcBridge.sendSync();
          }

          // Always refresh the sessions list
          const sessions = await AgentManager.getSessions();
          PanelManager.send({ type: 'sessions_list', sessions });
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to delete session: ${err.message}`);
        }
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

  // ── phi.login ─────────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.login', async () => {
      const providers = AgentManager.getOAuthProviders();
      if (providers.length === 0) {
        vscode.window.showInformationMessage('[Phi] No OAuth providers available.');
        return;
      }

      const items = providers.map(p => ({
        label: p.name,
        description: p.loggedIn ? '✓ Logged in' : '',
        providerId: p.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a provider to log in',
        title: 'Phi: Login',
      });
      if (!picked) return;

      const abortController = new AbortController();
      const manualCodeCts = new vscode.CancellationTokenSource();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Logging in to ${picked.label}...`,
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => abortController.abort());

          try {
            await AgentManager.login(picked.providerId, {
              onAuth: (info) => {
                vscode.env.openExternal(vscode.Uri.parse(info.url));
                if (info.instructions) {
                  vscode.window.showInformationMessage(info.instructions);
                }
              },
              onPrompt: async (prompt) => {
                const value = await vscode.window.showInputBox({
                  prompt: prompt.message,
                  placeHolder: prompt.placeholder ?? '',
                  ignoreFocusOut: true,
                });
                return value ?? '';
              },
              onProgress: (message) => {
                progress.report({ message });
              },
              onManualCodeInput: async () => {
                // This is a fallback — shown in parallel with the callback server.
                // If the callback server receives the code first, login() resolves
                // and we cancel this input box via manualCodeCts.
                const code = await vscode.window.showInputBox({
                  prompt: 'Paste the authorization code from your browser',
                  placeHolder: 'Authorization code',
                  ignoreFocusOut: true,
                }, manualCodeCts.token);
                return code ?? '';
              },
              signal: abortController.signal,
            });

            // Login succeeded — dismiss the manual code input if still open
            manualCodeCts.cancel();
            refreshAccountsList();

            vscode.window.showInformationMessage(
              `✓ Logged in to ${picked.label} successfully.`
            );
          } catch (err) {
            manualCodeCts.cancel();
            if (abortController.signal.aborted) {
              vscode.window.showInformationMessage('Login cancelled.');
            } else {
              vscode.window.showErrorMessage(
                `Login failed: ${(err as Error).message}`
              );
            }
          } finally {
            manualCodeCts.dispose();
          }
        }
      );
    })
  );

  // ── phi.logout ────────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.logout', async () => {
      const providers = AgentManager.getOAuthProviders().filter(p => p.loggedIn);
      if (providers.length === 0) {
        vscode.window.showInformationMessage('[Phi] Not logged in to any provider.');
        return;
      }

      const items = providers.map(p => ({
        label: p.name,
        providerId: p.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a provider to log out from',
        title: 'Phi: Logout',
      });
      if (!picked) return;

      AgentManager.logout(picked.providerId);
      refreshAccountsList();
      vscode.window.showInformationMessage(`Logged out from ${picked.label}.`);
    })
  );

  // ── phi.addApiKey ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.addApiKey', async () => {
      const providers = AgentManager.getApiKeyProviders();

      const picked = await vscode.window.showQuickPick(
        providers.map(p => ({
          label: p.name,
          description: p.hasKey ? '✓ Key set' : '',
          providerId: p.id,
        })),
        {
          placeHolder: 'Select a provider to add an API key',
          title: 'Phi: Add API Key',
        }
      );
      if (!picked) return;

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter API key for ${picked.label}`,
        placeHolder: 'sk-…',
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) return;

      AgentManager.setApiKey(picked.providerId, apiKey);
      refreshAccountsList();
      vscode.window.showInformationMessage(
        `✓ API key saved for ${picked.label}.`
      );
    })
  );

  // ── phi.removeApiKey ──────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.removeApiKey', async () => {
      const providers = AgentManager.getApiKeyProviders().filter(p => p.hasKey);
      if (providers.length === 0) {
        vscode.window.showInformationMessage('[Phi] No API keys configured.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        providers.map(p => ({ label: p.name, providerId: p.id })),
        {
          placeHolder: 'Select a provider to remove the API key',
          title: 'Phi: Remove API Key',
        }
      );
      if (!picked) return;

      AgentManager.removeApiKey(picked.providerId);
      refreshAccountsList();
      vscode.window.showInformationMessage(
        `API key removed for ${picked.label}.`
      );
    })
  );

  // ── phi.openTree ──────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.openTree', () => {
      PanelManager.openPanel();
      // Small delay to ensure webview is ready
      setTimeout(() => {
        PanelManager.send({ type: 'open_tree' });
      }, 200);
    })
  );
}
