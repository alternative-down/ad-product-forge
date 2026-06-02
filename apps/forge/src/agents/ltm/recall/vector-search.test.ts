/**
 * Unit tests for agents/ltm/recall/vector-search.ts
 *
 * Covers: runVectorQuery(queryVector, topK, deps)
 *  - Delegates to retrievalWorkspace.queryVector
 *  - Wraps call in runTrackedRecallOperation with correct label and timeout
 *  - Returns results as-is
 */
import { describe, expect, it, vi } from 'vitest';
import { runVectorQuery, type VectorSearchResult } from './vector-search';

interface MockDeps {
  retrievalWorkspace: {
    queryVector: ReturnType<typeof vi.fn>;
  };
  recallTimeoutMs: number;
  runTrackedRecallOperation: ReturnType<typeof vi.fn>;
}

function createMockDeps(opts: { queryResult?: VectorSearchResult[]; trackedError?: Error } = {}): MockDeps {
  const tracked = vi.fn().mockImplementation(async <T>(_label: string, op: Promise<T>): Promise<T> => {
    return await op;
  });
  if (opts.trackedError) {
    tracked.mockImplementation(async () => {
      throw opts.trackedError;
    });
  }
  return {
    retrievalWorkspace: {
      queryVector: vi.fn().mockResolvedValue(opts.queryResult ?? []),
    },
    recallTimeoutMs: 5000,
    runTrackedRecallOperation: tracked,
  };
}

describe('runVectorQuery', () => {
  it('forwards the query vector and topK to retrievalWorkspace.queryVector', async () => {
    const deps = createMockDeps({ queryResult: [] });
    const queryVector = [0.1, 0.2, 0.3];

    await runVectorQuery(queryVector, 7, deps as never);

    expect(deps.retrievalWorkspace.queryVector).toHaveBeenCalledWith(queryVector, 7);
  });

  it('wraps the call in runTrackedRecallOperation with label "vector.query"', async () => {
    const deps = createMockDeps({ queryResult: [] });
    const queryVector = [1, 0];

    await runVectorQuery(queryVector, 3, deps as never);

    expect(deps.runTrackedRecallOperation).toHaveBeenCalledTimes(1);
    expect(deps.runTrackedRecallOperation).toHaveBeenCalledWith(
      'vector.query',
      expect.any(Promise),
      deps.recallTimeoutMs,
      'ltm vector query timed out',
    );
  });

  it('returns the underlying retrieval results', async () => {
    const results: VectorSearchResult[] = [
      { id: 'v1', text: 'first', score: 0.95 },
      { id: 'v2', text: 'second', score: 0.81, metadata: { src: 'doc' } },
    ];
    const deps = createMockDeps({ queryResult: results });

    const out = await runVectorQuery([0.5], 10, deps as never);

    expect(out).toEqual(results);
  });

  it('returns an empty array when the retrieval store has no matches', async () => {
    const deps = createMockDeps({ queryResult: [] });

    const out = await runVectorQuery([0, 0, 0], 5, deps as never);

    expect(out).toEqual([]);
  });

  it('propagates the timeout error from runTrackedRecallOperation', async () => {
    const timeoutError = new Error('ltm vector query timed out');
    const deps = createMockDeps({ trackedError: timeoutError });

    await expect(runVectorQuery([0.1], 3, deps as never)).rejects.toThrow('ltm vector query timed out');
  });

  it('uses the provided recallTimeoutMs in the tracked call', async () => {
    const deps = createMockDeps();
    deps.recallTimeoutMs = 12_345;

    await runVectorQuery([0.1], 1, deps as never);

    const callArgs = deps.runTrackedRecallOperation.mock.calls[0];
    expect(callArgs?.[2]).toBe(12_345);
  });
});
