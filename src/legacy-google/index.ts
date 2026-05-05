// @ts-nocheck
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { streamSimpleGoogleGeminiCli } from './google-gemini-cli.ts';
import { geminiCliOAuthProvider } from './oauth-google-gemini-cli.ts';
import { antigravityOAuthProvider } from './oauth-google-antigravity.ts';
import { geminiCliModels, antigravityModels } from './models.ts';

export async function legacyGoogleProvidersExtension(pi: ExtensionAPI) {
  // Register Google Cloud Code Assist (Gemini CLI)
  pi.registerProvider("google-gemini-cli", {
    name: "Google Cloud Code Assist (Gemini CLI)",
    baseUrl: "https://cloudcode-pa.googleapis.com",
    api: "google-gemini-cli",
    models: geminiCliModels as any,
    streamSimple: streamSimpleGoogleGeminiCli,
    oauth: geminiCliOAuthProvider as any,
  });

  // Register Google Antigravity
  pi.registerProvider("google-antigravity", {
    name: "Google Antigravity",
    baseUrl: "https://daily-cloudcode-pa.sandbox.googleapis.com",
    api: "google-gemini-cli",
    models: antigravityModels as any,
    streamSimple: streamSimpleGoogleGeminiCli,
    oauth: antigravityOAuthProvider as any,
  });
}
