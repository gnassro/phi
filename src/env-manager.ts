import * as vscode from 'vscode';

type EnvPreference = 'global' | 'local';

interface EnvVarDefinition {
  name: string;
  label?: string;
  description: string;
  placeholder?: string;
  sensitive?: boolean;
}

interface EnvChoiceDefinition {
  label: string;
  description: string;
  env: EnvVarDefinition[];
}

interface EnvChoiceGroupDefinition {
  prompt: string;
  choices: EnvChoiceDefinition[];
}

interface ProviderEnvSetupDefinition {
  providerId: string;
  name: string;
  intro?: string;
  requiredEnv?: EnvVarDefinition[];
  requiredChoiceGroup?: EnvChoiceGroupDefinition;
  optionalEnv?: EnvVarDefinition[];
}

export interface ProviderEnvSetupResult {
  attempted: boolean;
  completed: boolean;
  changed: boolean;
  configuredLocal: string[];
  configuredGlobal: string[];
  missingRequired: string[];
}

const PROVIDER_ENV_SETUPS: Record<string, ProviderEnvSetupDefinition> = {
  'cloudflare-ai-gateway': {
    providerId: 'cloudflare-ai-gateway',
    name: 'Cloudflare AI Gateway',
    intro: 'Cloudflare AI Gateway requires an account ID and gateway ID in addition to the API key.',
    requiredEnv: [
      {
        name: 'CLOUDFLARE_ACCOUNT_ID',
        label: 'Cloudflare account ID',
        description: 'Required account ID for Cloudflare AI Gateway requests.',
        placeholder: 'Cloudflare account ID',
      },
      {
        name: 'CLOUDFLARE_GATEWAY_ID',
        label: 'Cloudflare gateway ID',
        description: 'The gateway ID configured in your Cloudflare dashboard.',
        placeholder: 'my-ai-gateway',
      },
    ],
  },

  'cloudflare-workers-ai': {
    providerId: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    intro: 'Cloudflare Workers AI needs an account ID in addition to the API key.',
    requiredEnv: [
      {
        name: 'CLOUDFLARE_ACCOUNT_ID',
        label: 'Cloudflare account ID',
        description: 'Required account ID for Cloudflare Workers AI requests.',
        placeholder: 'Cloudflare account ID',
      },
    ],
  },

  'azure-openai-responses': {
    providerId: 'azure-openai-responses',
    name: 'Azure OpenAI Responses',
    intro: 'Azure OpenAI needs either a base URL or a resource name in addition to the API key.',
    requiredChoiceGroup: {
      prompt: 'Choose how to configure the Azure OpenAI endpoint.',
      choices: [
        {
          label: 'Use Azure OpenAI base URL',
          description: 'Set AZURE_OPENAI_BASE_URL, e.g. https://my-resource.openai.azure.com',
          env: [
            {
              name: 'AZURE_OPENAI_BASE_URL',
              label: 'Azure OpenAI base URL',
              description: 'Azure OpenAI or Cognitive Services endpoint URL.',
              placeholder: 'https://your-resource.openai.azure.com',
            },
          ],
        },
        {
          label: 'Use Azure resource name',
          description: 'Set AZURE_OPENAI_RESOURCE_NAME instead of a full base URL',
          env: [
            {
              name: 'AZURE_OPENAI_RESOURCE_NAME',
              label: 'Azure OpenAI resource name',
              description: 'Azure OpenAI resource name used to derive the endpoint.',
              placeholder: 'your-resource-name',
            },
          ],
        },
      ],
    },
    optionalEnv: [
      {
        name: 'AZURE_OPENAI_API_VERSION',
        label: 'Azure OpenAI API version',
        description: 'Optional API version override.',
        placeholder: '2024-02-01',
      },
      {
        name: 'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
        label: 'Azure deployment mapping',
        description: 'Optional model=deployment map, comma-separated.',
        placeholder: 'gpt-4=my-gpt4,gpt-4o=my-gpt4o',
      },
    ],
  },

  'amazon-bedrock': {
    providerId: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    intro: 'Amazon Bedrock uses AWS credentials instead of a single API key.',
    requiredChoiceGroup: {
      prompt: 'Choose how Amazon Bedrock should authenticate.',
      choices: [
        {
          label: 'Use AWS profile',
          description: 'Set AWS_PROFILE, optionally with AWS_REGION.',
          env: [
            {
              name: 'AWS_PROFILE',
              label: 'AWS profile',
              description: 'AWS profile name for Bedrock.',
              placeholder: 'default',
            },
          ],
        },
        {
          label: 'Use IAM access keys',
          description: 'Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
          env: [
            {
              name: 'AWS_ACCESS_KEY_ID',
              label: 'AWS access key ID',
              description: 'AWS access key ID for Bedrock.',
              placeholder: 'AKIA...',
              sensitive: true,
            },
            {
              name: 'AWS_SECRET_ACCESS_KEY',
              label: 'AWS secret access key',
              description: 'AWS secret access key for Bedrock.',
              placeholder: 'AWS secret access key',
              sensitive: true,
            },
          ],
        },
        {
          label: 'Use Bedrock bearer token',
          description: 'Set AWS_BEARER_TOKEN_BEDROCK.',
          env: [
            {
              name: 'AWS_BEARER_TOKEN_BEDROCK',
              label: 'Bedrock bearer token',
              description: 'Bearer token for Bedrock Converse API access.',
              placeholder: 'Bearer token',
              sensitive: true,
            },
          ],
        },
      ],
    },
    optionalEnv: [
      {
        name: 'AWS_REGION',
        label: 'AWS region',
        description: 'Optional AWS region for Bedrock.',
        placeholder: 'us-east-1',
      },
    ],
  },

  'google-vertex': {
    providerId: 'google-vertex',
    name: 'Google Vertex AI',
    intro: 'Google Vertex AI needs a Google Cloud project. Location and credentials can also be set here.',
    requiredEnv: [
      {
        name: 'GOOGLE_CLOUD_PROJECT',
        label: 'Google Cloud project',
        description: 'Required Google Cloud project ID for Vertex AI.',
        placeholder: 'your-project-id',
      },
    ],
    optionalEnv: [
      {
        name: 'GOOGLE_CLOUD_LOCATION',
        label: 'Google Cloud location',
        description: 'Optional Vertex AI location.',
        placeholder: 'us-central1',
      },
      {
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
        label: 'Application credentials file',
        description: 'Optional path to a service account JSON file.',
        placeholder: '/path/to/service-account.json',
      },
    ],
  },

  'google-gemini-cli': {
    providerId: 'google-gemini-cli',
    name: 'Google Cloud Code Assist (Gemini CLI)',
    intro: 'Phi does not bundle Google OAuth client credentials. Configure your own OAuth client ID and secret to use the legacy Google Cloud Code Assist provider.',
    requiredEnv: [
      {
        name: 'PHI_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID',
        label: 'OAuth client ID',
        description: 'OAuth client ID for the Google Cloud Code Assist / Gemini CLI flow.',
        placeholder: 'OAuth client ID',
        sensitive: true,
      },
      {
        name: 'PHI_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET',
        label: 'OAuth client secret',
        description: 'OAuth client secret for the Google Cloud Code Assist / Gemini CLI flow.',
        placeholder: 'OAuth client secret',
        sensitive: true,
      },
    ],
    optionalEnv: [
      {
        name: 'GOOGLE_CLOUD_PROJECT',
        label: 'Google Cloud project',
        description: 'Optional Google Cloud project for paid Cloud Code Assist.',
        placeholder: 'your-project-id',
      },
    ],
  },

  'google-antigravity': {
    providerId: 'google-antigravity',
    name: 'Google Antigravity',
    intro: 'Phi does not bundle Google OAuth client credentials. Configure your own OAuth client ID and secret to use the legacy Google Antigravity provider.',
    requiredEnv: [
      {
        name: 'PHI_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID',
        label: 'OAuth client ID',
        description: 'OAuth client ID for the Google Antigravity flow.',
        placeholder: 'OAuth client ID',
        sensitive: true,
      },
      {
        name: 'PHI_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET',
        label: 'OAuth client secret',
        description: 'OAuth client secret for the Google Antigravity flow.',
        placeholder: 'OAuth client secret',
        sensitive: true,
      },
    ],
  },
};

