/**
 * Unit tests for agents/ltm/store.ts — createAgentLongTermMemoryStore.
 * Exports: readState, writeState, readRecallIndexStamp, writeRecallIndexStamp,
 *          readRecallState, writeRecallState.
 * Zero prior coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Database } from '../../database';
import type { LongTermMemoryState, LongTermMemoryRecallSnapshot, LongTermMemoryRecallHistory } from './store';

// ─── Mock @forge-runtime/core ────────────────────────────────────────────────

const { mockForgeDebug } = vi.hoisted(() => ({
  mockForgeDebug: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
}));

// ─── Drizzle mock setup ─────────────────────────────────────────────────────
//
// Chain pattern: db.select().from(table).where(eq(...))
// - db.select() → builder with .from()
// - .from(table) → builder with .where()
// - .where() → Promise resolved by mock
//
// Also: db.query.table.findFirst (called directly as findFirst(...))
// Also: db.insert(table).values({...}).onConflictDoUpdate({...})

function createDrizzleMock() {
  const statesFindFirst = vi.fn();
  const recallStatesFindFirst = vi.fn();

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn((arg: unknown) => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    query: {
      agentLongTermMemoryStates: { findFirst: statesFindFirst },
      agentLongTermMemoryRecallStates: { findFirst: recallStatesFindFirst },
    },
  };

  return { db, statesFindFirst, recallStatesFindFirst };
}

// ─── Import after mocks ────────────────────────────────────────────────────

import { createAgentLongTermMemoryStore } from './store';

// ─── Helpers ───────────────────────────────────────────────────────────────

const SAMPLE_STATE: LongTermMemoryState = {
  version: 1,
  packages: [],
  lastWrittenPackageId: null,
  lastWrittenAt: null,
  lastRunAt: null,
  lastRunError: null,
  lastRunErrorAt: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SAMPLE_SNAPSHOT: LongTermMemoryRecallSnapshot = {
  status: 'hit',
  query: 'how do I configure X',
  resultIds: ['r1', 'r2'],
  resultCount: 2,
  resultScores: [0.95, 0.82],
  graphHit: false,
  stepsJson: '[]',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastInitAt: null,
  searchMode: 'hybrid',
  topK: 5,
  graphTopK: 3,
  graphThreshold: 0.7,
  graphRandomWalkSteps: 10,
  indexPaths: [],
  workspaceFileCount: 0,
  memoryFileCount: 0,
  checkpointFileCount: 0,
  error: null,
};

const SAMPLE_HISTORY: LongTermMemoryRecallHistory = {
  recentFingerprints: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockRow(state?: Partial<{ state: LongTermMemoryState; recallIndexStamp: string }>) {
  return {
    agentId: 'agent-test',
    state: state?.state ?? SAMPLE_STATE,
    recallIndexStamp: state?.recallIndexStamp ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createAgentLongTermMemoryStore', () => {
  let mockDb: ReturnType<typeof createDrizzleMock>;
  let store: ReturnType<typeof createAgentLongTermMemoryStore>;

  beforeEach(() => {
    mockDb = createDrizzleMock();
    mockForgeDebug.mockImplementation(() => {});
    store = createAgentLongTermMemoryStore(mockDb.db as unknown as Database, { agentId: 'agent-test' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── readState ─────────────────────────────────────────────────────────────

  describe('readState', () => {
    it('returns state from DB when row exists and parsing succeeds', async () => {
      const row = mockRow({ state: { ...SAMPLE_STATE, lastWrittenPackageId: 'pkg-1' } });
      mockDb.statesFindFirst.mockResolvedValue(row);

      const result = await store.readState();
      expect(result.lastWrittenPackageId).toBe('pkg-1');
      expect(mockDb.statesFindFirst).toHaveBeenCalledOnce();
    });

    it('returns state from DB when row is null', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);

      const result = await store.readState();
      expect(result).toMatchObject({ version: 1, packages: [] });
    });

    it('calls writeState then returns empty state when parsing fails', async () => {
      mockDb.statesFindFirst.mockResolvedValue({
        agentId: 'agent-test',
        state: null,
        recallIndexStamp: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await store.readState();
      expect(result).toMatchObject({ version: 1, packages: [] });
    });

    it('throws on DB error and logs with forgeDebug', async () => {
      mockDb.statesFindFirst.mockRejectedValue(new Error('DB error'));

      await expect(store.readState()).rejects.toThrow('DB error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'ltm', level: 'info', message: 'Failed to read LTM state' }),
      );
    });
  });

  // ─── writeState ─────────────────────────────────────────────────────────────

  describe('writeState', () => {
    it('inserts new row when existing is null', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);

      const result = await store.writeState(SAMPLE_STATE);

      expect(result).toMatchObject({ version: 1 });
      expect(mockDb.statesFindFirst).toHaveBeenCalledOnce();
    });

    it('updates existing row when one exists', async () => {
      const existing = mockRow();
      mockDb.statesFindFirst.mockResolvedValue(existing);

      const updated = { ...SAMPLE_STATE, lastWrittenPackageId: 'pkg-updated' };
      const result = await store.writeState(updated);

      expect(result.lastWrittenPackageId).toBe('pkg-updated');
    });

    it('throws on query error and logs', async () => {
      mockDb.statesFindFirst.mockRejectedValue(new Error('Query error'));

      await expect(store.writeState(SAMPLE_STATE)).rejects.toThrow('Query error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to query LTM state for write' }),
      );
    });

    it('throws on insert error and logs', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);
      // Override insert to throw
      (mockDb.db as any).insert.mockImplementationOnce(() => ({
        values: () => ({
          onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('Insert error')),
        }),
      }));

      await expect(store.writeState(SAMPLE_STATE)).rejects.toThrow('Insert error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to write LTM state' }),
      );
    });

    it('sets updatedAt to current ISO timestamp', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);

      const before = Date.now();
      const result = await store.writeState(SAMPLE_STATE);
      const after = Date.now();

      const resultTime = new Date(result.updatedAt).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after + 1000);
    });
  });

  // ─── readRecallIndexStamp ──────────────────────────────────────────────────

  describe('readRecallIndexStamp', () => {
    it('returns recallIndexStamp from DB row', async () => {
      const stamp = JSON.stringify({ updatedAt: '2026-01-01T00:00:00Z', reason: 'indexed' });
      mockDb.statesFindFirst.mockResolvedValue(mockRow({ recallIndexStamp: stamp }));

      const result = await store.readRecallIndexStamp();
      expect(result).toBe(stamp);
    });

    it('returns null when row has no recallIndexStamp', async () => {
      mockDb.statesFindFirst.mockResolvedValue(mockRow({ recallIndexStamp: undefined }));

      const result = await store.readRecallIndexStamp();
      expect(result).toBeNull();
    });

    it('returns null when row is null', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);

      const result = await store.readRecallIndexStamp();
      expect(result).toBeNull();
    });

    it('throws on DB error and logs', async () => {
      mockDb.statesFindFirst.mockRejectedValue(new Error('DB error'));

      await expect(store.readRecallIndexStamp()).rejects.toThrow('DB error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to read recall index stamp' }),
      );
    });
  });

  // ─── writeRecallIndexStamp ─────────────────────────────────────────────────

  describe('writeRecallIndexStamp', () => {
    it('queries existing state before writing', async () => {
      mockDb.statesFindFirst.mockResolvedValue(null);

      await store.writeRecallIndexStamp('manual-trigger');

      expect(mockDb.statesFindFirst).toHaveBeenCalledOnce();
    });

    it('throws on query error and logs', async () => {
      mockDb.statesFindFirst.mockRejectedValue(new Error('Query error'));

      await expect(store.writeRecallIndexStamp('reason')).rejects.toThrow('Query error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to query LTM state for recall index write' }),
      );
    });
  });

  // ─── readRecallState ────────────────────────────────────────────────────────

  describe('readRecallState', () => {
    it('returns row snapshot and history when row exists', async () => {
      mockDb.recallStatesFindFirst.mockResolvedValue({
        agentId: 'agent-test',
        threadId: 'thread-1',
        resourceId: 'res-1',
        snapshot: SAMPLE_SNAPSHOT,
        history: SAMPLE_HISTORY,
      });

      const result = await store.readRecallState();
      expect(result.threadId).toBe('thread-1');
      expect(result.resourceId).toBe('res-1');
      expect(result.snapshot).toMatchObject({ status: 'hit' });
      expect(result.history).toMatchObject({ recentFingerprints: [] });
    });

    it('returns null snapshot/history when row exists but fields are null', async () => {
      mockDb.recallStatesFindFirst.mockResolvedValue({
        agentId: 'agent-test',
        threadId: null,
        resourceId: null,
        snapshot: null,
        history: null,
      });

      const result = await store.readRecallState();
      expect(result.snapshot).toBeNull();
      expect(result.history).toBeNull();
      expect(result.threadId).toBeNull();
    });

    it('returns null threadId/resourceId when row is null', async () => {
      mockDb.recallStatesFindFirst.mockResolvedValue(null);

      const result = await store.readRecallState();
      expect(result.threadId).toBeNull();
      expect(result.resourceId).toBeNull();
      expect(result.snapshot).toBeNull();
    });

    it('throws on DB error and logs', async () => {
      mockDb.recallStatesFindFirst.mockRejectedValue(new Error('DB error'));

      await expect(store.readRecallState()).rejects.toThrow('DB error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to read recall state' }),
      );
    });
  });

  // ─── writeRecallState ──────────────────────────────────────────────────────

  describe('writeRecallState', () => {
    it('queries existing state before writing', async () => {
      mockDb.recallStatesFindFirst.mockResolvedValue(null);

      await store.writeRecallState({
        threadId: 'thread-new',
        snapshot: SAMPLE_SNAPSHOT,
        history: SAMPLE_HISTORY,
      });

      expect(mockDb.recallStatesFindFirst).toHaveBeenCalledOnce();
    });

    it('updates existing recall state row', async () => {
      const existing = {
        agentId: 'agent-test',
        threadId: 'thread-old',
        resourceId: null,
        snapshot: SAMPLE_SNAPSHOT,
        history: SAMPLE_HISTORY,
      };
      mockDb.recallStatesFindFirst.mockResolvedValue(existing);

      await store.writeRecallState({
        threadId: 'thread-updated',
        resourceId: 'res-updated',
        snapshot: SAMPLE_SNAPSHOT,
        history: SAMPLE_HISTORY,
      });

      expect(mockDb.recallStatesFindFirst).toHaveBeenCalledOnce();
    });

    it('throws on query error and logs with the query error message', async () => {
      mockDb.recallStatesFindFirst.mockRejectedValue(new Error('Query error'));

      await expect(store.writeRecallState({
        threadId: null,
        snapshot: SAMPLE_SNAPSHOT,
      })).rejects.toThrow('Query error');
      // The query error is caught by the first catch block
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to query LTM recall state for write' }),
      );
    });
  });
});