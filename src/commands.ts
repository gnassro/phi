import * as vscode from 'vscode';
import * as PanelManager from './panel-manager.js';
import * as AgentManager from './agent-manager.js';
import * as IpcBridge from './ipc-bridge.js';
import * as EditorContext from './editor-context.js';

/**
 * Push updated accounts list to the webview.
 * Called after auth changes to auto-refresh the panel.
 */
function refreshAccountsList(): void {
  const providers = AgentManager.getOAuthProviders();
  const apiKeyProviders = AgentManager.getApiKeyProviders();
  PanelManager.send({ type: 'accounts_list', providers, apiKeyProviders });
}

type LoginAuthType = 'oauth' | 'api_key';

function getProviderStatusDescription(provider: AgentManager.LoginProviderInfo): string {
  if (provider.authType === 'oauth') {
    if (provider.storedCredentialType === 'oauth') return '✓ Logged in';
    if (provider.storedCredentialType === 'api_key') return 'API key stored';
  } else {
    if (provider.storedCredentialType === 'api_key') return '✓ API key stored';
    if (provider.storedCredentialType === 'oauth') return 'Subscription stored';
  }

  switch (provider.authStatus.source) {
    case 'environment':
      return provider.authStatus.label
        ? `Configured via ${provider.authStatus.label}`
        : 'Configured via environment';
    case 'models_json_key':
      return 'Configured via ~/.pi/agent/models.json';
    case 'models_json_command':
      return 'Configured via command in ~/.pi/agent/models.json';
    case 'fallback':
      return provider.authStatus.label
        ? `Configured via ${provider.authStatus.label}`
        : 'Configured via custom provider config';
    case 'runtime':
      return provider.authStatus.label
        ? `Configured via ${provider.authStatus.label}`
        : 'Configured at runtime';
    case 'stored':
      return provider.authType === 'oauth' ? '✓ Logged in' : '✓ API key stored';
    default:
      return provider.setupOnly ? 'External setup required' : '';
  }
}

function getProviderDetail(provider: AgentManager.LoginProviderInfo): string | undefined {
  const parts: string[] = [];
  if (provider.authType === 'oauth') {
    parts.push('Subscription / OAuth');
  } else if (provider.setupOnly) {
    parts.push('Provider setup');
  } else {
    parts.push('API key');
  }
  if (provider.setupHint) {
    parts.push(provider.setupHint);
  }
  return parts.join(' • ') || undefined;
}

async function pickLoginAuthType(): Promise<LoginAuthType | undefined> {
  const picked = await vscode.window.showQuickPick([
    {
      label: 'Use a subscription',
      description: 'Browser login for OAuth/subscription providers',
      authType: 'oauth' as const,
    },
    {
      label: 'Use an API key or provider setup',
      description: 'Save an API key or follow provider-specific setup guidance',
      authType: 'api_key' as const,
    },
  ], {
    placeHolder: 'Choose how you want to authenticate',
    title: 'Phi: Login',
  });

  return picked?.authType;
}

