import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { createOAuthStore } from './store.js';

describe('oauthStore', () => {
  const store = createOAuthStore();
  const tmpDir = path.join(os.tmpdir(), `forge-test-store-${Date.now()}`);
  const storePath = path.join(tmpDir, 'agents.db');

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('getDefaultPath', () => {
    it('uses FORGE_DATA_PATH env var when set', () => {
      const prev = process.env.FORGE_DATA_PATH;
      process.env.FORGE_DATA_PATH = '/custom/data';
      const p = store.getDefaultPath();
      process.env.FORGE_DATA_PATH = prev ?? '';
      delete process.env.FORGE_DATA_PATH;
      expect(p).toBe(path.resolve('/custom/data', 'agents.db'));
    });
  });

  describe('readJsonFile', () => {
    it('returns null when file does not exist', async () => {
      const result = await store.readJsonFile(path.join(tmpDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('parses valid JSON file', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'data.json'), '{"key":"value"}');
      const result = await store.readJsonFile(path.join(tmpDir, 'data.json'));
      expect(result).toEqual({ key: 'value' });
    });

    it('throws when file contains invalid JSON', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'bad.json'), 'not json');
      await expect(store.readJsonFile(path.join(tmpDir, 'bad.json'))).rejects.toThrow(
        'Failed to parse JSON',
      );
    });
  });

  describe('readCredentialFile', () => {
    it('returns access token for bare string (CLI token)', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'token.txt'), 'bare-token-123');
      const result = await store.readCredentialFile(path.join(tmpDir, 'token.txt'));
      expect(result).toEqual({ access: 'bare-token-123' });
    });

    it('parses JSON credential file', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'cred.json'),
        JSON.stringify({ access: 'tok', refresh: 'ref', expires: 1234, accountId: 'acct1' }),
      );
      const result = await store.readCredentialFile(path.join(tmpDir, 'cred.json'));
      expect(result).toEqual({ access: 'tok', refresh: 'ref', expires: 1234, accountId: 'acct1' });
    });

    it('trim whitespace from bare tokens', async () => {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'token.txt'), '  bare-token-456  \n');
      const result = await store.readCredentialFile(path.join(tmpDir, 'token.txt'));
      expect(result).toEqual({ access: 'bare-token-456' });
    });
  });

  describe('isExpired', () => {
    it('returns false when no expiry is set', () => {
      expect(store.isExpired({ access: 'tok' })).toBe(false);
    });

    it('returns false when expiry is far in the future', () => {
      const farFuture = Date.now() + 10 * 60 * 1000;
      expect(store.isExpired({ access: 'tok', expires: farFuture })).toBe(false);
    });

    it('returns true when expiry is in the past', () => {
      const past = Date.now() - 60_000;
      expect(store.isExpired({ access: 'tok', expires: past })).toBe(true);
    });

    it('returns true when expiry is within skew window (default 60s)', () => {
      const soon = Date.now() + 30_000;
      expect(store.isExpired({ access: 'tok', expires: soon })).toBe(true);
    });

    it('skewMs parameter adjusts expiration window', () => {
      const in90s = Date.now() + 90_000;
      expect(store.isExpired({ access: 'tok', expires: in90s }, 120_000)).toBe(true);
      expect(store.isExpired({ access: 'tok', expires: in90s }, 60_000)).toBe(false);
    });
  });

  describe('read and write', () => {
    it('writes and reads a credential back', async () => {
      await store.write('openai-codex', { access: 'codex-tok', accountId: 'u1' }, storePath);
      const result = await store.read(storePath);
      expect(result['openai-codex']).toEqual({ access: 'codex-tok', accountId: 'u1' });
    });

    it('overwrites an existing credential on write', async () => {
      await store.write('openai-codex', { access: 'tok1' }, storePath);
      await store.write('openai-codex', { access: 'tok2' }, storePath);
      const result = await store.read(storePath);
      expect(result['openai-codex'].access).toBe('tok2');
    });

    it('handles missing rows gracefully in read', async () => {
      // read on empty store returns empty object matching schema
      const result = await store.read(storePath);
      expect(result).toEqual({});
    });
  });
});
