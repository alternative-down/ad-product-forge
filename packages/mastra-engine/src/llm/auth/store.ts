import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

export type ProviderId = 'openai-codex' | 'anthropic';
export type OAuthCredential = {
  access: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

const credentialSchema = z.object({
  access: z.string(),
  refresh: z.string().optional(),
  expires: z.number().optional(),
  accountId: z.string().optional(),
});
const storeSchema = z.object({
  'openai-codex': credentialSchema.optional(),
  anthropic: credentialSchema.optional(),
});

export function createOAuthStore() {
  function getDefaultPath() {
    return path.join(os.homedir(), '.mastra-engine', 'oauth.json');
  }

  function readJsonFile(filePath: string) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  function read(storePath = getDefaultPath()) {
    const store = readJsonFile(storePath);

    if (!store || typeof store !== 'object') {
      return {};
    }

    return storeSchema.parse(store);
  }

  function write(provider: ProviderId, credential: OAuthCredential, storePath = getDefaultPath()) {
    const store = read(storePath);
    fs.mkdirSync(path.dirname(storePath), { recursive: true, mode: 0o700 });
    store[provider] = credential;
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
    fs.chmodSync(storePath, 0o600);
  }

  function readCredentialFile(filePath: string) {
    const raw = fs.readFileSync(filePath, 'utf8').trim();

    if (!raw.startsWith('{')) {
      return { access: raw } satisfies OAuthCredential;
    }

    return credentialSchema.parse(JSON.parse(raw));
  }

  function isExpired(credential: OAuthCredential, skewMs = 60_000) {
    if (!credential.expires) {
      return false;
    }

    return Date.now() + skewMs >= credential.expires;
  }

  return {
    getDefaultPath,
    readJsonFile,
    read,
    write,
    readCredentialFile,
    isExpired,
  };
}

export const oauthStore = createOAuthStore();
