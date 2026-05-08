import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from "../../logger.js";

import { z } from 'zod';

import { oauthStore, type OAuthCredential } from './store';

const ANTHROPIC_CLIENT_ID = Buffer.from('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString('utf8');
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const claudeCliAuthSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
  }),
});
const DEFAULT_ANTHROPIC_SETUP_TOKEN_FILE_PATH = '/tmp/claude_oauth_token';

export function getAnthropicCliAuthFilePath(filePath = path.join(os.homedir(), '.claude', '.credentials.json')) {
  return filePath;
}

export function getAnthropicSetupTokenFilePath(filePath = DEFAULT_ANTHROPIC_SETUP_TOKEN_FILE_PATH) {
  return filePath;
}

async function refresh(credential: OAuthCredential) {
  if (!credential.refresh) {
        logger.warn("auth", "refresh: Anthropic refresh token missing");
    throw new Error('Anthropic refresh token missing.');
  }

  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: credential.refresh,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Anthropic token refresh failed: ${response.status} ${text}`.trim());
  }

  const payload = z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      expires_in: z.number().optional(),
    })
    .parse(await response.json());

  if (!payload.access_token || payload.expires_in === undefined) {
    throw new Error('Anthropic refresh response missing access token or expiry.');
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token || credential.refresh,
    expires: Date.now() + payload.expires_in * 1000 - 5 * 60 * 1000,
  } satisfies OAuthCredential;
}

export async function syncAnthropicCredential(options?: {
  setupTokenFilePath?: string;
  authFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? oauthStore.getDefaultPath();
  const setupTokenFilePath = options?.setupTokenFilePath ?? getAnthropicSetupTokenFilePath();

  try {
    const access = fs.readFileSync(setupTokenFilePath, 'utf8').trim();

    if (!access) {
      throw new Error(`Claude setup token not found in ${setupTokenFilePath}`);
    }

    const credential = { access } satisfies OAuthCredential;
    await oauthStore.write('anthropic', credential, storePath);
    return credential;
  } catch {
    const authFilePath = options?.authFilePath ?? getAnthropicCliAuthFilePath();
    const payload = claudeCliAuthSchema.parse(await oauthStore.readJsonFile(authFilePath));
    let credential = {
      access: payload.claudeAiOauth.accessToken,
      refresh: payload.claudeAiOauth.refreshToken,
      expires: payload.claudeAiOauth.expiresAt,
    } satisfies OAuthCredential;

    if (credential.refresh && oauthStore.isExpired(credential)) {
      credential = await refresh(credential);
    }

    await oauthStore.write('anthropic', credential, storePath);
    return credential;
  }
}

export async function resolveAnthropicCredential(options?: {
  authFilePath?: string;
  setupTokenFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? oauthStore.getDefaultPath();
  const stored = (await oauthStore.read(storePath)).anthropic;

  if (stored && !oauthStore.isExpired(stored)) {
    return stored;
  }

  if (stored?.refresh && oauthStore.isExpired(stored)) {
    const credential = await refresh(stored);
    await oauthStore.write('anthropic', credential, storePath);
    return credential;
  }

  if (options?.authFilePath) {
    let credential = await oauthStore.readCredentialFile(options.authFilePath);

    if (credential.refresh && oauthStore.isExpired(credential)) {
      credential = await refresh(credential);
    }

    if (credential.refresh) {
      await oauthStore.write('anthropic', credential, storePath);
    }

    return credential;
  }

  return syncAnthropicCredential({
    setupTokenFilePath: options?.setupTokenFilePath,
    authFilePath: options?.authFilePath,
    storePath,
  });
}
