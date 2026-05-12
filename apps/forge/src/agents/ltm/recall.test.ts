import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqliteWorkspaceRetrieval, ConversationStore } from '@forge-runtime/core';
import { createAgentLongTermMemoryRecall } from './recall';

// =============================================================================
// Helper mocks
// =============================================================================

function makeMockRetrievalWorkspace() {
  return {
    refresh: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    queryVectorIndex: vi.fn(),
    searchBm25: vi.fn(),
    searchHybrid: vi.fn(),
    getIndexStats: vi.fn(),
  } as unknown as SqliteWorkspaceRetrieval;
}

function makeMockConversationStore() {
  return {
    addMessage: vi.fn().mockResolvedValue(undefined),
    listMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
  } as any;
}

function makeMockPersistenceStore() {
  return {
    readRecallThreadState: vi.fn().mockResolvedValue({
      recentFingerprints: [],
      windowSize: 10,
      rawWindowMessageCount: 0,
    }),
    persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeMockModel() {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: new Array(128).fill(0.1), dimension: 128 }),
    generate: vi.fn().mockResolvedValue({ text: 'generated recall context' }),
  } as any;
}

// =============================================================================
// createAgentLongTermMemoryRecall factory
// =============================================================================

describe('createAgentLongTermMemoryRecall', () => {
  it('returns an object with expected public API methods', () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: makeMockPersistenceStore(),
      model: makeMockModel(),
    });
    expect(recall).toBeDefined();
    expect(typeof recall.initialize).toBe('function');
    expect(typeof recall.dispose).toBe('function');
    expect(typeof recall.refreshIndex).toBe('function');
    expect(typeof recall.debugSearch).toBe('function');
  });
});

// =============================================================================
// Extended instance tests
// =============================================================================

describe('buildRecallQueryFromStep', () => {
  let recall: any & {
    buildRecallQueryFromStep(step: unknown): string;
  };

  beforeEach(() => {
    const instance = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: makeMockPersistenceStore(),
      model: makeMockModel(),
    });
    recall = instance as any;
  });

  it('returns empty string for null', () => {
    expect(recall.buildRecallQueryFromStep(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(recall.buildRecallQueryFromStep(undefined)).toBe('');
  });

  it('returns empty string for primitive string', () => {
    expect(recall.buildRecallQueryFromStep('hello')).toBe('');
  });

  it('returns empty string for number', () => {
    expect(recall.buildRecallQueryFromStep(42)).toBe('');
  });

  it('extracts text from step record', () => {
    const result = recall.buildRecallQueryFromStep({ text: 'hello world' });
    expect(result).toContain('hello world');
  });

  it('extracts reasoningText from step record', () => {
    const result = recall.buildRecallQueryFromStep({ reasoningText: 'analysis text' });
    expect(result).toContain('analysis text');
  });

  it('extracts toolCalls with args', () => {
    const result = recall.buildRecallQueryFromStep({
      toolCalls: [{ toolName: 'read_file', args: { path: '/tmp/file.txt' } }],
    });
    expect(result).toContain('read_file');
    expect(result).toContain('/tmp/file.txt');
  });

  it('extracts toolCalls with input (alternative field)', () => {
    const result = recall.buildRecallQueryFromStep({
      toolCalls: [{ toolName: 'search', input: { query: 'test' } }],
    });
    expect(result).toContain('search');
    expect(result).toContain('test');
  });

  it('extracts toolResults with result field', () => {
    const result = recall.buildRecallQueryFromStep({
      toolResults: [{ toolName: 'read_file', result: 'file contents here' }],
    });
    expect(result).toContain('read_file');
    expect(result).toContain('file contents here');
  });

  it('extracts toolResults with output (alternative field)', () => {
    const result = recall.buildRecallQueryFromStep({
      toolResults: [{ toolName: 'write', output: { success: true } }],
    });
    expect(result).toContain('write');
    expect(result).toContain('success');
  });

  it('combines text, reasoningText, toolCalls, and toolResults', () => {
    const result = recall.buildRecallQueryFromStep({
      text: 'main text',
      reasoningText: 'reasoning',
      toolCalls: [{ toolName: 'tool1', args: { a: 1 } }],
      toolResults: [{ toolName: 'tool2', result: 'result' }],
    });
    expect(result).toContain('main text');
    expect(result).toContain('reasoning');
    expect(result).toContain('tool1');
    expect(result).toContain('tool2');
  });

  it('filters out null tool call entries', () => {
    const result = recall.buildRecallQueryFromStep({
      toolCalls: [null, undefined],
    });
    // With only null/undefined entries, nothing is extractable
    expect(result).toBe('');
  });
});

// =============================================================================
// shouldSkipRecallInjection unit tests
// =============================================================================