let context: vscode.ExtensionContext | null = null;
const originalEnv = new Map<string, string | undefined>();

function ensureInitialized(): vscode.ExtensionContext {
  if (!context) {
    throw new Error('[Phi] EnvManager not initialized');
  }
  return context;
}

function getAllEnvNames(): string[] {
  const names = new Set<string>();
  for (const setup of Object.values(PROVIDER_ENV_SETUPS)) {
    for (const env of setup.requiredEnv ?? []) names.add(env.name);
    for (const env of setup.optionalEnv ?? []) names.add(env.name);
    for (const choice of setup.requiredChoiceGroup?.choices ?? []) {
      for (const env of choice.env) names.add(env.name);
    }
  }
  return [...names];
}

function getPreferenceKey(providerId: string, envName: string): string {
  return `phi.env.preference.${providerId}.${envName}`;
}

function getSecretKey(providerId: string, envName: string): string {
  return `phi.env.local.${providerId}.${envName}`;
}

function getPreference(providerId: string, envName: string): EnvPreference | undefined {
  return context?.globalState.get<EnvPreference>(getPreferenceKey(providerId, envName));
}

async function setPreference(providerId: string, envName: string, preference: EnvPreference): Promise<void> {
  const ctx = ensureInitialized();
  await ctx.globalState.update(getPreferenceKey(providerId, envName), preference);
}

