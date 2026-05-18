import { describe, expect, it, vi, beforeEach } from 'vitest';

import type {Database} from '../database/index';
import { createAdminReadModel } from './read-model';

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

function makeMockDb(appliedMigrations: Array<{ id: number; hash: string; createdAt: number }> = []) {
  return {
    all: vi.fn().mockResolvedValue(appliedMigrations),
  } as unknown as Database;
}

function makeInput(db: Database) {
  return {
    db,
    workspaceBasePath: '/tmp/test-workspace',
    githubApps: { getInstalledApps: vi.fn().mockResolvedValue([]) } as never,
    internalChat: { getConversations: vi.fn().mockResolvedValue([]) } as never,
  };
}

describe('createAdminReadModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApplicationMigrations', () => {
    it('returns empty applied list when no migrations have run', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        entries: [
          { idx: 1, when: 1710000000, tag: '0001_init' },
          { idx: 2, when: 1710100000, tag: '0002_add_agents' },
        ],
      }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([])));
      const result = await readModel.getApplicationMigrations();

      expect(result.applied).toEqual([]);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({
        idx: 1,
        tag: '0001_init',
        applied: false,
        hash: null,
        rowId: null,
      });
    });

    it('marks migration as applied when a matching row exists', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        entries: [
          { idx: 1, when: 1710000000, tag: '0001_init' },
        ],
      }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([
        { id: 5, hash: 'abc123def', createdAt: 1710000000 },
      ])));
      const result = await readModel.getApplicationMigrations();

      expect(result.entries[0]).toMatchObject({
        idx: 1,
        tag: '0001_init',
        applied: true,
        hash: 'abc123def',
        rowId: 5,
      });
    });

    it('maps db created_at column to createdAt field', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        entries: [
          { idx: 3, when: 1710200000, tag: '0003_add_roles' },
        ],
      }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([
        { id: 1, hash: 'xyz', createdAt: 1710200000 },
      ])));
      const result = await readModel.getApplicationMigrations();

      expect(result.entries[0].createdAt).toBe(1710200000);
    });

    it('marks only migrations with matching timestamp as applied', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        entries: [
          { idx: 1, when: 1710000000, tag: '0001_init' },
          { idx: 2, when: 1710100000, tag: '0002_add_agents' },
        ],
      }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([
        { id: 1, hash: 'hash1', createdAt: 1710000000 },
      ])));
      const result = await readModel.getApplicationMigrations();

      expect(result.entries[0].applied).toBe(true);
      expect(result.entries[1].applied).toBe(false);
    });

    it('preserves entry idx and tag from journal', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        entries: [
          { idx: 5, when: 1710500000, tag: '0005_complex_migration' },
        ],
      }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([])));
      const result = await readModel.getApplicationMigrations();

      expect(result.entries[0].idx).toBe(5);
      expect(result.entries[0].tag).toBe('0005_complex_migration');
    });

    it('handles empty journal entries', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ entries: [] }));

      const readModel = createAdminReadModel(makeInput(makeMockDb([])));
      const result = await readModel.getApplicationMigrations();

      expect(result.entries).toEqual([]);
      expect(result.applied).toEqual([]);
    });

    it('re-throws when journal file read fails', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const readModel = createAdminReadModel(makeInput(makeMockDb([])));
      await expect(readModel.getApplicationMigrations()).rejects.toThrow('ENOENT');
    });

    it('re-throws when db query fails', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ entries: [] }));

      const failingDb = { all: vi.fn().mockRejectedValue(new Error('DB connection failed')) } as unknown as Database;
      const readModel = createAdminReadModel(makeInput(failingDb));
      await expect(readModel.getApplicationMigrations()).rejects.toThrow('DB connection failed');
    });
  });
});