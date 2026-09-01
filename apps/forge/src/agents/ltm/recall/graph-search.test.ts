/**
 * Unit tests for agents/ltm/recall/graph-search.ts
 *
 * Covers: runGraphSearch(queryText, workspaceResults, options, deps)
 *  - Builds query text from context results
 *  - Falls back to workspaceResults when contextResults is empty
 *  - Filters out empty content
 *  - Calls retrievalWorkspace.searchGraph with constructed query
 *  - Returns the hit result fields
 *  - Catches errors and returns a hit=false result with error string
 */
import { describe, expect, it, vi } from 'vitest';
import { runGraphSearch, type GraphSearchDeps } from './graph-search';
import type { GraphSearchOptions } from './types';

interface MockDeps extends GraphSearchDeps {
  __retrievalGraph: ReturnType<typeof vi.fn>;
  __runTracked: ReturnType<typeof vi.fn>;
  __getGraphDim: ReturnType<typeof vi.fn>;
}

function createMockDeps(opts: {
  graphResult?: {
    hit: boolean;
    score: number | null;
    context: string;
    relevantContextRaw: string | null;
    sourcesCount: number;
    sourcesJson: string | null;
    rawJson: string | null;
  };
  graphError?: Error;
  dimension?: number;
} = {}): MockDeps {
  const __runTracked = vi.fn().mockImplementation(
    async <T>(_label: string, op: Promise<T>): Promise<T> => {
      return await op;
    },
  );
  if (opts.graphError) {
    __runTracked.mockImplementation(async () => {
      throw opts.graphError;
    });
  }
  const __retrievalGraph = vi.fn().mockResolvedValue(
    opts.graphResult ?? {
      hit: false,
      score: null,
      context: '',
      relevantContextRaw: null,
      sourcesCount: 0,
      sourcesJson: null,
      rawJson: null,
    },
  );
  return {
    retrievalWorkspace: {
      queryVector: vi.fn(),
      search: vi.fn(),
      searchGraph: __retrievalGraph,
    } as never,
    agentId: 'agent-graph',
    recallTimeoutMs: 5000,
    runTrackedRecallOperation: __runTracked as never,
    getGraphDimension: vi.fn().mockResolvedValue(opts.dimension ?? 256),
    __retrievalGraph,
    __runTracked,
    __getGraphDim: vi.fn().mockResolvedValue(opts.dimension ?? 256),
  };
}

const baseOptions: GraphSearchOptions = {
  topK: 5,
  threshold: 0.5,
  randomWalkSteps: 3,
  includeSources: true,
  contextResults: [],
};

describe('runGraphSearch', () => {
  it('uses workspaceResults as the context base when contextResults is empty', async () => {
    const deps = createMockDeps();
    const workspaceResults = [
      { id: 'w1', content: 'first', score: 0.9 },
      { id: 'w2', content: 'second', score: 0.7 },
    ];

    await runGraphSearch('query', workspaceResults, baseOptions, deps);

    const callArgs = deps.__retrievalGraph.mock.calls[0]?.[0] as { query: string };
    expect(callArgs.query).toBe('query\nContext: first\nsecond');
  });

  it('uses contextResults when present (overrides workspaceResults)', async () => {
    const deps = createMockDeps();
    const workspaceResults = [{ id: 'w1', content: 'should not be used' }];
    const contextResults = [{ id: 'c1', content: 'overridden' }];

    await runGraphSearch(
      'query',
      workspaceResults,
      { ...baseOptions, contextResults },
      deps,
    );

    const callArgs = deps.__retrievalGraph.mock.calls[0]?.[0] as { query: string };
    expect(callArgs.query).toBe('query\nContext: overridden');
  });

  it('passes the query through unchanged when no context is provided', async () => {
    const deps = createMockDeps();

    await runGraphSearch('lonely-query', [], baseOptions, deps);

    const callArgs = deps.__retrievalGraph.mock.calls[0]?.[0] as { query: string };
    expect(callArgs.query).toBe('lonely-query');
  });

  it('forwards topK, threshold, randomWalkSteps, includeSources to searchGraph', async () => {
    const deps = createMockDeps();

    await runGraphSearch('q', [], baseOptions, deps);

    const callArgs = deps.__retrievalGraph.mock.calls[0]?.[0] as {
      topK: number;
      threshold: number;
      randomWalkSteps: number;
      includeSources: boolean;
    };
    expect(callArgs).toMatchObject({
      topK: 5,
      threshold: 0.5,
      randomWalkSteps: 3,
      includeSources: true,
    });
  });

  it('returns hit=true and the result fields when retrieval succeeds', async () => {
    const deps = createMockDeps({
      graphResult: {
        hit: true,
        score: 0.85,
        context: 'matched context',
        relevantContextRaw: 'raw-ctx',
        sourcesCount: 3,
        sourcesJson: '[{"a":1}]',
        rawJson: '{"raw":true}',
      },
    });

    const out = await runGraphSearch('q', [], baseOptions, deps);

    expect(out.hit).toBe(true);
    expect(out.score).toBe(0.85);
    expect(out.context).toBe('matched context');
    expect(out.relevantContextRaw).toBe('raw-ctx');
    expect(out.sourcesCount).toBe(3);
    expect(out.sourcesJson).toBe('[{"a":1}]');
    expect(out.rawJson).toBe('{"raw":true}');
    expect(out.error).toBeNull();
  });

  it('returns hit=false with error string when retrieval throws', async () => {
    const deps = createMockDeps({ graphError: new Error('graph-store-down') });

    const out = await runGraphSearch('q', [], baseOptions, deps);

    expect(out.hit).toBe(false);
    expect(out.score).toBeNull();
    expect(out.context).toBe('');
    expect(out.sourcesCount).toBe(0);
    expect(out.error).toBe('graph-store-down');
  });

  it('includes the resolved graph dimension in the result', async () => {
    const deps = createMockDeps({ dimension: 512 });

    const out = await runGraphSearch('q', [], baseOptions, deps);

    expect(out.dimension).toBe(512);
  });

  it('filters out empty content from context aggregation', async () => {
    const deps = createMockDeps();
    const contextResults = [
      { id: 'c1', content: 'kept' },
      { id: 'c2', content: '' },
      { id: 'c3', content: 'also-kept' },
    ];

    await runGraphSearch('q', [], { ...baseOptions, contextResults }, deps);

    const callArgs = deps.__retrievalGraph.mock.calls[0]?.[0] as { query: string };
    expect(callArgs.query).toBe('q\nContext: kept\nalso-kept');
  });
});