function getGlobalEnvValue(envName: string): string | undefined {
  return originalEnv.get(envName);
}

function applyGlobalEnvValue(envName: string): void {
  const value = getGlobalEnvValue(envName);
  if (value) {
    process.env[envName] = value;
  } else {
    delete process.env[envName];
  }
}

async function getLocalEnvValue(providerId: string, envName: string): Promise<string | undefined> {
  const ctx = ensureInitialized();
  return await ctx.secrets.get(getSecretKey(providerId, envName));
}

async function setLocalEnvValue(providerId: string, envName: string, value: string): Promise<void> {
  const ctx = ensureInitialized();
  await ctx.secrets.store(getSecretKey(providerId, envName), value);
  await setPreference(providerId, envName, 'local');
  process.env[envName] = value;
}

async function useGlobalEnvValue(providerId: string, envName: string): Promise<void> {
  const ctx = ensureInitialized();
  await ctx.secrets.delete(getSecretKey(providerId, envName));
  await setPreference(providerId, envName, 'global');
  applyGlobalEnvValue(envName);
}

function hasEffectiveEnv(envName: string): boolean {
  return !!process.env[envName];
}

function isChoiceConfigured(choice: EnvChoiceDefinition): boolean {
  return choice.env.every((env) => hasEffectiveEnv(env.name));
}

function getConfiguredChoice(group: EnvChoiceGroupDefinition): EnvChoiceDefinition | undefined {
  return group.choices.find(isChoiceConfigured);
}

function note(result: ProviderEnvSetupResult, envName: string, source: EnvPreference, changed: boolean): void {
  if (source === 'global') result.configuredGlobal.push(envName);
  else result.configuredLocal.push(envName);
  result.changed = result.changed || changed;
}

async function promptForLocalEnv(
  providerName: string,
  env: EnvVarDefinition,
  required: boolean
): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: `${providerName}: ${env.label ?? env.name}`,
    prompt: `${env.description} (${env.name})`,
    placeHolder: env.placeholder ?? env.name,
    password: !!env.sensitive,
    ignoreFocusOut: true,
    validateInput: (input) => {
      if (required && input.trim().length === 0) {
        return `${env.name} is required.`;
      }
      return undefined;
    },
  });

  const trimmed = value?.trim();
  return trimmed || undefined;
}

