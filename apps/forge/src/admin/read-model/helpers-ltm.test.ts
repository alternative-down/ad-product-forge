import { describe, expect, test, vi } from 'vitest';
import { readLongTermMemoryRecallSnapshot, readLongTermMemoryState } from './helpers-ltm';

// These functions are thin wrappers around the LTM store.
// They test that the wrapper correctly delegates to the store methods.

const mockReadRecallState = vi.fn();
const mockReadState = vi.fn();
const mockLTMStore = {
  readRecallState: mockReadRecallState,
  readState: mockReadState,
};

vi.mock('../../agents/ltm/store', () => ({
  createAgentLongTermMemoryStore: vi.fn(() => mockLTMStore),
}));

import type { Database } from '../../database/client';

const mockDb = {} as Database;

describe('readLongTermMemoryRecallSnapshot', () => {
  test('delegates to store readRecallState', async () => {
    const snapshot = { entries: [], lastUpdatedAt: null };
    mockReadRecallState.mockResolvedValue({ snapshot });

    const result = await readLongTermMemoryRecallSnapshot(mockDb, 'agent-1');

    expect(result).toBe(snapshot);
  });
});

describe('readLongTermMemoryState', () => {
  test('delegates to store readState', async () => {
    const state = { snapshot: { entries: [], lastUpdatedAt: null }, memory: null };
    mockReadState.mockResolvedValue(state);

    const result = await readLongTermMemoryState(mockDb, 'agent-1');

    expect(result).toBe(state);
  });
});
