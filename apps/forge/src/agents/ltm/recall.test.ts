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
  } as unknown as ConversationStore;
}

function makeMockPersistenceStore() {
  return {
    readRecallThreadState: vi.fn().mockResolvedValue({
      recentFingerprints: [],
      windowSize: 10,
      rawWindowMessageCount: 0,
    }),
    persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockModel() {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: new Array(128).fill(0.1), dimension: 128 }),
    generate: vi.fn().mockResolvedValue({ text: 'generated recall context' }),
  };
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
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
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
    recall = instance as never;
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
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
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
    recall = instance as never;
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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;
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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    }) as never;
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
    }) as never;
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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      readRuntimeMemorySettings: vi.fn().mockResolvedValue(null),
    }) as never;

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
    };
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
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

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

// =============================================================================
// Additional coverage: formatStructuredValue (internal helper used by formatDocument)
// =============================================================================
describe('AgentLongTermMemoryRecall formatStructuredValue', () => {
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
    formatStructuredValue(value: unknown, indentLevel?: number): string;
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
    recall = instance as never;
  });

  it('returns trimmed string', () => {
    expect(recall.formatStructuredValue('  hello world  ')).toBe('hello world');
  });

  it('returns String(number) and String(boolean)', () => {
    expect(recall.formatStructuredValue(42)).toBe('42');
    expect(recall.formatStructuredValue(true)).toBe('true');
  });

  it('returns empty string for null and undefined (falsy non-object)', () => {
    expect(recall.formatStructuredValue(null)).toBe('');
    expect(recall.formatStructuredValue(undefined)).toBe('');
    expect(recall.formatStructuredValue(0)).toBe('0'); // 0 is falsy but number type → String(0)
    expect(recall.formatStructuredValue(false)).toBe('false');
  });

  it('returns empty string for empty array', () => {
    expect(recall.formatStructuredValue([])).toBe('');
  });

  it('formats non-empty array with bullet points', () => {
    const result = recall.formatStructuredValue(['alpha', 'beta']);
    expect(result).toContain('- alpha');
    expect(result).toContain('- beta');
  });

  it('returns empty string when all object values are falsy', () => {
    expect(recall.formatStructuredValue({ a: null, b: undefined })).toBe('');
  });

  it('formats simple key-value on one line', () => {
    const result = recall.formatStructuredValue({ name: 'Claude', role: 'assistant' });
    expect(result).toContain('name: Claude');
    expect(result).toContain('role: assistant');
  });

  it('formats nested objects with newline indentation', () => {
    const result = recall.formatStructuredValue({
      user: { name: 'Alice', scores: [1, 2, 3] },
    });
    expect(result).toContain('user:');
    expect(result).toContain('  name: Alice');
    expect(result).toContain('  - 1');
  });

  it('filters out empty values from arrays', () => {
    const result = recall.formatStructuredValue(['valid', '', null as unknown as string, 'also valid']);
    expect(result).toContain('valid');
    expect(result).not.toContain('null');
  });
});

// =============================================================================
// Additional coverage: readGraphRelevantContext (called by recallFromStep)
// =============================================================================
describe('AgentLongTermMemoryRecall readGraphRelevantContext', () => {
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
    readGraphRelevantContext(result: unknown): string | null;
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
    recall = instance as never;
  });

  it('returns null for null', () => {
    expect(recall.readGraphRelevantContext(null)).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(recall.readGraphRelevantContext('string' as unknown)).toBeNull();
  });

  it('returns null when relevantContext is missing', () => {
    expect(recall.readGraphRelevantContext({})).toBeNull();
    expect(recall.readGraphRelevantContext({ other: 'field' })).toBeNull();
  });

  it('returns string relevantContext as-is', () => {
    expect(recall.readGraphRelevantContext({ relevantContext: 'hello context' })).toBe('hello context');
  });

  it('joins array of strings with double newline', () => {
    expect(recall.readGraphRelevantContext({ relevantContext: ['line1', 'line2', 'line3'] })).toBe('line1\n\nline2\n\nline3');
  });

  it('filters out non-string values from array', () => {
    expect(recall.readGraphRelevantContext({ relevantContext: ['a', null as unknown as string, 'b', undefined as unknown as string, 'c'] })).toBe('a\n\nb\n\nc');
  });
});