async function configureEnvVar(
  setup: ProviderEnvSetupDefinition,
  env: EnvVarDefinition,
  required: boolean,
  result: ProviderEnvSetupResult
): Promise<boolean> {
  const globalValue = getGlobalEnvValue(env.name);
  const currentPreference = getPreference(setup.providerId, env.name);
  const localValue = await getLocalEnvValue(setup.providerId, env.name);

  if (globalValue) {
    const picked = await vscode.window.showQuickPick([
      {
        label: `Use global ${env.name}`,
        description: 'Detected in the VS Code process environment',
        action: 'global' as const,
      },
      ...(localValue ? [{
        label: `Keep existing Phi-local ${env.name}`,
        description: 'Use the value already stored by Phi',
        action: 'keep-local' as const,
      }] : []),
      {
        label: `Set Phi-local ${env.name}`,
        description: 'Stored by Phi and applied only inside this extension',
        action: 'local' as const,
      },
      ...(!required ? [{
        label: `Skip ${env.name}`,
        description: 'Leave this optional variable unchanged',
        action: 'skip' as const,
      }] : []),
    ], {
      title: `${setup.name}: ${env.label ?? env.name}`,
      placeHolder: `${env.description} (${env.name})`,
      ignoreFocusOut: true,
    });

    if (!picked) {
      if (required) result.missingRequired.push(env.name);
      return !required;
    }

    if (picked.action === 'global') {
      const changed = currentPreference !== 'global' || !!localValue;
      await useGlobalEnvValue(setup.providerId, env.name);
      note(result, env.name, 'global', changed);
      return true;
    }

    if (picked.action === 'keep-local') {
      process.env[env.name] = localValue!;
      note(result, env.name, 'local', false);
      return true;
    }

    if (picked.action === 'skip') {
      return true;
    }
  } else if (localValue) {
    const picked = await vscode.window.showQuickPick([
      {
        label: `Keep existing Phi-local ${env.name}`,
        description: 'Use the value already stored by Phi',
        action: 'keep-local' as const,
      },
      {
        label: `Replace Phi-local ${env.name}`,
        description: 'Enter and store a new Phi-local value',
        action: 'local' as const,
      },
      ...(!required ? [{
        label: `Skip ${env.name}`,
        description: 'Leave this optional variable unchanged',
        action: 'skip' as const,
      }] : []),
    ], {
      title: `${setup.name}: ${env.label ?? env.name}`,
      placeHolder: `${env.description} (${env.name})`,
      ignoreFocusOut: true,
    });

    if (!picked) {
      if (required) result.missingRequired.push(env.name);
      return !required;
    }

    if (picked.action === 'keep-local') {
      process.env[env.name] = localValue;
      note(result, env.name, 'local', false);
      return true;
    }

    if (picked.action === 'skip') {
      return true;
    }
  }

  const value = await promptForLocalEnv(setup.name, env, required);
  if (!value) {
    if (required) result.missingRequired.push(env.name);
    return !required;
  }

  const changed = currentPreference !== 'local' || localValue !== value;
  await setLocalEnvValue(setup.providerId, env.name, value);
  note(result, env.name, 'local', changed);
  return true;
}

async function configureRequiredChoiceGroup(
  setup: ProviderEnvSetupDefinition,
  group: EnvChoiceGroupDefinition,
  result: ProviderEnvSetupResult
): Promise<boolean> {
  const configuredChoice = getConfiguredChoice(group);
  if (configuredChoice) {
    const picked = await vscode.window.showQuickPick([
      {
        label: `Use existing ${configuredChoice.label}`,
        description: configuredChoice.description,
        action: 'use-existing' as const,
      },
      {
        label: 'Configure a different setup',
        description: 'Override or add Phi-local environment variables',
        action: 'configure' as const,
      },
    ], {
      title: `${setup.name}: Environment setup`,
      placeHolder: 'Existing environment values were detected.',
      ignoreFocusOut: true,
    });

    if (!picked || picked.action === 'use-existing') {
      return true;
    }
  }

  const pickedChoice = await vscode.window.showQuickPick(
    group.choices.map((choice) => ({
      label: choice.label,
      description: choice.description,
      choice,
    })),
    {
      title: `${setup.name}: Environment setup`,
      placeHolder: group.prompt,
      ignoreFocusOut: true,
      matchOnDescription: true,
    }
  );

  if (!pickedChoice) {
    const envNames = group.choices.flatMap((choice) => choice.env.map((env) => env.name));
    result.missingRequired.push(...envNames);
    return false;
  }

  for (const env of pickedChoice.choice.env) {
    const ok = await configureEnvVar(setup, env, true, result);
    if (!ok) return false;
  }

  return true;
}

