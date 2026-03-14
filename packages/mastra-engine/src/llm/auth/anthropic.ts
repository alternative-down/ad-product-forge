import fs from 'node:fs';

import { z } from 'zod';

import { oauthStore, type OAuthCredential } from './store';

const ANTHROPIC_CLIENT_ID = Buffer.from('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString('utf8');
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';

export async function resolveAnthropicCredential(options?: {
  authFilePath?: string;
  setupTokenFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? oauthStore.getDefaultPath();
  const stored = oauthStore.read(storePath).anthropic;

  function readSetupToken() {
    const filePath = options?.setupTokenFilePath ?? '/tmp/claude_oauth_token';
    const access = fs.readFileSync(filePath, 'utf8').trim();

    if (!access) {
      throw new Error(`Claude setup token not found in ${filePath}`);
    }

    return { access } satisfies OAuthCredential;
  }

  async function refresh(credential: OAuthCredential) {
    if (!credential.refresh) {
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

  if (stored && !oauthStore.isExpired(stored)) {
    return stored;
  }

  if (stored?.refresh && oauthStore.isExpired(stored)) {
    const credential = await refresh(stored);
    oauthStore.write('anthropic', credential, storePath);
    return credential;
  }

  if (options?.authFilePath) {
    let credential = oauthStore.readCredentialFile(options.authFilePath);

    if (credential.refresh && oauthStore.isExpired(credential)) {
      credential = await refresh(credential);
    }

    if (credential.refresh) {
      oauthStore.write('anthropic', credential, storePath);
    }

    return credential;
  }

  return readSetupToken();
}
