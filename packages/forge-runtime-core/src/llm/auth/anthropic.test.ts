import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module for setup token file reads
const mockReadFileSync = vi.fn();
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    default: { ...actual, readFileSync: mockReadFileSync },
    readFileSync: mockReadFileSync,
    promises: actual.promises,
  };
});

const mocks = {
  isExpired: vi.fn().mockReturnValue(false),
  read: vi.fn().mockResolvedValue({}),
  write: vi.fn().mockResolvedValue(undefined),
  readJsonFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  readCredentialFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
};

// Store the original module reference for proper mocking
let storeModule: typeof import('./store.js');

vi.mock('./store.js', async () => {
  storeModule = await vi.importActual<typeof import('./store.js')>('./store.js');
  return {
    oauthStore: {
      ...storeModule.oauthStore,
      read: (...args: unknown[]) => mocks.read(...args),
      write: (...args: unknown[]) => mocks.write(...args),
      isExpired: (...args: unknown[]) => mocks.isExpired(...args),
      readJsonFile: (...args: unknown[]) => mocks.readJsonFile(...args),
      readCredentialFile: (...args: unknown[]) => mocks.readCredentialFile(...args),
    },
  };
});

const fsActual = await import('node:fs');

const { getAnthropicCliAuthFilePath, getAnthropicSetupTokenFilePath, syncAnthropicCredential, resolveAnthropicCredential } = await import('./anthropic.js');

describe('Anthropic OAuth', () => {
  const tmpDir = path.join(os.tmpdir(), `forge-test-anthropic-${Date.now()}`);

  beforeEach(() => {
    vi.restoreAllMocks();
    mockReadFileSync.mockReset();
    mocks.isExpired = vi.fn().mockReturnValue(false);
    mocks.read = vi.fn().mockResolvedValue({});
    mocks.write = vi.fn().mockResolvedValue(undefined);
    mocks.readJsonFile = vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mocks.readCredentialFile = vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  afterEach(async () => {
    await fsActual.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('getAnthropicCliAuthFilePath', () => {
    it('returns path inside ~/.claude/.credentials.json by default', () => {
      const result = getAnthropicCliAuthFilePath();
      expect(result).toContain('.claude');
      expect(result).toContain('.credentials.json');
    });

    it('returns custom path when provided', () => {
      const custom = '/custom/path.json';
      expect(getAnthropicCliAuthFilePath(custom)).toBe(custom);
    });
  });

  describe('getAnthropicSetupTokenFilePath', () => {
    it('returns /tmp/claude_oauth_token by default', () => {
      expect(getAnthropicSetupTokenFilePath()).toBe('/tmp/claude_oauth_token');
    });

    it('returns custom path when provided', () => {
      const custom = '/custom/token';
      expect(getAnthropicSetupTokenFilePath(custom)).toBe(custom);
    });
  });

  describe('syncAnthropicCredential', () => {
    it('reads from setup token file when present', async () => {
      const setupPath = path.join(tmpDir, 'setup_token');
      await fsActual.promises.mkdir(tmpDir, { recursive: true });
      await fsActual.promises.writeFile(setupPath, 'setup-token-123');

      // Mock fs.readFileSync to return the setup token content
      mockReadFileSync.mockReturnValueOnce('setup-token-123');

      const cred = await syncAnthropicCredential({ setupTokenFilePath: setupPath });

      expect(cred.access).toBe('setup-token-123');
      expect(mocks.write).toHaveBeenCalled();
    });

    it('throws when setup token file is empty', async () => {
      const setupPath = path.join(tmpDir, 'empty_token');
      await fsActual.promises.mkdir(tmpDir, { recursive: true });
      await fsActual.promises.writeFile(setupPath, '');

      mockReadFileSync.mockReturnValueOnce('');

      // The fallback to auth file also fails because readJsonFile is mocked to fail
      // This test verifies behavior when both paths fail
      await expect(syncAnthropicCredential({ setupTokenFilePath: setupPath })).rejects.toThrow();
    });

    it('throws when setup token file not found and auth file also not found', async () => {
      const setupPath = path.join(tmpDir, 'missing_setup');
      mockReadFileSync.mockImplementationOnce(() => {
        const e = new Error('ENOENT') as Error & { code: string };
        e.code = 'ENOENT';
        throw e;
      });

      // Both setup token and auth file fail, so catch block throws whatever it encounters
      await expect(syncAnthropicCredential({ setupTokenFilePath: setupPath })).rejects.toThrow();
    });

    it('falls back to CLI auth file when setup token missing', async () => {
      const cliAuthContent = JSON.stringify({
        claudeAiOauth: { accessToken: 'cli-access', refreshToken: 'cli-refresh', expiresAt: 9999999999999 },
      });

      // First call: setup token not found (throws), Second call: CLI auth file read
      mockReadFileSync
        .mockImplementationOnce(() => {
          const e = new Error('ENOENT') as Error & { code: string };
          e.code = 'ENOENT';
          throw e;
        })
        .mockReturnValueOnce(cliAuthContent);

      mocks.readJsonFile.mockResolvedValue(JSON.parse(cliAuthContent));

      const cred = await syncAnthropicCredential({ storePath: path.join(tmpDir, 'agents.db') });

      expect(cred.access).toBe('cli-access');
      expect(cred.refresh).toBe('cli-refresh');
    });
  });

  describe('resolveAnthropicCredential', () => {
    it('returns stored credential if not expired', async () => {
      mocks.read.mockResolvedValue({
        anthropic: { access: 'stored-access', refresh: 'ref', expires: Date.now() + 60000 },
      });

      const cred = await resolveAnthropicCredential();

      expect(cred.access).toBe('stored-access');
    });

    it('refreshes stored credential if expired but has refresh token', async () => {
      mocks.read.mockResolvedValue({
        anthropic: { access: 'old', refresh: 'valid-refresh', expires: Date.now() - 1000 },
      });
      mocks.isExpired.mockReturnValue(true);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'refreshed', refresh_token: 'new-refresh', expires_in: 3600 }),
      });
      global.fetch = fetchMock;

      const cred = await resolveAnthropicCredential();

      expect(cred.access).toBe('refreshed');
      expect(mocks.write).toHaveBeenCalledWith('anthropic', cred, expect.any(String));
    });

    it('falls back to auth file when no stored credential and authFilePath provided', async () => {
      mocks.read.mockResolvedValue({});
      mocks.readCredentialFile.mockResolvedValue({
        access: 'file-access',
        refresh: 'file-refresh',
        expires: Date.now() + 60000,
      });

      const cred = await resolveAnthropicCredential({ authFilePath: '/some/path' });

      expect(cred.access).toBe('file-access');
    });

    it('falls back to sync when no store, no auth file', async () => {
      mocks.read.mockResolvedValue({});
      const setupPath = path.join(tmpDir, 'setup2');
      await fsActual.promises.mkdir(tmpDir, { recursive: true });
      await fsActual.promises.writeFile(setupPath, 'setup-token');

      mockReadFileSync.mockReturnValueOnce('setup-token');

      const cred = await resolveAnthropicCredential({ setupTokenFilePath: setupPath });

      expect(cred.access).toBe('setup-token');
    });
  });
});
