import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../../database/schema', () => ({
  agentLongTermMemoryStates: {},
  agentLongTermMemoryRecallStates: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

const persistentMocks = {
  ltmStateFindFirst: vi.fn().mockResolvedValue(null),
  ltmRecallFindFirst: vi.fn().mockResolvedValue(null),
  insertChain: vi.fn(),
};

function resetMocks() {
  persistentMocks.ltmStateFindFirst.mockReset().mockResolvedValue(null);
  persistentMocks.ltmRecallFindFirst.mockReset().mockResolvedValue(null);
  persistentMocks.insertChain.mockReset();
  persistentMocks.insertChain.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        target: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  });
}

function createMockDb() {
  return {
    query: {
      agentLongTermMemoryStates: {
        findFirst: persistentMocks.ltmStateFindFirst,
      },
      agentLongTermMemoryRecallStates: {
        findFirst: persistentMocks.ltmRecallFindFirst,
      },
    },
    insert: persistentMocks.insertChain,
  };
}

import { createAgentLongTermMemoryStore } from './store';

describe('createAgentLongTermMemoryStore', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('readState', () => {
    it('returns parsed state when DB row has valid state', async () => {
      const state = { version: 1, packages: [], lastWrittenPackageId: null, lastWrittenAt: null, lastRunAt: null, lastRunError: null, lastRunErrorAt: null, updatedAt: '2024-01-01T00:00:00.000Z' };
      persistentMocks.ltmStateFindFirst.mockResolvedValueOnce({ state });
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });

      const result = await store.readState();

      expect(result.version).toBe(1);
      expect(result.packages).toEqual([]);
    });

    it('throws and logs on database error', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      persistentMocks.ltmStateFindFirst.mockRejectedValueOnce(new Error('DB error'));
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });

      await expect(store.readState()).rejects.toThrow('DB error');
      expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'ltm',
        message: 'Failed to read LTM state',
      }));
    });
  });

  describe('writeState', () => {
    it('resolves with the state on success', async () => {
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const state = { version: 1, packages: [], lastWrittenPackageId: null, lastWrittenAt: null, lastRunAt: null, lastRunError: null, lastRunErrorAt: null, updatedAt: '2024-01-01T00:00:00.000Z' };

      const result = await store.writeState(state);

      expect(result).toEqual(expect.objectContaining({ version: 1 }));
    });

    it('throws on query error', async () => {
      const db = createMockDb();
      persistentMocks.ltmStateFindFirst.mockRejectedValueOnce(new Error('Query failed'));
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const state = { version: 1, packages: [], lastWrittenPackageId: null, lastWrittenAt: null, lastRunAt: null, lastRunError: null, lastRunErrorAt: null, updatedAt: '2024-01-01T00:00:00.000Z' };

      await expect(store.writeState(state)).rejects.toThrow('Query failed');
    });
  });

  describe('readRecallState', () => {
    it('returns parsed recall state when DB row has valid snapshot and history', async () => {
      const snapshot = { status: 'hit', query: 'test', resultIds: ['r1'], resultCount: 1, resultScores: [0.9], graphHit: true, stepsJson: '{}', updatedAt: '2024-01-01T00:00:00.000Z', lastInitAt: null, searchMode: 'vector', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 10, indexPaths: [], workspaceFileCount: 1, memoryFileCount: 1, checkpointFileCount: 0, error: null };
      const history = { recentFingerprints: ['fp1'], updatedAt: '2024-01-01T00:00:00.000Z' };
      persistentMocks.ltmRecallFindFirst.mockResolvedValueOnce({
        threadId: 'thread-1',
        resourceId: 'res-1',
        snapshot,
        history,
      });
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });

      const result = await store.readRecallState();

      expect(result.threadId).toBe('thread-1');
      expect(result.resourceId).toBe('res-1');
      expect(result.snapshot).not.toBeNull();
      expect(result.history).not.toBeNull();
    });

    it('returns null snapshot and history when row is null', async () => {
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });

      const result = await store.readRecallState();

      expect(result.threadId).toBeNull();
      expect(result.snapshot).toBeNull();
      expect(result.history).toBeNull();
    });

    it('logs and throws on database error', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      persistentMocks.ltmRecallFindFirst.mockRejectedValueOnce(new Error('Recall error'));
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });

      await expect(store.readRecallState()).rejects.toThrow('Recall error');
      expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'ltm',
        message: 'Failed to read recall state',
      }));
    });
  });

  describe('writeRecallState', () => {
    it('resolves without throwing', async () => {
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const snapshot = { status: 'hit' as const, query: 'test', resultIds: ['r1'], resultCount: 1, resultScores: [0.9], graphHit: true, stepsJson: '{}', updatedAt: '2024-01-01T00:00:00.000Z', lastInitAt: null, searchMode: 'vector', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 10, indexPaths: [], workspaceFileCount: 1, memoryFileCount: 1, checkpointFileCount: 0, error: null };

      await expect(store.writeRecallState({ threadId: 'thread-1', snapshot })).resolves.toBeUndefined();
    });

    it('throws on query error during write', async () => {
      persistentMocks.ltmRecallFindFirst.mockRejectedValueOnce(new Error('Write query failed'));
      const db = createMockDb();
      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const snapshot = { status: 'miss' as const, query: 'x', resultIds: [], resultCount: 0, resultScores: [], graphHit: false, stepsJson: '{}', updatedAt: '2024-01-01T00:00:00.000Z', lastInitAt: null, searchMode: 'vector', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 10, indexPaths: [], workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0, error: null };

      await expect(store.writeRecallState({ threadId: null, snapshot })).rejects.toThrow('Write query failed');
    });
  });
});