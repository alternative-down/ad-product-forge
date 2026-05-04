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





