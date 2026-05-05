type LegacyGoogleOAuthProviderId = 'google-gemini-cli' | 'google-antigravity';

declare const __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID__: string | undefined;
declare const __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET__: string | undefined;
declare const __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID__: string | undefined;
declare const __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET__: string | undefined;

interface LegacyGoogleOAuthDefinition {
  providerName: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  getEmbeddedClientId: () => string | undefined;
  getEmbeddedClientSecret: () => string | undefined;
}

export interface LegacyGoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  source: 'embedded' | 'environment';
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function embeddedGeminiCliClientId(): string | undefined {
  return clean(typeof __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID__ === 'string'
    ? __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID__
    : undefined);
}

function embeddedGeminiCliClientSecret(): string | undefined {
  return clean(typeof __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET__ === 'string'
    ? __PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET__
    : undefined);
}

function embeddedAntigravityClientId(): string | undefined {
  return clean(typeof __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID__ === 'string'
    ? __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID__
    : undefined);
}

function embeddedAntigravityClientSecret(): string | undefined {
  return clean(typeof __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET__ === 'string'
    ? __PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET__
    : undefined);
}

const DEFINITIONS: Record<LegacyGoogleOAuthProviderId, LegacyGoogleOAuthDefinition> = {
  'google-gemini-cli': {
    providerName: 'Google Cloud Code Assist',
    clientIdEnv: 'PHI_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID',
    clientSecretEnv: 'PHI_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET',
    getEmbeddedClientId: embeddedGeminiCliClientId,
    getEmbeddedClientSecret: embeddedGeminiCliClientSecret,
  },
  'google-antigravity': {
    providerName: 'Google Antigravity',
    clientIdEnv: 'PHI_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID',
    clientSecretEnv: 'PHI_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET',
    getEmbeddedClientId: embeddedAntigravityClientId,
    getEmbeddedClientSecret: embeddedAntigravityClientSecret,
  },
};

export function getLegacyGoogleOAuthDefinition(
  providerId: LegacyGoogleOAuthProviderId
): Pick<LegacyGoogleOAuthDefinition, 'providerName' | 'clientIdEnv' | 'clientSecretEnv'> {
  const definition = DEFINITIONS[providerId];
  return {
    providerName: definition.providerName,
    clientIdEnv: definition.clientIdEnv,
    clientSecretEnv: definition.clientSecretEnv,
  };
}

export function hasEmbeddedLegacyGoogleOAuthCredentials(providerId: LegacyGoogleOAuthProviderId): boolean {
  const definition = DEFINITIONS[providerId];
  return !!definition.getEmbeddedClientId() && !!definition.getEmbeddedClientSecret();
}

export function getLegacyGoogleOAuthCredentials(
  providerId: LegacyGoogleOAuthProviderId
): LegacyGoogleOAuthCredentials {
  const definition = DEFINITIONS[providerId];
  const embeddedClientId = definition.getEmbeddedClientId();
  const embeddedClientSecret = definition.getEmbeddedClientSecret();

  if (embeddedClientId && embeddedClientSecret) {
    return {
      clientId: embeddedClientId,
      clientSecret: embeddedClientSecret,
      source: 'embedded',
    };
  }

  const envClientId = clean(process.env[definition.clientIdEnv]);
  const envClientSecret = clean(process.env[definition.clientSecretEnv]);

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      source: 'environment',
    };
  }

  throw new Error(
    `Missing ${definition.providerName} OAuth credentials. ` +
    `Configure ${definition.clientIdEnv} and ${definition.clientSecretEnv} from Phi Login / Setup, ` +
    `VS Code SecretStorage, or your shell environment.`
  );
}
