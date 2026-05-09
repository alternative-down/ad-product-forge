import os from 'node:os';
import path from 'node:path';
import { logger } from "../../logger.js";

import { z } from 'zod';

import { oauthStore, type OAuthCredential } from './store';

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const codexCliAuthSchema = z.object({
  tokens: z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      account_id: z.string().optional(),
    })
    .optional(),
});

export function getOpenAICodexCliAuthFilePath(filePath = path.join(os.homedir(), '.codex', 'auth.json')) {
  return filePath;
}

function decodeExpiry(token: string) {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return undefined;
    }

    const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const result = z.object({ exp: z.number().optional() }).parse(JSON.parse(decoded));
    return result.exp ? result.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function refresh(credential: OAuthCredential) {
  if (!credential.refresh) {
        logger.warn("auth", "refresh: OpenAI Codex refresh token missing");
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
  } satisfies OAuthCredential;
}

export async function syncOpenAICodexCredential(options?: {
  cliAuthFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? oauthStore.getDefaultPath();
  const filePath = options?.cliAuthFilePath ?? getOpenAICodexCliAuthFilePath();
  const auth = codexCliAuthSchema.parse(await oauthStore.readJsonFile(filePath) ?? {});
  const access = auth.tokens?.access_token;

  if (!access) {
    throw new Error(`Codex access token not found in ${filePath}`);
  }

  let credential = {
    access,
    refresh: auth.tokens?.refresh_token,
    expires: decodeExpiry(access),
    accountId: auth.tokens?.account_id,
  } satisfies OAuthCredential;

  if (credential.refresh && oauthStore.isExpired(credential)) {
    credential = await refresh(credential);
  }

  await oauthStore.write('openai-codex', credential, storePath);
  return credential;
}

export async function resolveOpenAICodexCredential(options?: {
  cliAuthFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? oauthStore.getDefaultPath();
  const stored = (await oauthStore.read(storePath))['openai-codex'];

  if (stored && !oauthStore.isExpired(stored)) {
    return stored;
  }

  if (stored?.refresh && oauthStore.isExpired(stored)) {
    const credential = await refresh(stored);
    await oauthStore.write('openai-codex', credential, storePath);
    return credential;
  }

  return await syncOpenAICodexCredential(options);
}
