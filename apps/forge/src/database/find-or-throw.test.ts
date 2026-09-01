/**
 * Regression tests for findOrThrow helper (issue #5469).
 *
 * Verifies the helper:
 * 1. Returns the row when found
 * 2. Logs via forgeDebug and throws when not found
 * 3. Uses the correct error message format
 * 4. Uses the correct log context shape (idField + idValue)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock forgeDebug before importing the helper
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { findOrThrow } from './find-or-throw';
import { forgeDebug } from '@forge-runtime/core';

const mockForgeDebug = forgeDebug as unknown as ReturnType<typeof vi.fn>;

function makeFakeQueryable(returnValue: unknown) {
  return {
    findFirst: vi.fn().mockResolvedValue(returnValue),
  };
}

describe('findOrThrow helper (issue #5469)', () => {
  it('returns the row when found', async () => {
    const fakeRow = { id: 'a1', name: 'Alice' };
    const queryable = makeFakeQueryable(fakeRow);

    const result = await findOrThrow(
      queryable,
      { scope: 'test', entity: 'agent', op: 'getAgent', idValue: 'a1' },
      { where: {} },
    );

    expect(result).toEqual(fakeRow);
    expect(queryable.findFirst).toHaveBeenCalledWith({ where: {} });
    expect(mockForgeDebug).not.toHaveBeenCalled();
  });

  it('throws when row is undefined', async () => {
    const queryable = makeFakeQueryable(undefined);
    mockForgeDebug.mockClear();

    await expect(
      findOrThrow(
        queryable,
        { scope: 'test', entity: 'agent', op: 'getAgent', idValue: 'a1' },
        { where: {} },
      ),
    ).rejects.toThrow('agent not found: a1');

    expect(mockForgeDebug).toHaveBeenCalledWith({
      scope: 'test',
      level: 'warn',
      message: 'getAgent: agent not found',
      context: { id: 'a1' },
    });
  });

  it('uses custom idField in log context', async () => {
    const queryable = makeFakeQueryable(undefined);
    mockForgeDebug.mockClear();

    await expect(
      findOrThrow(
        queryable,
        {
          scope: 'capabilities-runtime',
          entity: 'Agent role',
          op: 'changeAgentRole',
          idValue: 'role_missing',
          idField: 'roleId',
        },
        { where: {} },
      ),
    ).rejects.toThrow('Agent role not found: role_missing');

    expect(mockForgeDebug).toHaveBeenCalledWith({
      scope: 'capabilities-runtime',
      level: 'warn',
      message: 'changeAgentRole: Agent role not found',
      context: { roleId: 'role_missing' },
    });
  });
});