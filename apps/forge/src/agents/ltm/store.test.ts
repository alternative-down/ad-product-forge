import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn(),
  relations: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../database/schema', () => ({
  agentLongTermMemoryStates: { $columnMap: {} },
  agentLongTermMemoryRecallStates: { $columnMap: {} },
}));

// Mock db with query builder pattern (insert → values; select → from → where)
function makeQueryBuilder(result: unknown) {
  const chain: any = {};
  chain.values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(result);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

function createMockDb() {
  return {
    insert: vi.fn(() => makeQueryBuilder(undefined)),
    update: vi.fn(() => makeQueryBuilder(undefined)),
    select: vi.fn(() => makeQueryBuilder(undefined)),
    delete: vi.fn(() => makeQueryBuilder(undefined)),
    query: {
      agentLongTermMemoryStates: {
        findFirst: vi.fn(),
      },
      agentLongTermMemoryRecallStates: {
        findFirst: vi.fn(),
      },
    },
  };
}

// ── import after mocks ───────────────────────────────────────────────────────
import { createAgentLongTermMemoryStore } from './store';
import { longTermMemoryStateSchema, longTermMemoryRecallSnapshotSchema } from './store';

describe('createAgentLongTermMemoryStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  // ── readState ───────────────────────────────────────────────────────────────

  describe('readState', () => {
    it('returns parsed state when DB row has valid state', async () => {
      const storedState = {
        version: 1,
        packages: [],
        lastWrittenPackageId: 'pkg-1',
        lastWrittenAt: '2025-01-01T00:00:00.000Z',
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce({ state: storedState });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const state = await store.readState();

      expect(state).toMatchObject({ version: 1, lastWrittenPackageId: 'pkg-1' });
    });

    it('returns parsed state when DB row state is null', async () => {
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce(null);
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce(null); // writeState also reads first

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const state = await store.readState();

      expect(state).toMatchObject({ version: 1, packages: [] });
    });

    it('creates and writes empty state when safeParse fails', async () => {
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce({ state: { bad: 'data' } });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const state = await store.readState();

      expect(state).toMatchObject({ version: 1, packages: [] });
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws and logs on DB read error', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      db.query.agentLongTermMemoryStates.findFirst.mockRejectedValueOnce(new Error('DB read error'));

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await expect(store.readState()).rejects.toThrow('DB read error');
      expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'ltm',
        level: 'info',
        message: 'Failed to read LTM state',
      }));
    });
  });

  // ── writeState ─────────────────────────────────────────────────────────────

  describe('writeState', () => {
    it('upserts state with updatedAt set', async () => {
      const state = {
        version: 1 as const,
        packages: [],
        lastWrittenPackageId: 'pkg-write',
        lastWrittenAt: '2025-01-01T00:00:00.000Z',
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce(null);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await store.writeState(state);

      expect(db.insert).toHaveBeenCalled();
      expect(db.query.agentLongTermMemoryStates.findFirst).toHaveBeenCalled();
    });

    it('throws and logs on upsert error', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      db.query.agentLongTermMemoryStates.findFirst.mockRejectedValueOnce(new Error('Query failed'));

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await expect(store.writeState({
        version: 1, packages: [], lastWrittenPackageId: null,
        lastWrittenAt: null, lastRunAt: null, lastRunError: null,
        lastRunErrorAt: null, updatedAt: 'x',
      })).rejects.toThrow('Query failed');
      expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Failed to query LTM state for write',
      }));
    });
  });

  // ── readRecallIndexStamp ────────────────────────────────────────────────────

  describe('readRecallIndexStamp', () => {
    it('returns the recallIndexStamp from DB row', async () => {
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce({ recallIndexStamp: 'stamp-abc', state: null });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const stamp = await store.readRecallIndexStamp();

      expect(stamp).toBe('stamp-abc');
    });

    it('returns null when no row exists', async () => {
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce(null);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const stamp = await store.readRecallIndexStamp();

      expect(stamp).toBeNull();
    });
  });

  // ── writeRecallIndexStamp ──────────────────────────────────────────────────

  describe('writeRecallIndexStamp', () => {
    it('upserts the stamp into DB', async () => {
      db.query.agentLongTermMemoryStates.findFirst.mockResolvedValueOnce(null);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await store.writeRecallIndexStamp('my-stamp-v2');

      expect(db.insert).toHaveBeenCalled();
    });
  });

  // ── readRecallState ────────────────────────────────────────────────────────

  describe('readRecallState', () => {
    it('returns recall state when row has valid snapshot', async () => {
      const snapshot = {
        status: 'hit' as const,
        query: 'what was I doing?',
        resultIds: ['id-1', 'id-2'],
        resultCount: 2,
        resultScores: [0.9, 0.7],
        graphHit: true,
        stepsJson: '{"steps":[]}',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastInitAt: null,
        searchMode: 'vector',
        topK: 5,
        graphTopK: 3,
        graphThreshold: 0.6,
        graphRandomWalkSteps: 10,
        indexPaths: [],
        workspaceFileCount: 10,
        memoryFileCount: 5,
        checkpointFileCount: 2,
        error: null,
      };
      const history = { recentFingerprints: ['fp-1'], updatedAt: '2025-01-01T00:00:00.000Z' };
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce({ snapshot, history });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const result = await store.readRecallState();

      expect(result.snapshot).toMatchObject({ status: 'hit', resultCount: 2 });
      expect(result.history).toMatchObject({ recentFingerprints: ['fp-1'] });
    });

    it('returns null snapshot and null history when no row', async () => {
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce(null);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const result = await store.readRecallState();

      expect(result.snapshot).toBeNull();
      expect(result.history).toBeNull();
    });

    it('returns null snapshot when safeParse fails on snapshot', async () => {
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce({
        snapshot: { bad: 'data' },
        history: { recentFingerprints: [], updatedAt: 'x' },
      });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const result = await store.readRecallState();

      expect(result.snapshot).toBeNull();
    });

    it('returns null history when safeParse fails on history', async () => {
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce({
        snapshot: null,
        history: { bad: 'data' },
      });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      const result = await store.readRecallState();

      expect(result.history).toBeNull();
    });
  });

  // ── writeRecallState ───────────────────────────────────────────────────────

  describe('writeRecallState', () => {
    it('upserts recall state into DB with threadId and resourceId from existing row', async () => {
      const existingRow = { agentId: 'agent-1', threadId: 'thread-existing', resourceId: 'res-1', snapshot: null, history: null, createdAt: 1000, updatedAt: 2000 };
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce(existingRow);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await store.writeRecallState({
        snapshot: { status: 'miss' as const, query: 'test', resultIds: [], resultCount: 0, resultScores: [], graphHit: false, stepsJson: '{}', updatedAt: 'x', lastInitAt: null, searchMode: 'x', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 5, indexPaths: [], workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0, error: null },
        history: { recentFingerprints: ['fp-new'], updatedAt: 'x' },
        threadId: 'thread-new',
        resourceId: 'res-new',
      });

      expect(db.insert).toHaveBeenCalled();
      expect(db.query.agentLongTermMemoryRecallStates.findFirst).toHaveBeenCalled();
    });

    it('uses existing threadId/resourceId when input ones are absent', async () => {
      const existingRow = { agentId: 'agent-1', threadId: 'thread-old', resourceId: 'res-old', snapshot: null, history: null, createdAt: 1000, updatedAt: 2000 };
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce(existingRow);

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await store.writeRecallState({
        snapshot: { status: 'error' as const, query: 'err', resultIds: [], resultCount: 0, resultScores: [], graphHit: false, stepsJson: '{}', updatedAt: 'x', lastInitAt: null, searchMode: 'x', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 5, indexPaths: [], workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0, error: 'boom' },
        history: { recentFingerprints: ['fp-err'], updatedAt: 'x' },
      });

      expect(db.insert).toHaveBeenCalled();
    });

    it('logs and rethrows on DB insert error', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      db.query.agentLongTermMemoryRecallStates.findFirst.mockResolvedValueOnce(null);
      db.insert.mockImplementationOnce(() => {
        const chain = makeQueryBuilder(undefined);
        chain.values.mockImplementationOnce(() => { throw new Error('Insert failed'); });
        return chain;
      });

      const store = createAgentLongTermMemoryStore(db as any, { agentId: 'agent-1' });
      await expect(store.writeRecallState({
        snapshot: { status: 'miss' as const, query: 'x', resultIds: [], resultCount: 0, resultScores: [], graphHit: false, stepsJson: '{}', updatedAt: 'x', lastInitAt: null, searchMode: 'x', topK: 5, graphTopK: 3, graphThreshold: 0.5, graphRandomWalkSteps: 5, indexPaths: [], workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0, error: null },
        history: { recentFingerprints: [], updatedAt: 'x' },
      })).rejects.toThrow('Insert failed');
      expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'ltm',
        level: 'info',
        message: 'Failed to write LTM recall state',
      }));
    });
  });
});