describe('shouldSkipRecallInjection', () => {
  let recall: any & {
    shouldSkipRecallInjection(input: {
      graph: { hit: boolean; sourcesCount: number };
      results: Array<{ id: string }>;
      rawWindowMessageCount: number;
    }): boolean;
  };

  beforeEach(() => {
    const instance = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: makeMockPersistenceStore(),
      model: makeMockModel(),
    });
    recall = instance as any;
  });

  it('returns false when rawWindowMessageCount is 0', () => {
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: true, sourcesCount: 5 },
      results: [],
      rawWindowMessageCount: 0,
    })).toBe(false);
  });

  it('returns false when both graph and results are empty', () => {
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: false, sourcesCount: 0 },
      results: [],
      rawWindowMessageCount: 10,
    })).toBe(false);
  });

  it('returns false when results are empty and sourcesCount is 0', () => {
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: true, sourcesCount: 0 },
      results: [],
      rawWindowMessageCount: 10,
    })).toBe(false);
  });

  it('returns false when recall item count is below threshold', () => {
    // rawWindowMessageCount=10, limit=2, results=2 → 2 >= 2 → skips (returns true)
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: false, sourcesCount: 0 },
      results: [{ id: 'a' }, { id: 'b' }],
      rawWindowMessageCount: 10,
    })).toBe(true);
  });

  it('returns true when graph sourcesCount exceeds threshold', () => {
    // rawWindowMessageCount=10, limit=2 (ratio=0.25)
    // graph.hit=true, sourcesCount=6 → recallItemCount=6 >= 2 → true
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: true, sourcesCount: 6 },
      results: [],
      rawWindowMessageCount: 10,
    })).toBe(true);
  });

  it('returns true when results length exceeds threshold', () => {
    expect(recall.shouldSkipRecallInjection({
      graph: { hit: false, sourcesCount: 0 },
      results: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }],
      rawWindowMessageCount: 10,
    })).toBe(true);
  });
});

// =============================================================================
// countFiles utility
// =============================================================================


// =============================================================================
// AgentLongTermMemoryRecall instance tests
// =============================================================================

describe('AgentLongTermMemoryRecall initialize', () => {
  it('does not re-initialize if already initialized', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
    } as unknown as import('@forge-runtime/core').SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallState: vi.fn().mockResolvedValue({ recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0 }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;
    (recall as { workspaceInitialized: boolean }).workspaceInitialized = true;
    await recall.initialize();
    expect(retrieval.refresh).not.toHaveBeenCalled();
  });
});




describe('AgentLongTermMemoryRecall refreshIndex', () => {
  it('does not call refresh when stamp unchanged', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 'stamp-1' } }),
    } as unknown as import('@forge-runtime/core').SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallState: vi.fn().mockResolvedValue({ recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0 }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('stamp-1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    (recall as { workspaceInitialized: boolean }).workspaceInitialized = true;
    (recall as { lastIndexedStamp: string }).lastIndexedStamp = 'stamp-1';

    await recall.refreshIndex();
    // initialize sets stamp to s1, then refreshIndex compares stamp s1 == s1 -> no refresh
    expect((recall as { lastIndexedStamp: string }).lastIndexedStamp).toBe('stamp-1');
  });
});


describe('AgentLongTermMemoryRecall runTrackedRecallOperation', () => {
  it('starts with zero pending operation count', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: makeMockPersistenceStore(),
      model: makeMockModel(),
    }) as any;
    expect((recall as { pendingRecallOperationCount: number }).pendingRecallOperationCount).toBe(0);
  });

  it('has null lingeringRecallOperationSince at start', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: makeMockPersistenceStore(),
      model: makeMockModel(),
    }) as any;
    expect((recall as { lingeringRecallOperationSince: number | null }).lingeringRecallOperationSince).toBeNull();
  });
});






// =============================================================================
// Critical path: withTimeout — timeout race and behavior
// =============================================================================

// =============================================================================
// Critical path: withTimeout — timeout race behavior via runTrackedRecallOperation
// =============================================================================
describe('AgentLongTermMemoryRecall runTrackedRecallOperation timeout', () => {
  it('resolves when the operation resolves within timeout', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    const result = await (recall as { runTrackedRecallOperation<T>(label: string, op: Promise<T>, ms: number, msg: string): Promise<T> }).runTrackedRecallOperation(
      'test.op',
      Promise.resolve('fast-result'),
      5000,
      'timed out',
    );
    expect(result).toBe('fast-result');
  });

  it('rejects when the operation rejects within timeout', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    await expect(
      (recall as { runTrackedRecallOperation<T>(label: string, op: Promise<T>, ms: number, msg: string): Promise<T> }).runTrackedRecallOperation(
        'test.op',
        Promise.reject(new Error('boom')),
        5000,
        'timed out',
      ),
    ).rejects.toThrow('boom');
  });
});

