import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildOauthState } from './oauth-state';

// vi.hoisted: stable ref so vi.mock can access the same object
const { oauthStore } = vi.hoisted(() => ({
  oauthStore: {
    getDefaultPath: vi.fn(() => '/default/store.json'),
    read: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@forge-runtime/core', () => ({ oauthStore }));

vi.mock('../helpers.js', () => ({
  fsPathExists: vi.fn().mockResolvedValue(true),
}));

describe('buildOauthState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(oauthStore.getDefaultPath).mockReturnValue('/default/store.json');
    vi.mocked(oauthStore.read).mockResolvedValue({});
  });

  it('returns empty providers when store is empty', async () => {
    vi.mocked(oauthStore.read).mockResolvedValue({});
    const result = await buildOauthState();
    expect(result.providers).toHaveLength(0);
    expect(typeof result.storePath).toBe('string');
  });

  it('maps a single credential with all fields', async () => {
    vi.mocked(oauthStore.read).mockResolvedValue({
      openai: { accountId: 'acc_123', refresh: 'rt_abc', expires: 1_700_000_000_000 },
    });
    vi.mocked(oauthStore.getDefaultPath).mockReturnValue('/store.json');
    const result = await buildOauthState();
    expect(result.providers).toHaveLength(1);
    const p = result.providers[0];
    expect(p.providerId).toBe('openai');
    expect(p.synced).toBe(true);
    expect(p.hasRefresh).toBe(true);
    expect(p.expiresAt).toBe(1_700_000_000_000);
    expect(p.accountId).toBe('acc_123');
  });

  it('marks provider as not synced when accountId is missing', async () => {
    vi.mocked(oauthStore.read).mockResolvedValue({
      anthropic: { expires: 1_700_000_000_000, refresh: undefined, accountId: undefined },
    });
    const result = await buildOauthState();
    expect(result.providers[0].synced).toBe(false);
    expect(result.providers[0].hasRefresh).toBe(false);
    expect(result.providers[0].accountId).toBeNull();
  });

  it('returns null expiresAt when expires is missing', async () => {
    vi.mocked(oauthStore.read).mockResolvedValue({
      openai: { accountId: 'acc_1', refresh: 'rt', expires: undefined },
    });
    const result = await buildOauthState();
    expect(result.providers[0].expiresAt).toBeNull();
  });

  it('includes multiple providers in insertion order', async () => {
    vi.mocked(oauthStore.read).mockResolvedValue({
      openai: { accountId: 'a', refresh: 'r', expires: 1 },
      anthropic: { accountId: 'b', refresh: 'r', expires: 2 },
    });
    const result = await buildOauthState();
    expect(result.providers.map((p) => p.providerId)).toEqual(['openai', 'anthropic']);
  });
});
