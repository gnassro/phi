/**
 * FileCredentialStore
 *
 * Implements a file-backed credential store compatible with the
 * pi-ai CredentialStore interface. Replaces the old AuthStorage
 * class (removed in pi-coding-agent 0.80.8).
 *
 * Stores credentials in ~/.phi/auth.json — Phi's own auth file,
 * separate from the pi CLI's ~/.pi/agent/auth.json.
 *
 * This module intentionally does NOT import from the pi SDK,
 * keeping SDK imports isolated in agent-manager.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Credential shape stored in ~/.phi/auth.json.
 * Mirrors the pi-ai Credential union type without importing it.
 */
export type StoredCredential =
  | { type: 'api_key'; key?: string; env?: Record<string, string> }
  | { type: 'oauth'; refresh: string; access: string; expires: number; [key: string]: unknown };

export type StoredCredentialInfo = { providerId: string; type: 'api_key' | 'oauth' };

/** Simple file-lock using mkdir (atomic on all platforms). */
class FileLock {
  private lockDir: string;

  constructor(lockDir: string) {
    this.lockDir = lockDir;
  }

  async acquire(): Promise<void> {
    let retries = 0;
    while (retries < 50) {
      try {
        fs.mkdirSync(this.lockDir, { recursive: true });
        return;
      } catch {
        retries++;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error('[Phi] Could not acquire credential store lock after 50 retries');
  }

  release(): void {
    try {
      fs.rmdirSync(this.lockDir);
    } catch {
      // ignore
    }
  }
}

/**
 * CredentialStore implementation backed by ~/.phi/auth.json.
 * Compatible with the pi-ai CredentialStore interface.
 */
export class FileCredentialStore {
  private authPath: string;
  private lock: FileLock;

  constructor(authPath: string) {
    this.authPath = authPath;
    this.lock = new FileLock(authPath + '.lock');
  }

  private ensureDir(): void {
    const dir = path.dirname(this.authPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readRaw(): Record<string, StoredCredential> {
    try {
      if (!fs.existsSync(this.authPath)) return {};
      const raw = fs.readFileSync(this.authPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private writeRaw(data: Record<string, StoredCredential>): void {
    this.ensureDir();
    fs.writeFileSync(this.authPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** Read a stored credential by provider ID. */
  async read(providerId: string): Promise<StoredCredential | undefined> {
    const data = this.readRaw();
    return data[providerId];
  }

  /** List all stored credential metadata (no secrets). */
  async list(): Promise<readonly StoredCredentialInfo[]> {
    const data = this.readRaw();
    return Object.entries(data).map(([providerId, cred]) => ({
      providerId,
      type: cred.type,
    }));
  }

  /** Serialized read-modify-write. fn returns undefined to delete the entry. */
  async modify(
    providerId: string,
    fn: (current: StoredCredential | undefined) => Promise<StoredCredential | undefined>
  ): Promise<StoredCredential | undefined> {
    await this.lock.acquire();
    try {
      const data = this.readRaw();
      const current = data[providerId];
      const next = await fn(current);
      if (next !== undefined) {
        data[providerId] = next;
      } else {
        delete data[providerId];
      }
      this.writeRaw(data);
      return next;
    } finally {
      this.lock.release();
    }
  }

  /** Delete a credential (logout). */
  async delete(providerId: string): Promise<void> {
    await this.lock.acquire();
    try {
      const data = this.readRaw();
      delete data[providerId];
      this.writeRaw(data);
    } finally {
      this.lock.release();
    }
  }

  /** Sync check for credential existence (no lock — best-effort read). */
  has(providerId: string): boolean {
    try {
      if (!fs.existsSync(this.authPath)) return false;
      const raw = fs.readFileSync(this.authPath, 'utf-8');
      const data = JSON.parse(raw);
      return providerId in data;
    } catch {
      return false;
    }
  }

  /** Sync read (best-effort, no lock). */
  getSync(providerId: string): StoredCredential | undefined {
    return this.readRaw()[providerId];
  }

  /** List all credential provider IDs. */
  listIds(): string[] {
    return Object.keys(this.readRaw());
  }
}

/**
 * Legacy login callbacks used by the old AuthStorage.login() pattern.
 * Used by the adapter to bridge between old callbacks and new AuthInteraction.
 */
export interface LegacyLoginCallbacks {
  onAuth: (info: { url: string; instructions?: string }) => void;
  onPrompt: (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => Promise<string>;
  onProgress?: (message: string) => void;
  onManualCodeInput?: () => Promise<string>;
  signal?: AbortSignal;
}

/**
 * Adapter that bridges legacy login callbacks to the new AuthInteraction interface.
 * Used by custom (non-built-in) OAuth providers like the legacy Google providers.
 */
export class LegacyLoginAdapter {
  private callbacks: LegacyLoginCallbacks;
  private manualResolve: ((value: string) => void) | null = null;
  private manualReject: ((error: Error) => void) | null = null;

  constructor(callbacks: LegacyLoginCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Create an AuthInteraction object from legacy callbacks.
   * The returned adapter handles the race between manual code input
   * and browser callback properly.
   */
  toAuthInteraction(): import('@earendil-works/pi-ai').AuthInteraction {
    return {
      signal: this.callbacks.signal,
      prompt: async (prompt) => {
        if (prompt.type === 'manual_code') {
          return this.handleManualCodeInput(prompt);
        }
        if (prompt.type === 'secret') {
          return this.callbacks.onPrompt({
            message: prompt.message,
            placeholder: prompt.placeholder,
          });
        }
        if (prompt.type === 'text') {
          return this.callbacks.onPrompt({
            message: prompt.message,
            placeholder: prompt.placeholder,
          });
        }
        if (prompt.type === 'select') {
          // For select prompts, use the first option as fallback
          // In practice, VS Code QuickPick handles this in commands.ts
          return prompt.options[0]?.id ?? '';
        }
        return '';
      },
      notify: (event) => {
        if (event.type === 'auth_url') {
          this.callbacks.onAuth({ url: event.url, instructions: event.instructions });
        } else if (event.type === 'device_code') {
          // Device-code providers (GitHub Copilot, Kimi Code, xAI) expose
          // their browser URL through this event rather than auth_url.
          // Reuse the host callback so VS Code opens the verification page.
          this.callbacks.onAuth({
            url: event.verificationUri,
            instructions: `Enter code ${event.userCode} in the browser to complete sign-in.`,
          });
        } else if (event.type === 'progress') {
          this.callbacks.onProgress?.(event.message);
        } else if (event.type === 'info') {
          if (event.message) this.callbacks.onProgress?.(event.message);
        }
      },
    };
  }

  private async handleManualCodeInput(
    prompt: import('@earendil-works/pi-ai').AuthPrompt & { type: 'manual_code' }
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.manualResolve = resolve;
      this.manualReject = reject;

      // Set up abort handler
      prompt.signal?.addEventListener('abort', () => {
        if (this.manualReject) {
          this.manualReject(new Error('Login cancelled'));
          this.manualResolve = null;
          this.manualReject = null;
        }
      });

      // Also listen to the global signal
      this.callbacks.signal?.addEventListener('abort', () => {
        if (this.manualReject) {
          this.manualReject(new Error('Login cancelled'));
          this.manualResolve = null;
          this.manualReject = null;
        }
      });

      // Trigger the legacy manual code input
      if (this.callbacks.onManualCodeInput) {
        this.callbacks.onManualCodeInput()
          .then((code) => {
            if (this.manualResolve) {
              this.manualResolve(code);
              this.manualResolve = null;
              this.manualReject = null;
            }
          })
          .catch((err) => {
            if (this.manualReject) {
              this.manualReject(err instanceof Error ? err : new Error(String(err)));
              this.manualResolve = null;
              this.manualReject = null;
            }
          });
      }
    });
  }

  /** Resolve pending manual input (called when browser callback wins the race). */
  resolveManual(value: string): void {
    if (this.manualResolve) {
      this.manualResolve(value);
      this.manualResolve = null;
      this.manualReject = null;
    }
  }

  /** Reject pending manual input (called on error/cancel). */
  rejectManual(error: Error): void {
    if (this.manualReject) {
      this.manualReject(error);
      this.manualResolve = null;
      this.manualReject = null;
    }
  }
}
