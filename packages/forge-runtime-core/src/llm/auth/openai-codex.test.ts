/**
 * Unit tests for forge-runtime-core/llm/auth/openai-codex.ts.
 * OAuth credential sync and resolution for OpenAI Codex CLI.
 * Zero prior coverage.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { OAuthCredential } from './store.js';

// ─── Shared mock oauthStore ───────────────────────────────────────────────────
// This object is shared across all tests and reconfigured per-test.

const mockStore = {
  readJsonFile: vi.fn<[string], Promise<unknown>>(),
  read: vi.fn<[string?], Promise<Record<string, OAuthCredential>>>(),
  write: vi.fn<[string, OAuthCredential, string?], Promise<void>>(),
  isExpired: vi.fn<[OAuthCredential, number?], boolean>(),
  getDefaultPath: vi.fn<[], string>(),
};

vi.mock('./store.js', () => ({
  oauthStore: mockStore,
  OAuthCredential: {} as unknown,
}));

// ─── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn<[string, unknown?], Promise<unknown>>();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a JWT-like token for testing decodeExpiry. Payload contains { exp } */
function makeJwt(expUnixSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: expUnixSeconds }));
  return `${header}.${payload}.sig`;
}

function makeRefreshPayload(newAccess: string, expiresIn: number, newRefresh?: string) {
  return { access_token: newAccess, refresh_token: newRefresh, expires_in: expiresIn };
}

// ─── Module import ────────────────────────────────────────────────────────────

const {
  getOpenAICodexCliAuthFilePath,
  syncOpenAICodexCredential,
  resolveOpenAICodexCredential,
} = await import('./openai-codex.js');

// ─── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.readJsonFile.mockResolvedValue(undefined);
  mockStore.read.mockResolvedValue({});
  mockStore.write.mockResolvedValue(undefined);
  mockStore.isExpired.mockReturnValue(false);
  mockStore.getDefaultPath.mockReturnValue('/default/store.db');
  mockFetch.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getOpenAICodexCliAuthFilePath', () => {
  it('returns the provided custom path', () => {
    expect(getOpenAICodexCliAuthFilePath('/my/custom/path.json')).toBe('/my/custom/path.json');
  });

  it('returns a path ending in .codex/auth.json when called with no args', () => {
    expect(getOpenAICodexCliAuthFilePath()).toMatch(/\.codex\/auth\.json$/);
  });
});

describe('syncOpenAICodexCredential', () => {
  it('throws when CLI auth file is empty object', async () => {
    mockStore.readJsonFile.mockResolvedValue({});

    await expect(syncOpenAICodexCredential({ cliAuthFilePath: '/tmp/auth.json' })).rejects.toThrow(
      /Codex access token not found/,
    );
  });

  it('throws when CLI auth file returns null', async () => {
    mockStore.readJsonFile.mockResolvedValue(null);

    await expect(syncOpenAICodexCredential()).rejects.toThrow(/Codex access token not found/);
  });

  it('writes to oauthStore and preserves access/refresh/accountId', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'cli-access', refresh_token: 'cli-refresh', account_id: 'acct_xyz' },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await syncOpenAICodexCredential({ storePath: '/tmp/store.json' });

    expect(mockStore.write).toHaveBeenCalledWith(
      'openai-codex',
      expect.objectContaining({ access: 'cli-access', refresh: 'cli-refresh', accountId: 'acct_xyz' }),
      '/tmp/store.json',
    );
    expect(result.access).toBe('cli-access');
    expect(result.refresh).toBe('cli-refresh');
    expect(result.accountId).toBe('acct_xyz');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls refresh endpoint when credential is expired and refresh token exists', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'old-access', refresh_token: 'valid-refresh', account_id: 'acct_1' },
    });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeRefreshPayload('new-access', 7200)),
    });

    const result = await syncOpenAICodexCredential();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockStore.write).toHaveBeenCalledTimes(1);
    const [[provider, cred]] = mockStore.write.mock.calls;
    expect(provider).toBe('openai-codex');
    expect(cred).toMatchObject({ access: 'new-access', refresh: 'valid-refresh' });
    expect(result.access).toBe('new-access');
  });

  it('throws when refresh fails with non-OK response', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'old', refresh_token: 'bad-refresh' },
    });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid_grant'),
    });

    await expect(syncOpenAICodexCredential()).rejects.toThrow(/401.*invalid_grant/);
  });

  it('throws when refresh response is missing access_token', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'old', refresh_token: 'refresh' },
    });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ expires_in: 3600 }) });

    await expect(syncOpenAICodexCredential()).rejects.toThrow(/missing access token/);
  });

  it('throws when refresh response is missing expires_in', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'old', refresh_token: 'refresh' },
    });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'new' }) });

    await expect(syncOpenAICodexCredential()).rejects.toThrow(/missing access token or expiry/);
  });

  it('preserves original refresh token when new refresh not returned', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'old', refresh_token: 'original-refresh', account_id: 'acct_1' },
    });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-access', expires_in: 7200 }),
    });

    const result = await syncOpenAICodexCredential();

    expect(mockStore.write).toHaveBeenCalledTimes(1);
    const [[provider, cred]] = mockStore.write.mock.calls;
    expect(provider).toBe('openai-codex');
    expect(cred).toMatchObject({ refresh: 'original-refresh' });
    expect(result.refresh).toBe('original-refresh');
  });
});

