import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Database } from '../database';

// Hoist mocks to module scope so vi.mock factories can reference them
const { accessMock, rmMock } = vi.hoisted(() => {
  return {
    accessMock: vi.fn(),
    rmMock: vi.fn(),
  };
});

const forgeDebugMock = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: forgeDebugMock,
}));

vi.mock('node:fs/promises', () => ({
  default: { access: accessMock, rm: rmMock },
  access: accessMock,
  rm: rmMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  forgeDebugMock.mockReset();
});

function createMockDb() {
  const findManyMock = vi.fn();
  const updateMock = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  }));

  return {
    query: {
      agents: {
        findMany: findManyMock,
      },
    },
    update: updateMock,
  } as unknown as Database;
}

describe('agent-embedder-maintenance', () => {
  describe('prepareAgentEmbeddersForStartup', () => {
    it('skips agents with non-fastembed workspaceEmbedder', async () => {
      const mockDb = createMockDb();
      mockDb.query.agents.findMany.mockResolvedValue([
        { id: 'agent-1', workspaceEmbedder: 'transformers-multilingual-e5-small-cpu' },
        { id: 'agent-2', workspaceEmbedder: 'some-other-embedder' },
      ]);

      const { prepareAgentEmbeddersForStartup } = await import('./agent-embedder-maintenance');
      await prepareAgentEmbeddersForStartup({
        db: mockDb,
        workspaceBasePath: '/tmp/workspaces',
      });

      expect(mockDb.query.agents.findMany).toHaveBeenCalled();
      // No fastembed agents, so no update
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(accessMock).not.toHaveBeenCalled();
    });

    it('resets indexes and updates db for agents with fastembed', async () => {
      const mockDb = createMockDb();
      mockDb.query.agents.findMany.mockResolvedValue([
        { id: 'agent-fast', workspaceEmbedder: 'fastembed' },
      ]);
      // All DBs exist
      accessMock.mockResolvedValue(undefined);
      rmMock.mockResolvedValue(undefined);

      const { prepareAgentEmbeddersForStartup } = await import('./agent-embedder-maintenance');
      await prepareAgentEmbeddersForStartup({
        db: mockDb,
        workspaceBasePath: '/tmp/workspaces',
      });

      // Should try to access all 3 DBs per agent
      expect(accessMock).toHaveBeenCalledTimes(3);
      // Should delete memory and recall DBs (not database.db)
      expect(rmMock).toHaveBeenCalledTimes(2);
      // Should update the agent's embedder
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('handles agents with fastembed whose DB files do not exist', async () => {
      const mockDb = createMockDb();
      mockDb.query.agents.findMany.mockResolvedValue([
        { id: 'agent-missing', workspaceEmbedder: 'fastembed' },
      ]);
      // No files exist — access rejects
      accessMock.mockRejectedValue(new Error('ENOENT'));

      const { prepareAgentEmbeddersForStartup } = await import('./agent-embedder-maintenance');
      await prepareAgentEmbeddersForStartup({
        db: mockDb,
        workspaceBasePath: '/tmp/workspaces',
      });

      // Should still update the embedder even if DB files missing
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('processes multiple fastembed agents', async () => {
      const mockDb = createMockDb();
      mockDb.query.agents.findMany.mockResolvedValue([
        { id: 'agent-a', workspaceEmbedder: 'fastembed' },
        { id: 'agent-b', workspaceEmbedder: 'fastembed' },
        { id: 'agent-c', workspaceEmbedder: 'fastembed' },
      ]);
      accessMock.mockResolvedValue(undefined);
      rmMock.mockResolvedValue(undefined);

      const { prepareAgentEmbeddersForStartup } = await import('./agent-embedder-maintenance');
      await prepareAgentEmbeddersForStartup({
        db: mockDb,
        workspaceBasePath: '/tmp/workspaces',
      });

      // 3 agents × 3 DBs each = 9 access calls
      expect(accessMock).toHaveBeenCalledTimes(9);
      // 3 agents × 2 deletions each = 6 rm calls
      expect(rmMock).toHaveBeenCalledTimes(6);
      // 3 agents × 1 update each = 3 update calls
      expect(mockDb.update).toHaveBeenCalledTimes(3);
    });

    it('calls forgeDebug when access check fails', async () => {
      const mockDb = createMockDb();
      mockDb.query.agents.findMany.mockResolvedValue([
        { id: 'agent-err', workspaceEmbedder: 'fastembed' },
      ]);
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      accessMock.mockRejectedValue(enoent);

      const { prepareAgentEmbeddersForStartup } = await import('./agent-embedder-maintenance');
      await prepareAgentEmbeddersForStartup({
        db: mockDb,
        workspaceBasePath: '/tmp/workspaces',
      });

      expect(forgeDebugMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'agent-embedder-maintenance',
          level: 'error',
          message: expect.stringContaining('access'),
        }),
      );
    });
  });

  describe('resetAgentEmbedderIndexes', () => {
    it('resets all three database files for an agent', async () => {
      accessMock.mockResolvedValue(undefined);
      rmMock.mockResolvedValue(undefined);

      const { resetAgentEmbedderIndexes } = await import('./agent-embedder-maintenance');
      await resetAgentEmbedderIndexes('/tmp/workspaces', 'agent-xyz');

      expect(accessMock).toHaveBeenCalledTimes(3);
      expect(rmMock).toHaveBeenCalledTimes(2); // memory and recall DBs, not database.db
    });

    it('does not delete database.db even when it exists', async () => {
      accessMock.mockResolvedValue(undefined);
      rmMock.mockResolvedValue(undefined);

      const { resetAgentEmbedderIndexes } = await import('./agent-embedder-maintenance');
      await resetAgentEmbedderIndexes('/tmp/workspaces', 'agent-xyz');

      // Verify database.db path was checked but not passed to rm
      const databaseDbAccessCall = accessMock.mock.calls.find(([p]: [string]) =>
        (p as string).endsWith('database.db'),
      );
      expect(databaseDbAccessCall).toBeDefined();
      // rm should only be called with memory-recall.db and memory.db
      for (const call of rmMock.mock.calls) {
        expect(call[0] as string).not.toContain('database.db');
      }
    });

    it('succeeds when memory DB files do not exist', async () => {
      accessMock.mockRejectedValue(new Error('ENOENT'));

      const { resetAgentEmbedderIndexes } = await import('./agent-embedder-maintenance');
      // Should not throw
      await expect(
        resetAgentEmbedderIndexes('/tmp/workspaces', 'agent-xyz'),
      ).resolves.not.toThrow();
    });
  });
});
