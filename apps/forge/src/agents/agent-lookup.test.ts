import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from '../database/client';

const mockFindFirst = vi.fn();

vi.mock('../database/client', () => ({
  // Type-only import, runtime value not needed for the helper under test.
  // We only need a fake db shape that exposes query.agents.findFirst.
}));

import { findAgentById } from './agent-lookup';

function makeDb(): Database {
  return {
    query: {
      agents: {
        findFirst: mockFindFirst,
      },
    },
  } as unknown as Database;
}

describe('findAgentById', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it('returns the agent row when found', async () => {
    const row = { id: 'ag_1', workspaceFilesystem: null };
    mockFindFirst.mockResolvedValueOnce(row);

    const db = makeDb();
    const result = await findAgentById(db, 'ag_1');

    expect(result).toEqual(row);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: expect.any(Function),
    });
  });

  it('returns null when no agent matches', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);

    const db = makeDb();
    const result = await findAgentById(db, 'missing');

    expect(result).toBeNull();
  });

  it('returns null when findFirst returns null', async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    const db = makeDb();
    const result = await findAgentById(db, 'missing');

    expect(result).toBeNull();
  });

  it('passes through to findFirst exactly once per call', async () => {
    mockFindFirst.mockResolvedValue({ id: 'ag_x', workspaceFilesystem: null });

    const db = makeDb();
    await findAgentById(db, 'ag_x');
    await findAgentById(db, 'ag_y');

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });
});