async function pickLoginProvider(
  authType: LoginAuthType,
  options: {
    title: string;
    placeHolder: string;
    includeSetupOnly?: boolean;
    emptyMessage: string;
  }
): Promise<AgentManager.LoginProviderInfo | undefined> {
  let providers = AgentManager.getLoginProviders(authType);
  if (options.includeSetupOnly === false) {
    providers = providers.filter((provider) => !provider.setupOnly);
  }

  if (providers.length === 0) {
    vscode.window.showInformationMessage(options.emptyMessage);
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    providers.map((provider) => ({
      label: provider.name,
      description: getProviderStatusDescription(provider),
      detail: getProviderDetail(provider),
      provider,
    })),
    {
      placeHolder: options.placeHolder,
      title: options.title,
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  return picked?.provider;
}

async function showBedrockSetup(providerName: string): Promise<void> {
  const openDocs = 'Open Pi Provider Docs';
  const picked = await vscode.window.showInformationMessage(
    `${providerName} uses AWS credentials or bearer tokens instead of a single API key. Configure AWS_PROFILE, IAM keys, bearer tokens, or role-based credentials first.`,
    openDocs
  );

  if (picked === openDocs) {
    await vscode.env.openExternal(vscode.Uri.parse(
      'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md#amazon-bedrock'
    ));
  }
}

async function runOAuthLogin(provider: AgentManager.LoginProviderInfo): Promise<void> {
  const abortController = new AbortController();
  const manualCodeCts = new vscode.CancellationTokenSource();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Logging in to ${provider.name}...`,
      cancellable: true,
    },
    async (progress, token) => {
      token.onCancellationRequested(() => abortController.abort());

      try {
        await AgentManager.login(provider.id, {
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
            const code = await vscode.window.showInputBox({
              prompt: 'Paste the authorization code from your browser',
              placeHolder: 'Authorization code',
              ignoreFocusOut: true,
            }, manualCodeCts.token);
            return code ?? '';
          },
          signal: abortController.signal,
        });

        manualCodeCts.cancel();
        refreshAccountsList();
        vscode.window.showInformationMessage(`✓ Logged in to ${provider.name} successfully.`);
      } catch (err) {
        manualCodeCts.cancel();
        if (abortController.signal.aborted) {
          vscode.window.showInformationMessage('Login cancelled.');
        } else {
          vscode.window.showErrorMessage(`Login failed: ${(err as Error).message}`);
        }
      } finally {
        manualCodeCts.dispose();
      }
    }
  );
}

async function runApiKeySetup(provider: AgentManager.LoginProviderInfo): Promise<void> {
  if (provider.setupOnly) {
    await showBedrockSetup(provider.name);
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter API key for ${provider.name}`,
    placeHolder: 'API key',
    password: true,
    ignoreFocusOut: true,
  });
  if (!apiKey) return;

  AgentManager.setApiKey(provider.id, apiKey);
  refreshAccountsList();

  const suffix = provider.id === 'cloudflare-workers-ai'
    ? ' Also set CLOUDFLARE_ACCOUNT_ID in your environment.'
    : '';

  vscode.window.showInformationMessage(`✓ API key saved for ${provider.name}.${suffix}`);
}

async function runLoginFlow(options: {
  authType?: LoginAuthType;
  title: string;
  placeHolder: string;
  includeSetupOnly?: boolean;
  emptyMessage: string;
}): Promise<void> {
  const authType = options.authType ?? await pickLoginAuthType();
  if (!authType) return;

  const provider = await pickLoginProvider(authType, {
    title: options.title,
    placeHolder: options.placeHolder,
    includeSetupOnly: options.includeSetupOnly,
    emptyMessage: options.emptyMessage,
  });
  if (!provider) return;

  if (provider.authType === 'oauth') {
    await runOAuthLogin(provider);
  } else {
    await runApiKeySetup(provider);
  }
}

async function pickStoredCredentialProvider(
  authType: LoginAuthType,
  options: {
    title: string;
    placeHolder: string;
    emptyMessage: string;
  }
): Promise<AgentManager.StoredCredentialProviderInfo | undefined> {
  const providers = AgentManager.getStoredCredentialProviders(authType);
  if (providers.length === 0) {
    vscode.window.showInformationMessage(options.emptyMessage);
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    providers.map((provider) => ({
      label: provider.name,
      providerId: provider.id,
      provider,
    })),
    {
      placeHolder: options.placeHolder,
      title: options.title,
    }
  );

  return picked?.provider;
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
      await runLoginFlow({
        title: 'Phi: Login',
        placeHolder: 'Select a provider',
        includeSetupOnly: true,
        emptyMessage: '[Phi] No login-capable providers available.',
      });
    })
  );

  // ── phi.logout ────────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.logout', async () => {
      const picked = await pickStoredCredentialProvider('oauth', {
        title: 'Phi: Logout',
        placeHolder: 'Select a provider to log out from',
        emptyMessage: '[Phi] Not logged in to any provider.',
      });
      if (!picked) return;

      AgentManager.logout(picked.id);
      refreshAccountsList();
      vscode.window.showInformationMessage(`Logged out from ${picked.name}.`);
    })
  );

  // ── phi.addApiKey ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.addApiKey', async () => {
      await runLoginFlow({
        authType: 'api_key',
        title: 'Phi: Add API Key',
        placeHolder: 'Select a provider to add an API key',
        includeSetupOnly: false,
        emptyMessage: '[Phi] No API key providers available.',
      });
    })
  );

  // ── phi.removeApiKey ──────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('phi.removeApiKey', async () => {
      const picked = await pickStoredCredentialProvider('api_key', {
        title: 'Phi: Remove API Key',
        placeHolder: 'Select a provider to remove the API key',
        emptyMessage: '[Phi] No API keys configured.',
      });
      if (!picked) return;

      AgentManager.removeApiKey(picked.id);
      refreshAccountsList();
      vscode.window.showInformationMessage(`API key removed for ${picked.name}.`);
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
