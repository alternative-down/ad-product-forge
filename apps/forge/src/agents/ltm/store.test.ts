import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../database';
import {
  createAgentLongTermMemoryStore,
  type LongTermMemoryRecallHistory,
  type LongTermMemoryRecallSnapshot,
} from './store';

vi.mock('../../database/error-logging', () => ({
  withDbErrorLogging: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
}));

const snapshot: LongTermMemoryRecallSnapshot = {
  status: 'hit',
  query: 'deployment policy',
  resultIds: ['memory/policy.md'],
  resultCount: 1,
  resultScores: [0.9],
  graphHit: true,
  stepsJson: '[]',
  updatedAt: '2026-09-04T00:00:00.000Z',
  lastInitAt: null,
  searchMode: 'hybrid',
  topK: 5,
  graphTopK: 3,
  graphThreshold: 0.7,
  graphRandomWalkSteps: 2,
  indexPaths: ['memory'],
  workspaceFileCount: 1,
  memoryFileCount: 1,
  checkpointFileCount: 0,
  error: null,
};

const history: LongTermMemoryRecallHistory = {
  recentFingerprints: ['fingerprint'],
  updatedAt: '2026-09-04T00:00:00.000Z',
};

function createDatabaseMock() {
  const findFirst = vi.fn();
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const db = {
    query: { agentLongTermMemoryRecallStates: { findFirst } },
    insert,
  };
  return { db: db as unknown as Database, findFirst, insert, values, onConflictDoUpdate };
}

describe('semantic recall state store', () => {
  let database: ReturnType<typeof createDatabaseMock>;

  beforeEach(() => {
    database = createDatabaseMock();
  });

  it('reads a persisted recall snapshot and history', async () => {
    database.findFirst.mockResolvedValue({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      snapshot,
      history,
    });
    const store = createAgentLongTermMemoryStore(database.db, { agentId: 'agent-1' });

    await expect(store.readRecallState()).resolves.toEqual({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      snapshot,
      history,
    });
  });

  it('returns an empty recall state when none has been persisted', async () => {
    database.findFirst.mockResolvedValue(undefined);
    const store = createAgentLongTermMemoryStore(database.db, { agentId: 'agent-1' });

    await expect(store.readRecallState()).resolves.toEqual({
      threadId: null,
      resourceId: null,
      snapshot: null,
      history: null,
    });
  });

  it('upserts recall state independently for the agent', async () => {
    database.findFirst.mockResolvedValue(undefined);
    const store = createAgentLongTermMemoryStore(database.db, { agentId: 'agent-1' });

    await store.writeRecallState({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      snapshot,
      history,
    });

    expect(database.insert).toHaveBeenCalledOnce();
    expect(database.values).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        snapshot: JSON.stringify(snapshot),
        history: JSON.stringify(history),
      }),
    );
    expect(database.onConflictDoUpdate).toHaveBeenCalledOnce();
  });
});
