import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';

const ANTHROPIC_CLIENT_ID = Buffer.from('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString('utf8');
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';

export type ProviderId = 'openai-codex' | 'anthropic';

export type OAuthCredential = {
  access: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

type AuthStoreData = Partial<Record<ProviderId, OAuthCredential>>;

type OpenAICliAuthFile = {
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
};

function defaultStorePath() {
  return path.join(os.homedir(), '.mastra-engine', 'oauth.json');
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  fs.chmodSync(filePath, 0o600);
}

function decodeJwtPayload(token: string) {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeTokenExpiry(token: string) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : undefined;
}

function isExpired(credential: OAuthCredential, skewMs = 60_000) {
  if (!credential.expires) return false;
  return Date.now() + skewMs >= credential.expires;
}

function readStore(storePath = defaultStorePath()): AuthStoreData {
  return readJsonFile<AuthStoreData>(storePath) ?? {};
}

function writeStore(provider: ProviderId, credential: OAuthCredential, storePath = defaultStorePath()) {
  const current = readStore(storePath);
  current[provider] = credential;
  writeJsonFile(storePath, current);
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

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || typeof payload.expires_in !== 'number') {
    throw new Error('OpenAI Codex refresh response missing access token or expiry.');
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token || credential.refresh,
    expires: Date.now() + payload.expires_in * 1000,
    accountId: credential.accountId,
  };
}

async function refreshAnthropicCredential(credential: OAuthCredential): Promise<OAuthCredential> {
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

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || typeof payload.expires_in !== 'number') {
    throw new Error('Anthropic refresh response missing access token or expiry.');
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token || credential.refresh,
    expires: Date.now() + payload.expires_in * 1000 - 5 * 60 * 1000,
  };
}

export function readCodexCliAuth(authFilePath = path.join(os.homedir(), '.codex', 'auth.json')): OAuthCredential {
  const auth = readJsonFile<OpenAICliAuthFile>(authFilePath);
  const access = auth?.tokens?.access_token;

  if (!access) {
    throw new Error(`Codex access token not found in ${authFilePath}`);
  }

  return {
    access,
    refresh: auth?.tokens?.refresh_token,
    expires: decodeTokenExpiry(access),
    accountId: auth?.tokens?.account_id,
  };
}

export function readAnthropicSetupToken(tokenFilePath = '/tmp/claude_oauth_token'): OAuthCredential {
  const access = fs.readFileSync(tokenFilePath, 'utf8').trim();
  if (!access) {
    throw new Error(`Claude setup token not found in ${tokenFilePath}`);
  }

  return { access };
}

export function readOAuthCredentialFile(filePath: string): OAuthCredential {
  const raw = fs.readFileSync(filePath, 'utf8').trim();

  if (raw.startsWith('{')) {
    const credential = JSON.parse(raw) as OAuthCredential;
    if (!credential.access) {
      throw new Error(`OAuth credential file ${filePath} is missing "access".`);
    }
    return credential;
  }

  return { access: raw };
}

export async function resolveOpenAICodexCredential(options?: {
  cliAuthFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? defaultStorePath();
  const stored = readStore(storePath)['openai-codex'];

  if (stored && !isExpired(stored)) {
    return stored;
  }

  if (stored?.refresh && isExpired(stored)) {
    const refreshed = await refreshOpenAICodexCredential(stored);
    writeStore('openai-codex', refreshed, storePath);
    return refreshed;
  }

  let credential = readCodexCliAuth(options?.cliAuthFilePath);
  if (isExpired(credential) && credential.refresh) {
    credential = await refreshOpenAICodexCredential(credential);
  }

  writeStore('openai-codex', credential, storePath);
  return credential;
}

export async function resolveAnthropicCredential(options?: {
  authFilePath?: string;
  setupTokenFilePath?: string;
  storePath?: string;
}): Promise<OAuthCredential> {
  const storePath = options?.storePath ?? defaultStorePath();
  const stored = readStore(storePath).anthropic;

  if (stored && !isExpired(stored)) {
    return stored;
  }

  if (stored?.refresh && isExpired(stored)) {
    const refreshed = await refreshAnthropicCredential(stored);
    writeStore('anthropic', refreshed, storePath);
    return refreshed;
  }

  if (options?.authFilePath) {
    const credential = readOAuthCredentialFile(options.authFilePath);
    if (credential.refresh && isExpired(credential)) {
      const refreshed = await refreshAnthropicCredential(credential);
      writeStore('anthropic', refreshed, storePath);
      return refreshed;
    }
    if (credential.refresh) {
      writeStore('anthropic', credential, storePath);
    }
    return credential;
  }

  return readAnthropicSetupToken(options?.setupTokenFilePath);
}
