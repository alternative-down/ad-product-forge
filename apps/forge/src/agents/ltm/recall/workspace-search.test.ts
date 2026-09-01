/**
 * Unit tests for agents/ltm/recall/workspace-search.ts
 *
 * Covers: runWorkspaceSearch(queryText, options, deps)
 *  - Delegates to retrievalWorkspace.search with the expected options
 *  - Maps retrieval results into LtmSearchResult (trims text content)
 *  - Returns empty result on "no such table" SQLite errors (graceful degradation)
 *  - Re-throws non-SQLite errors after logging
 */
import { describe, expect, it, vi } from 'vitest';
import { runWorkspaceSearch, type WorkspaceSearchDeps } from './workspace-search';

interface MockDeps extends WorkspaceSearchDeps {
  __retrievalSearch: ReturnType<typeof vi.fn>;
  __runTracked: ReturnType<typeof vi.fn>;
}

function createMockDeps(opts: {
  searchResult?: Array<{ id: string; text: string; score: number; metadata?: Record<string, unknown> }>;
  searchError?: Error;
} = {}): MockDeps {
  const __retrievalSearch = vi.fn().mockResolvedValue(opts.searchResult ?? []);
  const __runTracked = vi.fn().mockImplementation(
    async <T>(_label: string, op: Promise<T>): Promise<T> => {
      return await op;
    },
  );
  if (opts.searchError) {
    __runTracked.mockImplementation(async () => {
      throw opts.searchError;
    });
  }
  return {
    retrievalWorkspace: {
      queryVector: vi.fn(),
      search: __retrievalSearch,
      searchGraph: vi.fn(),
    } as never,
    agentId: 'agent-test',
    recallTimeoutMs: 5000,
    runTrackedRecallOperation: __runTracked as never,
    __retrievalSearch,
    __runTracked,
  };
}

describe('runWorkspaceSearch', () => {
  it('forwards query and options to retrievalWorkspace.search', async () => {
    const deps = createMockDeps({ searchResult: [] });

    await runWorkspaceSearch(
      'my query',
      { topK: 5, resultCount: 3, scoreThreshold: 0.7, mode: 'hybrid' },
      deps,
    );

    expect(deps.__retrievalSearch).toHaveBeenCalledWith('my query', {
      topK: 5,
      resultLimit: 3,
      scoreThreshold: 0.7,
      mode: 'hybrid',
    });
  });

  it('returns empty result when retrieval has no matches', async () => {
    const deps = createMockDeps({ searchResult: [] });

    const out = await runWorkspaceSearch(
      'no matches',
      { topK: 10, resultCount: 5, scoreThreshold: 0.5, mode: 'vector' },
      deps,
    );

    expect(out).toEqual({ formatted: '', results: [] });
  });

  it('maps retrieval results to LtmSearchResult (id, trimmed content, score)', async () => {
    const deps = createMockDeps({
      searchResult: [
        { id: 'r1', text: '  hello world  ', score: 0.92 },
        { id: 'r2', text: 'no trim', score: 0.5 },
      ],
    });

    const out = await runWorkspaceSearch(
      'q',
      { topK: 5, resultCount: 5, scoreThreshold: 0, mode: 'hybrid' },
      deps,
    );

    expect(out.formatted).toBe('');
    expect(out.results).toEqual([
      { id: 'r1', content: 'hello world', score: 0.92 },
      { id: 'r2', content: 'no trim', score: 0.5 },
    ]);
  });

  it('returns empty result when SQLite reports "no such table" error', async () => {
    const deps = createMockDeps({
      searchError: new Error('SQLITE_ERROR: no such table: documents'),
    });

    const out = await runWorkspaceSearch(
      'q',
      { topK: 1, resultCount: 1, scoreThreshold: 0, mode: 'hybrid' },
      deps,
    );

    expect(out).toEqual({ formatted: '', results: [] });
  });

  it('re-throws non-SQLite errors after forgeDebug', async () => {
    const deps = createMockDeps({
      searchError: new Error('connection refused'),
    });

    await expect(
      runWorkspaceSearch(
        'q',
        { topK: 1, resultCount: 1, scoreThreshold: 0, mode: 'hybrid' },
        deps,
      ),
    ).rejects.toThrow('connection refused');
  });

  it('passes the recallTimeoutMs through to runTrackedRecallOperation', async () => {
    const deps = createMockDeps();
    deps.recallTimeoutMs = 9_999;

    await runWorkspaceSearch(
      'q',
      { topK: 1, resultCount: 1, scoreThreshold: 0, mode: 'hybrid' },
      deps,
    );

    const trackedArgs = deps.__runTracked.mock.calls[0];
    expect(trackedArgs?.[2]).toBe(9_999);
    expect(trackedArgs?.[3]).toBe('ltm recall retrieval search timed out');
  });
});