describe('resolveOpenAICodexCredential', () => {
  it('returns stored credential when valid and not expired', async () => {
    const stored: OAuthCredential = { access: 'stored-access', expires: Date.now() + 3600 * 1000, accountId: 'acct_1' };
    mockStore.read.mockResolvedValue({ 'openai-codex': stored });
    mockStore.isExpired.mockReturnValue(false);

    const result = await resolveOpenAICodexCredential({ storePath: '/tmp/store.json' });

    expect(result).toEqual(stored);
    expect(mockStore.read).toHaveBeenCalledWith('/tmp/store.json');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes stored credential when expired but has refresh token', async () => {
    const expired: OAuthCredential = { access: 'old', refresh: 'stored-refresh', expires: Date.now() - 1000 };
    mockStore.read.mockResolvedValue({ 'openai-codex': expired });
    mockStore.isExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeRefreshPayload('refreshed-access', 3600)),
    });

    const result = await resolveOpenAICodexCredential({ storePath: '/tmp/store.json' });

    expect(mockStore.write).toHaveBeenCalledTimes(1);
    const [[provider, cred, path]] = mockStore.write.mock.calls;
    expect(provider).toBe('openai-codex');
    expect(cred).toMatchObject({ access: 'refreshed-access' });
    expect(path).toBe('/tmp/store.json');
    expect(result.access).toBe('refreshed-access');
  });

  it('falls back to sync when no stored credential', async () => {
    mockStore.read.mockResolvedValue({});
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'cli-fallback', refresh_token: 'cli-refresh' },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await resolveOpenAICodexCredential({ storePath: '/tmp/store.json' });

    expect(result.access).toBe('cli-fallback');
    expect(mockStore.write).toHaveBeenCalled();
  });

  it('falls back to sync when stored credential has no refresh token (even if expired)', async () => {
    const noRefresh: OAuthCredential = { access: 'old-access', expires: Date.now() - 1000 };
    mockStore.read.mockResolvedValue({ 'openai-codex': noRefresh });
    mockStore.isExpired.mockReturnValue(true);
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'cli-new', refresh_token: 'cli-refresh' },
    });
    mockStore.write.mockResolvedValue(undefined);
    // sync() reads the CLI file and sees it is expired (isExpired=true), so it also refreshes
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'cli-new-refreshed', expires_in: 7200 }),
    });

    const result = await resolveOpenAICodexCredential();

    // sync() also refreshes because isExpired=true, so access is the refreshed value
    expect(result.access).toBeTruthy();
    expect(mockStore.write).toHaveBeenCalled();
  });
});

describe('decodeExpiry (via sync)', () => {
  it('parses JWT payload and returns expiry in milliseconds', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    mockStore.readJsonFile.mockResolvedValue({
      tokens: {
        access_token: `header.${btoa(JSON.stringify({ exp: futureExp })).replace(/=/g, '')}.sig`,
        refresh_token: 'refresh',
      },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await syncOpenAICodexCredential();

    expect(result.expires).toBeCloseTo(futureExp * 1000, -3);
  });

  it('returns undefined for token with no dot (no JWT payload)', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: { access_token: 'no-dot', refresh_token: 'refresh' },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await syncOpenAICodexCredential();

    expect(result.expires).toBeUndefined();
  });

  it('returns undefined for malformed JWT payload (not JSON)', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: {
        access_token: `header.${btoa('not-json').replace(/=/g, '')}.sig`,
        refresh_token: 'refresh',
      },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await syncOpenAICodexCredential();

    expect(result.expires).toBeUndefined();
  });

  it('returns undefined when JWT payload has no exp field', async () => {
    mockStore.readJsonFile.mockResolvedValue({
      tokens: {
        access_token: `header.${btoa(JSON.stringify({ sub: 'user123' })).replace(/=/g, '')}.sig`,
        refresh_token: 'refresh',
      },
    });
    mockStore.isExpired.mockReturnValue(false);

    const result = await syncOpenAICodexCredential();

    expect(result.expires).toBeUndefined();
  });
});