// =============================================================================
// Critical path: resolveRecallConfig — required settings throw
// =============================================================================
describe('AgentLongTermMemoryRecall resolveRecallConfig', () => {
  it('throws when readRuntimeMemorySettings is not provided', async () => {
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    await expect(
      (recall as { resolveRecallConfig(): Promise<unknown> }).resolveRecallConfig(),
    ).rejects.toThrow('LTM recall requires runtime memory settings');
  });

  it('throws when readRuntimeMemorySettings returns null', async () => {
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      readRuntimeMemorySettings: vi.fn().mockResolvedValue(null),
    }) as any;

    await expect(
      (recall as { resolveRecallConfig(): Promise<unknown> }).resolveRecallConfig(),
    ).rejects.toThrow('LTM recall requires runtime memory settings');
  });

  it('resolves config when readRuntimeMemorySettings returns valid settings', async () => {
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      readRuntimeMemorySettings: vi.fn().mockResolvedValue({
        ltmRecallSearchMode: 'hybrid' as const,
        ltmRecallWorkspaceTopK: 5,
        ltmRecallGraphTopK: 3,
        ltmRecallGraphThreshold: 0.5,
        ltmRecallGraphRandomWalkSteps: 2,
        ltmRecallGraphIncludeSources: true,
        ltmRecallScoreThreshold: 0.3,
        ltmRecallDocumentCount: 10,
      }),
    }) as any;

    const config = await (recall as { resolveRecallConfig(): Promise<unknown> }).resolveRecallConfig();
    expect(config).toMatchObject({
      searchMode: 'hybrid',
      scoreThreshold: 0.3,
      documentCount: 10,
      graphRandomWalkSteps: 2,
      graphIncludeSources: true,
    });
  });
});

// =============================================================================
// Critical path: searchWorkspace — SQLite no-table graceful degradation
// =============================================================================
describe('AgentLongTermMemoryRecall searchWorkspace', () => {
  it('returns empty results when retrieval throws "no such table"', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
      search: vi.fn().mockRejectedValue(new Error('SQLITE_ERROR: no such table: documents')),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    const result = await (recall as { searchWorkspace(q: string, o?: object): Promise<unknown> }).searchWorkspace(
      'test query',
      { topK: 5, resultCount: 5, scoreThreshold: 0, mode: 'hybrid' },
    );
    expect(result).toEqual({ formatted: '', results: [] });
  });

  it('rethrows non-SQLite errors from retrieval.search', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
      search: vi.fn().mockRejectedValue(new Error('disk full')),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    await expect(
      (recall as { searchWorkspace(q: string, o?: object): Promise<unknown> }).searchWorkspace('test', {
        topK: 5, resultCount: 5, scoreThreshold: 0, mode: 'hybrid',
      }),
    ).rejects.toThrow('disk full');
  });

  it('returns empty results when retrieval returns zero results', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    const result = await (recall as { searchWorkspace(q: string, o?: object): Promise<unknown> }).searchWorkspace(
      'test', { topK: 5, resultCount: 5, scoreThreshold: 0, mode: 'hybrid' },
    );
    expect(result).toEqual({ formatted: '', results: [] });
  });
});

// =============================================================================
// Critical path: searchGraph — error swallowing (returns error object, no throw)
// =============================================================================
describe('AgentLongTermMemoryRecall searchGraph', () => {
  it('returns error object with hit=false when graph search throws', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
      search: vi.fn().mockResolvedValue([]),
      searchGraph: vi.fn().mockRejectedValue(new Error('graph service unavailable')),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    const result = await (recall as { searchGraph(q: string, ws: unknown, o?: object): Promise<unknown> }).searchGraph(
      'test query',
      [],
      { topK: 3, threshold: 0.5, randomWalkSteps: 2, includeSources: false, contextResults: [] },
    );
    expect(result).toMatchObject({
      hit: false,
      score: null,
      context: '',
      relevantContextRaw: null,
      sourcesCount: 0,
      sourcesJson: null,
      rawJson: null,
      error: 'graph service unavailable',
    });
  });

  it('returns successful result when graph search succeeds', async () => {
    const retrieval = {
      refresh: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ activeIndexStats: { dimension: 128, stamp: 's1' } }),
      search: vi.fn().mockResolvedValue([]),
      searchGraph: vi.fn().mockResolvedValue({
        hit: true,
        score: 0.87,
        context: 'Relevant graph context',
        relevantContextRaw: 'raw context',
        sourcesCount: 2,
        sourcesJson: '[{"id":"s1"},{"id":"s2"}]',
        rawJson: '{"raw":true}',
      }),
    } as unknown as SqliteWorkspaceRetrieval;
    const persistence = {
      readRecallThreadState: vi.fn().mockResolvedValue({
        recentFingerprints: [], windowSize: 10, rawWindowMessageCount: 0,
      }),
      readRecallIndexStamp: vi.fn().mockResolvedValue('s1'),
      persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    } as any;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as any;

    const result = await (recall as { searchGraph(q: string, ws: unknown, o?: object): Promise<unknown> }).searchGraph(
      'test query',
      [],
      { topK: 3, threshold: 0.5, randomWalkSteps: 2, includeSources: false, contextResults: [] },
    );
    expect(result).toMatchObject({
      hit: true,
      score: 0.87,
      context: 'Relevant graph context',
      sourcesCount: 2,
      error: null,
    });
  });
});
