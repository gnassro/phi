import * as vscode from 'vscode';
import * as PanelManager from './panel-manager.js';
import * as AgentManager from './agent-manager.js';
import * as IpcBridge from './ipc-bridge.js';
import * as EditorContext from './editor-context.js';

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
      vscode.window.showInformationMessage(`Logged out from ${picked.label}.`);
    })
  );

  // ── phi.addApiKey ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.addApiKey', async () => {
      const providers = AgentManager.getApiKeyProviders();

      // Build quick pick items — show ✓ for providers that already have a key
      const items = providers.map(p => ({
        label: p.name,
        description: p.hasKey ? '✓ Key set' : '',
        providerId: p.id,
      }));

      // Add "Custom provider" option at the end
      items.push({
        label: '$(add) Custom provider…',
        description: '',
        providerId: '__custom__',
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a provider to add an API key',
        title: 'Phi: Add API Key',
      });
      if (!picked) return;

      let providerId = picked.providerId;
      let providerName = picked.label;

      // Custom provider — ask for the auth.json key name
      if (providerId === '__custom__') {
        const customId = await vscode.window.showInputBox({
          prompt: 'Enter the provider ID (auth.json key)',
          placeHolder: 'e.g. my-provider',
          ignoreFocusOut: true,
        });
        if (!customId) return;
        providerId = customId;
        providerName = customId;
      }

      // Ask for the API key
      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter API key for ${providerName}`,
        placeHolder: 'sk-…',
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) return;

      AgentManager.setApiKey(providerId, apiKey);
      vscode.window.showInformationMessage(
        `✓ API key saved for ${providerName}.`
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