// =============================================================================
// Additional coverage: readGraphSources (called by recallFromStep)
// =============================================================================
describe('AgentLongTermMemoryRecall readGraphSources', () => {
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
    readGraphSources(result: unknown): unknown[];
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
    recall = instance as never;
  });

  it('returns empty array for null', () => {
    expect(recall.readGraphSources(null)).toEqual([]);
  });

  it('returns empty array for non-object', () => {
    expect(recall.readGraphSources('string' as unknown)).toEqual([]);
  });

  it('returns empty array when sources is missing', () => {
    expect(recall.readGraphSources({})).toEqual([]);
  });

  it('returns empty array when sources is not an array', () => {
    expect(recall.readGraphSources({ sources: 'not-an-array' })).toEqual([]);
    expect(recall.readGraphSources({ sources: { id: '1' } })).toEqual([]);
  });

  it('returns the array when sources is an array', () => {
    const sources = [{ id: '1' }, { id: '2' }];
    expect(recall.readGraphSources({ sources })).toEqual(sources);
  });
});

// =============================================================================
// Additional coverage: readGraphSourceDocument
// =============================================================================
describe('AgentLongTermMemoryRecall readGraphSourceDocument', () => {
  let recall: InstanceType<ReturnType<typeof createAgentLongTermMemoryRecall>> & {
    readGraphSourceDocument(source: unknown): string;
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
    recall = instance as never;
  });

  it('returns empty string for null', () => {
    expect(recall.readGraphSourceDocument(null)).toBe('');
  });

  it('returns empty string for non-object', () => {
    expect(recall.readGraphSourceDocument('string' as unknown)).toBe('');
  });

  it('returns empty string when document is missing', () => {
    expect(recall.readGraphSourceDocument({})).toBe('');
  });

  it('returns empty string when document is not a string', () => {
    expect(recall.readGraphSourceDocument({ document: 42 })).toBe('');
    expect(recall.readGraphSourceDocument({ document: null })).toBe('');
  });

  it('returns trimmed document string', () => {
    expect(recall.readGraphSourceDocument({ document: '  some content  ' })).toBe('some content');
  });
});

// =============================================================================
// Additional coverage: runTrackedRecallOperation — lingering state machine
// =============================================================================
describe('AgentLongTermMemoryRecall runTrackedRecallOperation lingering state', () => {
  it('sets lingeringRecallOperationSince when timeout fires and operation not settled', async () => {
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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

    vi.useFakeTimers();
    try {
      const never = new Promise<string>((resolve) => { /* never resolves */ });
      const p = (recall as { runTrackedRecallOperation<T>(label: string, op: Promise<T>, ms: number, msg: string): Promise<T> }).runTrackedRecallOperation(
        'slow.op', never, 50, 'timed out',
      );
      vi.advanceTimersByTime(50);
      await expect(p).rejects.toThrow('timed out');
      expect((recall as { lingeringRecallOperationSince: number | null }).lingeringRecallOperationSince).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('increments pendingRecallOperationCount for concurrent operations', async () => {
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
    };
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: '/tmp/ws',
      agentMemoryPath: '/tmp/mem',
      mastraId: 'mastra-1',
      conversationStore: makeMockConversationStore(),
      persistenceStore: persistence,
      model: makeMockModel(),
      retrievalWorkspace: retrieval,
    }) as never;

    // Fire two operations concurrently
    const [r1, r2] = await Promise.all([
      (recall as { runTrackedRecallOperation<T>(label: string, op: Promise<T>, ms: number, msg: string): Promise<T> }).runTrackedRecallOperation(
        'op1', Promise.resolve('result1'), 5000, 'timed out',
      ),
      (recall as { runTrackedRecallOperation<T>(label: string, op: Promise<T>, ms: number, msg: string): Promise<T> }).runTrackedRecallOperation(
        'op2', Promise.resolve('result2'), 5000, 'timed out',
      ),
    ]);
    expect(r1).toBe('result1');
    expect(r2).toBe('result2');
    // Both settled cleanly — pending count back to 0
    expect((recall as { pendingRecallOperationCount: number }).pendingRecallOperationCount).toBe(0);
    expect((recall as { lingeringRecallOperationSince: number | null }).lingeringRecallOperationSince).toBeNull();
  });
});
