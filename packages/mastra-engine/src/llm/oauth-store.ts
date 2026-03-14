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

type AuthStoreData = Partial<Record<ProviderId, OAuthCredential>>;

const oauthCredentialSchema = z.object({
  access: z.string(),
  refresh: z.string().optional(),
  expires: z.number().optional(),
  accountId: z.string().optional(),
});

export function defaultOAuthStorePath() {
  return path.join(os.homedir(), '.mastra-engine', 'oauth.json');
}

export function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readOAuthStore(storePath = defaultOAuthStorePath()): AuthStoreData {
  const store = readJsonFile(storePath);
  if (!store || typeof store !== 'object') {
    return {};
  }

  return store as AuthStoreData;
}

export function writeOAuthStore(provider: ProviderId, credential: OAuthCredential, storePath = defaultOAuthStorePath()) {
  const store = readOAuthStore(storePath);
  fs.mkdirSync(path.dirname(storePath), { recursive: true, mode: 0o700 });
  store[provider] = credential;
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  fs.chmodSync(storePath, 0o600);
}

export function readOAuthCredentialFile(filePath: string): OAuthCredential {
  const raw = fs.readFileSync(filePath, 'utf8').trim();

  if (raw.startsWith('{')) {
    return oauthCredentialSchema.parse(JSON.parse(raw));
  }

  return { access: raw };
}

export function isExpiredOAuthCredential(credential: OAuthCredential, skewMs = 60_000) {
  if (!credential.expires) {
    return false;
  }

  return Date.now() + skewMs >= credential.expires;
}