async function configureOptionalEnv(setup: ProviderEnvSetupDefinition, result: ProviderEnvSetupResult): Promise<void> {
  const optionalEnv = setup.optionalEnv ?? [];
  if (optionalEnv.length === 0) return;

  const shouldConfigure = await vscode.window.showQuickPick([
    {
      label: 'Skip optional environment variables',
      description: 'You can configure them later by running Login / Setup again.',
      action: 'skip' as const,
    },
    {
      label: 'Configure optional environment variables',
      description: optionalEnv.map((env) => env.name).join(', '),
      action: 'configure' as const,
    },
  ], {
    title: `${setup.name}: Optional environment`,
    placeHolder: 'Do you want to configure optional provider environment variables?',
    ignoreFocusOut: true,
  });

  if (shouldConfigure?.action !== 'configure') return;

  for (const env of optionalEnv) {
    await configureEnvVar(setup, env, false, result);
  }
}

export async function initialize(ctx: vscode.ExtensionContext): Promise<void> {
  context = ctx;
  if (originalEnv.size === 0) {
    for (const envName of getAllEnvNames()) {
      originalEnv.set(envName, process.env[envName]);
    }
  }
  await applyConfiguredEnvironment();
}

export async function applyConfiguredEnvironment(): Promise<void> {
  ensureInitialized();

  for (const setup of Object.values(PROVIDER_ENV_SETUPS)) {
    const allEnv = [
      ...(setup.requiredEnv ?? []),
      ...(setup.optionalEnv ?? []),
      ...(setup.requiredChoiceGroup?.choices.flatMap((choice) => choice.env) ?? []),
    ];

    for (const env of allEnv) {
      const preference = getPreference(setup.providerId, env.name);
      if (preference === 'local') {
        const value = await getLocalEnvValue(setup.providerId, env.name);
        if (value) process.env[env.name] = value;
      } else if (preference === 'global') {
        applyGlobalEnvValue(env.name);
      }
    }
  }
}

export function hasProviderEnvironmentSetup(providerId: string): boolean {
  return providerId in PROVIDER_ENV_SETUPS;
}

export async function configureProviderEnvironment(
  providerId: string,
  providerName?: string
): Promise<ProviderEnvSetupResult> {
  const baseSetup = PROVIDER_ENV_SETUPS[providerId];
  const result: ProviderEnvSetupResult = {
    attempted: !!baseSetup,
    completed: true,
    changed: false,
    configuredLocal: [],
    configuredGlobal: [],
    missingRequired: [],
  };

  if (!baseSetup) return result;
  const setup: ProviderEnvSetupDefinition = providerName && providerName !== baseSetup.name
    ? { ...baseSetup, name: providerName }
    : baseSetup;

  if (setup.intro) {
    const proceed = await vscode.window.showInformationMessage(
      setup.intro,
      { modal: false },
      'Continue Setup',
      'Skip'
    );
    if (proceed !== 'Continue Setup') {
      const requiredNames = [
        ...(setup.requiredEnv ?? []).map((env) => env.name),
        ...(setup.requiredChoiceGroup?.choices.flatMap((choice) => choice.env.map((env) => env.name)) ?? []),
      ];
      result.missingRequired.push(...requiredNames);
      result.completed = requiredNames.length === 0;
      return result;
    }
  }

  for (const env of setup.requiredEnv ?? []) {
    const ok = await configureEnvVar(setup, env, true, result);
    if (!ok) {
      result.completed = false;
      return result;
    }
  }

  if (setup.requiredChoiceGroup) {
    const ok = await configureRequiredChoiceGroup(setup, setup.requiredChoiceGroup, result);
    if (!ok) {
      result.completed = false;
      return result;
    }
  }

  await configureOptionalEnv(setup, result);
  result.completed = result.missingRequired.length === 0;
  return result;
}
