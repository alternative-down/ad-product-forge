import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

import {
  defaultOAuthStorePath,
  isExpiredOAuthCredential,
  readJsonFile,
  readOAuthStore,
  writeOAuthStore,
  type OAuthCredential,
} from './oauth-store';

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';

const openAICliAuthSchema = z.object({
  tokens: z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      account_id: z.string().optional(),
    })
    .optional(),
});

function decodeTokenExpiry(token: string) {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return undefined;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const data = z.object({ exp: z.number().optional() }).parse(JSON.parse(decoded));
    return data.exp ? data.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function readCodexCliAuth(authFilePath = path.join(os.homedir(), '.codex', 'auth.json')): OAuthCredential {
  const auth = openAICliAuthSchema.parse(readJsonFile(authFilePath) ?? {});
  const access = auth.tokens?.access_token;

  if (!access) {
    throw new Error(`Codex access token not found in ${authFilePath}`);
  }

  return {
    access,
    refresh: auth.tokens?.refresh_token,
    expires: decodeTokenExpiry(access),
    accountId: auth.tokens?.account_id,
  };
}

async function refreshOpenAICodexCredential(credential: OAuthCredential): Promise<OAuthCredential> {
  if (!credential.refresh) {
    throw new Error('OpenAI Codex refresh token missing.');
  }

  const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credential.refresh,
      client_id: OPENAI_CODEX_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI Codex token refresh failed: ${response.status} ${text}`.trim());
  }

  const payload = z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      expires_in: z.number().optional(),
    })
    .parse(await response.json());

  if (!payload.access_token || payload.expires_in === undefined) {
    throw new Error('OpenAI Codex refresh response missing access token or expiry.');
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token || credential.refresh,
    expires: Date.now() + payload.expires_in * 1000,
    accountId: credential.accountId,
  };
}

export async function resolveOpenAICodexCredential(options?: {
  cliAuthFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? defaultOAuthStorePath();
  const stored = readOAuthStore(storePath)['openai-codex'];

  if (stored && !isExpiredOAuthCredential(stored)) {
    return stored;
  }

  if (stored?.refresh && isExpiredOAuthCredential(stored)) {
    const refreshed = await refreshOpenAICodexCredential(stored);
    writeOAuthStore('openai-codex', refreshed, storePath);
    return refreshed;
  }

  let credential = readCodexCliAuth(options?.cliAuthFilePath);
  if (credential.refresh && isExpiredOAuthCredential(credential)) {
    credential = await refreshOpenAICodexCredential(credential);
  }

  writeOAuthStore('openai-codex', credential, storePath);
  return credential;
}
