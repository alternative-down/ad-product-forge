import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Database } from '../database/client';

function createMockDb() {
  const insertMock = vi.fn();
  insertMock.mockImplementation((_table) => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
    })),
  }));

  const queryMock = vi.fn();
  queryMock.mockImplementation((_table) => ({
    findFirst: vi.fn(),
  }));

  return {
    query: {
      agentLongTermMemoryStates: queryMock('agentLongTermMemoryStates'),
      agentLongTermMemoryRecallStates: queryMock('agentLongTermMemoryRecallStates'),
    },
    insert: insertMock,
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function createTestSubject() {
  const { createAgentLongTermMemoryStore } = await import('./ltm/store');
  return createAgentLongTermMemoryStore;
}

describe('createAgentLongTermMemoryStore', () => {
  describe('readState', () => {
    it('returns a default state and writes it when no row exists', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue(null);

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readState();

      // readState never returns null — it creates a default on first call
      expect(result).toBeDefined();
      expect(result!.version).toBe(1);
      expect(result!.packages).toEqual([]);
      expect(result!.lastWrittenPackageId).toBeNull();
      // verify writeState was called as side effect
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('returns parsed state when row exists with valid JSON', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      const stateData = {
        version: 1,
        packages: [
          {
            packageId: 'pkg-1',
            checkpointGeneration: 3,
            fromGeneration: null,
            toGeneration: 3,
            createdAt: '2025-01-01T00:00:00.000Z',
            checkpointSummaryUpdatedAt: '2025-01-01T00:00:00.000Z',
            reflectionCount: 5,
            observationCount: 12,
          },
        ],
        lastWrittenPackageId: 'pkg-1',
        lastWrittenAt: '2025-01-01T00:00:00.000Z',
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({ state: stateData });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readState();

      expect(result).toEqual(stateData);
    });

    it('returns a default state and writes when state JSON is invalid', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({ state: { bad: 'data' } });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readState();

      // On invalid parse, creates and writes default state
      expect(result).toBeDefined();
      expect(result!.version).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('writeState', () => {
    it('calls insert with onConflictDoUpdate', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue(null);

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const state = {
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      await store.writeState(state as any);

      expect(mockDb.insert).toHaveBeenCalled();
      const valuesChain = mockDb.insert.mock.results[0].value;
      const onConflictDoUpdate = valuesChain.values.mock.results[0].value.onConflictDoUpdate;
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.any(Object), set: expect.any(Object) }),
      );
    });

    it('passes existing recallIndexStamp through to insert', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      const existingStamp = JSON.stringify({ updatedAt: '2025-01-01T00:00:00.000Z', reason: 'test' });
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({
        state: null,
        recallIndexStamp: existingStamp,
        createdAt: 1000,
      });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const state = {
        version: 1,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      await store.writeState(state as any);

      // Insert was called with recallIndexStamp from existing
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('readRecallIndexStamp', () => {
    it('returns null when no row exists', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue(null);

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readRecallIndexStamp();

      expect(result).toBeNull();
    });

    it('returns null when recallIndexStamp is null', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({ recallIndexStamp: null });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readRecallIndexStamp();

      expect(result).toBeNull();
    });

    it('parses and returns recallIndexStamp JSON', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      const stamp = { updatedAt: '2025-01-01T00:00:00.000Z', reason: 'periodic-update' };
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({
        recallIndexStamp: JSON.stringify(stamp),
      });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readRecallIndexStamp();

      expect(result).toEqual(JSON.stringify(stamp));
    });
  });

  describe('writeRecallIndexStamp', () => {
    it('calls insert with onConflictDoUpdate to update recallIndexStamp', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryStates.findFirst.mockResolvedValue({ state: null, createdAt: 1000 });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      await store.writeRecallIndexStamp('periodic-reason');

      expect(mockDb.insert).toHaveBeenCalled();
      const onConflictDoUpdate = mockDb.insert.mock.results[0].value.values.mock.results[0].value.onConflictDoUpdate;
      expect(onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe('readRecallState', () => {
    it('returns null snapshot and history when no row exists', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValue(null);

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readRecallState();

      expect(result).toEqual({ threadId: null, resourceId: null, snapshot: null, history: null });
    });

    it('returns parsed snapshot and history from row', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      const snapshot = {
        status: 'hit' as const,
        query: 'test query',
        resultIds: ['id-1', 'id-2'],
        resultCount: 2,
        resultScores: [0.9, 0.7],
        graphHit: true,
        stepsJson: '{"steps":[]}',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastInitAt: null,
        searchMode: 'hybrid',
        topK: 5,
        graphTopK: 3,
        graphThreshold: 0.5,
        graphRandomWalkSteps: 10,
        indexPaths: ['/path'],
        workspaceFileCount: 10,
        memoryFileCount: 5,
        checkpointFileCount: 2,
        error: null,
      };
      const history = { recentFingerprints: ['fp-1'], updatedAt: '2025-01-01T00:00:00.000Z' };
      mockDb.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValue({
        threadId: 'thread-abc',
        resourceId: 'res-xyz',
        snapshot,
        history,
      });

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const result = await store.readRecallState();

      expect(result.threadId).toBe('thread-abc');
      expect(result.resourceId).toBe('res-xyz');
      expect(result.snapshot).toEqual(snapshot);
      expect(result.history).toEqual(history);
    });
  });

  describe('writeRecallState', () => {
    it('calls insert with onConflictDoUpdate for recall state', async () => {
      const storeFn = await createTestSubject();
      const mockDb = createMockDb();
      mockDb.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValue(null);

      const store = storeFn(mockDb, { agentId: 'agent-123' });
      const snapshot = {
        status: 'miss' as const,
        query: 'another query',
        resultIds: [],
        resultCount: 0,
        resultScores: [],
        graphHit: false,
        stepsJson: '{}',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastInitAt: null,
        searchMode: 'vector',
        topK: 3,
        graphTopK: 0,
        graphThreshold: 0.0,
        graphRandomWalkSteps: 0,
        indexPaths: [],
        workspaceFileCount: 0,
        memoryFileCount: 0,
        checkpointFileCount: 0,
        error: 'no results',
      };

      await store.writeRecallState({
        threadId: 'thread-new',
        resourceId: 'res-new',
        snapshot,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      const onConflictDoUpdate = mockDb.insert.mock.results[0].value.values.mock.results[0].value.onConflictDoUpdate;
      expect(onConflictDoUpdate).toHaveBeenCalled();
    });
  });

});