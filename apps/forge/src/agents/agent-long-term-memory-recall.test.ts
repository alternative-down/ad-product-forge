import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

let __forgeInstance: Record<string, any> | null = null;
let __retrievalInstance: Record<string, any> | null = null;

vi.mock('@forge-runtime/core', () => {
  function makeDefaultInstance() {
    return {
      refresh: vi.fn(async () => undefined),
      search: vi.fn(async () => []),
      searchGraph: vi.fn(async () => ({
        hit: false,
        score: null,
        context: '',
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
      })),
      getStats: vi.fn(async () => ({ dimensions: 384, documentCount: 0 })),
      listIndexes: vi.fn(async () => []),
      queryVector: vi.fn(async () => []),
      dispose: vi.fn(),
    };
  }

  class SqliteWorkspaceRetrieval {
    private _inst: Record<string, any>;
    constructor(...args: unknown[]) {
      this._inst =
        __forgeInstance !== null
          ? { ...makeDefaultInstance(), ...__forgeInstance }
          : makeDefaultInstance();
      __retrievalInstance = this._inst;
    }
    get refresh() {
      return this._inst.refresh;
    }
    get search() {
      return this._inst.search;
    }
    get searchGraph() {
      return this._inst.searchGraph;
    }
    get getStats() {
      return this._inst.getStats;
    }
    get listIndexes() {
      return this._inst.listIndexes;
    }
    get queryVector() {
      return this._inst.queryVector;
    }
    get dispose() {
      return this._inst.dispose;
    }
    _refresh() {
      return this._inst.refresh();
    }
    _search(...args: unknown[]) {
      return this._inst.search(...args);
    }
    _searchGraph(...args: unknown[]) {
      return this._inst.searchGraph(...args);
    }
    _dispose() {
      return this._inst.dispose();
    }
  }

  const FilesystemDocumentSource = vi.fn(function (arg: unknown) {
    return { loadDocuments: vi.fn(async () => []) };
  });

  return {
    SqliteWorkspaceRetrieval,
    FilesystemDocumentSource,
    forgeDebug: vi.fn(),
    embedTextWithWorkspaceEmbedder: vi.fn(async () => new Array(384).fill(0)),
  };
});

function setForgeInstance(obj: Record<string, any> | null) {
  __forgeInstance = obj;
}
function getCreatedInstance() {
  return __retrievalInstance;
}

import { AgentLongTermMemoryRecall } from './ltm/recall';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  __forgeInstance = null;
  __retrievalInstance = null;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('AgentLongTermMemoryRecall', () => {
  it('preserves recall history and skips config reads when recall query is empty', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });
    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };
    const readRuntimeMemorySettings = vi.fn(async () => ({
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    }));
    const checkpointedOmStateStore = {
      readState: vi.fn(async () => ({
        latestMetrics: {
          recentRawMessageCount: 4,
          overflowMessageCount: 0,
        },
      })),
      loadState: vi.fn(async () => null),
      saveState: vi.fn(),
    };
    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => null),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => ({
        threadId: 'thread-1',
        resourceId: 'resource-1',
        snapshot: {
          status: 'hit' as const,
          query: 'old query',
          resultIds: [],
          resultCount: 0,
          resultScores: [],
          graphHit: false,
          stepsJson: '[]',
          updatedAt: new Date().toISOString(),
          lastInitAt: null,
          searchMode: 'hybrid',
          topK: 3,
          graphTopK: 3,
          graphThreshold: 0.7,
          graphRandomWalkSteps: 100,
          indexPaths: [],
          workspaceFileCount: 0,
          memoryFileCount: 0,
          checkpointFileCount: 0,
          error: null,
        },
        history: {
          recentFingerprints: ['workspace:test'],
          updatedAt: new Date().toISOString(),
        },
      })),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore,
    });

    const result = await recall.recallFromStep({
      step: { text: '', toolCalls: [], toolResults: [] },
      steps: [],
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });

    expect(result).toBeNull();
    expect(readRuntimeMemorySettings).not.toHaveBeenCalled();
    // checkpointedOmStateStore removed from constructor
    expect(persistenceStore.readRecallState).toHaveBeenCalledTimes(2);
    expect(persistenceStore.writeRecallState).toHaveBeenCalledTimes(1);
  });

  it('skips recall injection when recall volume already occupies a relevant share of raw and overflow context', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-threshold-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });
    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };
    const readRuntimeMemorySettings = vi.fn(async () => ({
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    }));
    const checkpointedOmStateStore = {
      readState: vi.fn(async () => ({
        latestMetrics: {
          recentRawMessageCount: 4,
          overflowMessageCount: 4,
        },
      })),
      loadState: vi.fn(async () => null),
      saveState: vi.fn(),
    };
    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => null),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => ({
        threadId: 'thread-1',
        resourceId: 'resource-1',
        snapshot: null,
        history: {
          recentFingerprints: [],
          updatedAt: new Date().toISOString(),
        },
      })),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore,
    });

    (vi.spyOn(recall as any, 'runRecallSearch') as any).mockResolvedValue({
      formatted: '',
      results: [
        { id: 'memory/a.md', content: 'alpha', score: 0.91 },
        { id: 'memory/b.md', content: 'beta', score: 0.9 },
      ],
      rawWorkspaceResults: [
        { id: 'memory/a.md', content: 'alpha', score: 0.91 },
        { id: 'memory/b.md', content: 'beta', score: 0.9 },
      ],
      graph: {
        queryText: 'query',
        dimension: 3,
        includeSources: false,
        hit: false,
        score: null,
        context: '',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: null,
      },
      effectiveGraphTopK: 1,
      effectiveGraphThreshold: 0.85,
    });
    (vi.spyOn((recall as any).persistence, 'readRecallThreadState') as any).mockResolvedValue({
      recentFingerprints: [],
      windowSize: 1,
      rawWindowMessageCount: 8,
    });

    const result = await recall.recallFromStep({
      step: {
        text: 'current step',
        toolCalls: [],
        toolResults: [],
      },
      steps: [],
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });

    expect(result).toBeNull();
    expect(persistenceStore.writeRecallState).toHaveBeenCalledTimes(1);
  });
});

it('skips recall when a prior operation is still in flight', async () => {
  const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-concurrent-test-'));
  temporaryDirectories.push(workspaceBasePath);

  const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
  const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

  await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
  await mkdir(agentMemoryPath, { recursive: true });

  const mockConversationStore = {
    upsertThread: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    updateMessageMetadata: vi.fn(),
    updateMessageReplacement: vi.fn(),
    listMessages: vi.fn(),
    listOperationalMemoryMessages: vi.fn(),
  };

  const readRuntimeMemorySettings = vi.fn(async () => ({
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallWorkspaceTopK: 3,
    ltmRecallGraphTopK: 3,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 100,
    ltmRecallGraphIncludeSources: false,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 3,
  }));

  const persistenceStore = {
    readState: vi.fn(async () => ({
      version: 1 as const,
      packages: [] as any,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      updatedAt: new Date().toISOString(),
    })),
    writeState: vi.fn(),
    readRecallIndexStamp: vi.fn(async () => null),
    writeRecallIndexStamp: vi.fn(),
    readRecallState: vi.fn(async () => ({
      threadId: null,
      resourceId: null,
      snapshot: null,
      history: {
        recentFingerprints: [],
        updatedAt: new Date().toISOString(),
      },
    })),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  };

  const recall = new AgentLongTermMemoryRecall({
    conversationStore: mockConversationStore,
    agentId: 'agent-1',
    agentWorkspacePath,
    agentMemoryPath,
    mastraId: 'agent_1',
    readRuntimeMemorySettings,
    persistenceStore,
  });

  // Slow down runTrackedRecallOperation so the second call fires while the first is in-flight
  (vi.spyOn(recall as any, 'runTrackedRecallOperation') as any).mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 200));
    return { id: 'doc-1', text: 'content', score: 0.9 };
  });
  (vi.spyOn((recall as any).persistence, 'readRecallThreadState') as any).mockResolvedValue({
    recentFingerprints: [],
    windowSize: 5,
    rawWindowMessageCount: 1,
  });

  const [firstResult, secondResult] = await Promise.all([
    recall.recallFromStep({ step: { text: 'hello', toolCalls: [], toolResults: [] }, steps: [], threadId: null }),
    recall.recallFromStep({ step: { text: 'world', toolCalls: [], toolResults: [] }, steps: [], threadId: null }),
  ]);

  // Second call should be skipped immediately (pending operation in flight)
  expect(secondResult).toBeNull();
  // First call either returns text or null depending on graph hit — just verify it tried
  expect(firstResult === null || typeof firstResult === 'string').toBe(true);
  // Note: pendingRecallOperationCount is incremented inside runTrackedRecallOperation,
  // which is called from searchWorkspace/searchGraph AFTER resolveRecallConfig finishes.
  // Both calls therefore reach readRuntimeMemorySettings before the counter is incremented.
  // The observable guarantee is: second call returns null (short-circuits before persistence).
});
it('returns null when workspace search yields no results and graph does not hit', async () => {
  const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-miss-test-'));
  temporaryDirectories.push(workspaceBasePath);

  const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
  const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

  await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
  await mkdir(agentMemoryPath, { recursive: true });

  const mockConversationStore = {
    upsertThread: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    updateMessageMetadata: vi.fn(),
    updateMessageReplacement: vi.fn(),
    listMessages: vi.fn(),
    listOperationalMemoryMessages: vi.fn(),
  };

  const readRuntimeMemorySettings = vi.fn(async () => ({
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallWorkspaceTopK: 3,
    ltmRecallGraphTopK: 3,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 100,
    ltmRecallGraphIncludeSources: false,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 3,
  }));

  const persistenceStore = {
    readState: vi.fn(async () => ({
      version: 1 as const,
      packages: [] as any,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      updatedAt: new Date().toISOString(),
    })),
    writeState: vi.fn(),
    readRecallIndexStamp: vi.fn(async () => null),
    writeRecallIndexStamp: vi.fn(),
    readRecallState: vi.fn(async () => ({
      threadId: null,
      resourceId: null,
      snapshot: null,
      history: {
        recentFingerprints: [],
        updatedAt: new Date().toISOString(),
      },
    })),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  };

  const recall = new AgentLongTermMemoryRecall({
    conversationStore: mockConversationStore,
    agentId: 'agent-1',
    agentWorkspacePath,
    agentMemoryPath,
    mastraId: 'agent_1',
    readRuntimeMemorySettings,
    persistenceStore,
  });

  (vi.spyOn(recall as any, 'runRecallSearch') as any).mockResolvedValue({
    formatted: '',
    results: [],
    rawWorkspaceResults: [],
    graph: {
      queryText: 'test query',
      dimension: 3,
      includeSources: false,
      hit: false,
      score: null,
      context: '',
      relevantContextRaw: null,
      sourcesCount: 0,
      sourcesJson: null,
      rawJson: null,
      error: null,
    },
    effectiveGraphTopK: 3,
    effectiveGraphThreshold: 0.7,
  });
  (vi.spyOn((recall as any).persistence, 'readRecallThreadState') as any).mockResolvedValue({
    recentFingerprints: [],
    windowSize: 5,
    rawWindowMessageCount: 1,
  });

  const result = await recall.recallFromStep({
    step: { text: 'test query', toolCalls: [], toolResults: [] },
    steps: [],
    threadId: null,
  });

  // No workspace results, no graph hit → buildRecallSystemMessage returns null → return null
  expect(result).toBeNull();
  // A hit snapshot should still be persisted
  expect(persistenceStore.writeRecallState).toHaveBeenCalled();
  const persistedCall = (
    persistenceStore.writeRecallState as ReturnType<typeof vi.fn>
  ).mock.calls.at(-1)?.[0] as any;
  expect(persistedCall.snapshot.status).toBe('hit');
  expect(persistedCall.snapshot.resultCount).toBe(0);
  expect(persistedCall.snapshot.graphHit).toBe(false);
});

it('returns recall text on successful workspace and graph hit', async () => {
  const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-hit-test-'));
  temporaryDirectories.push(workspaceBasePath);

  const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
  const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

  await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
  await mkdir(agentMemoryPath, { recursive: true });

  const mockConversationStore = {
    upsertThread: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    updateMessageMetadata: vi.fn(),
    updateMessageReplacement: vi.fn(),
    listMessages: vi.fn(),
    listOperationalMemoryMessages: vi.fn(),
  };

  const readRuntimeMemorySettings = vi.fn(async () => ({
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallWorkspaceTopK: 3,
    ltmRecallGraphTopK: 3,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 100,
    ltmRecallGraphIncludeSources: false,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 3,
  }));

  const persistenceStore = {
    readState: vi.fn(async () => ({
      version: 1 as const,
      packages: [] as any,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      updatedAt: new Date().toISOString(),
    })),
    writeState: vi.fn(),
    readRecallIndexStamp: vi.fn(async () => null),
    writeRecallIndexStamp: vi.fn(),
    readRecallState: vi.fn(async () => ({
      threadId: null,
      resourceId: null,
      snapshot: null,
      history: {
        recentFingerprints: [],
        updatedAt: new Date().toISOString(),
      },
    })),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  };

  const recall = new AgentLongTermMemoryRecall({
    conversationStore: mockConversationStore,
    agentId: 'agent-1',
    agentWorkspacePath,
    agentMemoryPath,
    mastraId: 'agent_1',
    readRuntimeMemorySettings,
    persistenceStore,
  });

  (vi.spyOn(recall as any, 'runRecallSearch') as any).mockResolvedValue({
    formatted: '',
    results: [
      { id: 'memory/doc-a.md', content: 'Content about finance', score: 0.92 },
      { id: 'memory/doc-b.md', content: 'Also about finance', score: 0.88 },
    ],
    rawWorkspaceResults: [
      { id: 'memory/doc-a.md', content: 'Content about finance', score: 0.92 },
      { id: 'memory/doc-b.md', content: 'Also about finance', score: 0.88 },
    ],
    graph: {
      queryText: 'finance overview',
      dimension: 3,
      includeSources: false,
      hit: true,
      score: 0.95,
      context: 'Finance overview context from graph traversal.',
      relevantContextRaw: 'Finance overview context from graph traversal.',
      sourcesCount: 1,
      sourcesJson: null,
      rawJson: null,
      error: null,
    },
    effectiveGraphTopK: 3,
    effectiveGraphThreshold: 0.7,
  });
  (vi.spyOn((recall as any).persistence, 'readRecallThreadState') as any).mockResolvedValue({
    recentFingerprints: [],
    windowSize: 5,
    rawWindowMessageCount: 8,
  });

  const result = await recall.recallFromStep({
    step: { text: 'what is the finance overview?', toolCalls: [], toolResults: [] },
    steps: [],
    threadId: 'thread-hit',
  });

  expect(result).not.toBeNull();
  expect(typeof result).toBe('string');
  // Should contain graph context since graph hit
  expect((result as string).length).toBeGreaterThan(0);
  // Snapshot should be persisted with graph hit info
  expect(persistenceStore.writeRecallState).toHaveBeenCalled();
  const persistedCall = (
    persistenceStore.writeRecallState as ReturnType<typeof vi.fn>
  ).mock.calls.at(-1)?.[0] as any;
  expect(persistedCall.snapshot.status).toBe('hit');
  expect(persistedCall.snapshot.graphHit).toBe(true);
  expect(persistedCall.snapshot.query).toBe('what is the finance overview?');
});

describe('AgentLongTermMemoryRecall.initialize', () => {
  it('marks workspace as initialized and sets lastInitAt', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-init-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const recallConfig = {
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    };
    const readRuntimeMemorySettings = vi.fn(async () => recallConfig);

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => 'stamp-001'),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({ refresh: vi.fn(async () => undefined) });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore: persistenceStore as any,
    });

    await recall.initialize();

    // second call should be a no-op
    await recall.initialize();

    const retrievalInstance = getCreatedInstance();
    expect(retrievalInstance?.refresh).toHaveBeenCalledTimes(1);
  });

  it('throws when runtime memory settings are unavailable', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-init-err-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => 'stamp-001'),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({ refresh: vi.fn(async () => undefined) });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings: undefined,
      persistenceStore: persistenceStore as any,
    });

    await expect(recall.debugSearch({ query: 'test' })).rejects.toThrow(
      'LTM recall requires runtime memory settings',
    );
  });
});

describe('AgentLongTermMemoryRecall.refreshIndex', () => {
  it('re-indexes when stamp has changed since last init', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-refresh-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const recallConfig = {
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    };

    let callCount = 0;
    const readRuntimeMemorySettings = vi.fn(async () => {
      callCount++;
      return recallConfig;
    });

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => `stamp-${++callCount}`),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    let refreshCalls = 0;
    setForgeInstance({
      refresh: vi.fn(async () => {
        refreshCalls++;
      }),
    });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore: persistenceStore as any,
    });

    await recall.refreshIndex();
    // stamp-1 on init, stamp-2 on refresh → different → re-index
    expect(refreshCalls).toBe(2);
  });

  it('skips re-index when stamp is unchanged', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-refresh-skip-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const recallConfig = {
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    };
    const readRuntimeMemorySettings = vi.fn(async () => recallConfig);

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => 'stable-stamp'),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({ refresh: vi.fn(async () => undefined) });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore: persistenceStore as any,
    });

    await recall.refreshIndex();
    await recall.refreshIndex();

    // Same stamp, no re-index on second call
    const retrievalInstance = getCreatedInstance();
    expect(retrievalInstance?.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('AgentLongTermMemoryRecall.debugSearch', () => {
  it('returns empty result structure when query is blank', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-debug-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const recallConfig = {
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 5,
      ltmRecallGraphTopK: 5,
      ltmRecallGraphThreshold: 0.5,
      ltmRecallGraphRandomWalkSteps: 200,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.5,
      ltmRecallDocumentCount: 5,
    };
    const readRuntimeMemorySettings = vi.fn(async () => recallConfig);

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => 'stamp-debug'),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({
      search: vi.fn(async () => []),
      getStats: vi.fn(async () => ({ dimensions: 384, documentCount: 0 })),
      listIndexes: vi.fn(async () => []),
    });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore: persistenceStore as any,
    });

    await recall.initialize();
    const result = await recall.debugSearch({ query: '   ' });

    expect(result.query).toBe('');
    expect(result.searchMode).toBe('hybrid');
    expect(result.workspaceResults).toEqual([]);
    expect(result.vectorResults).toEqual([]);
    expect(result.graphHit).toBe(false);
    expect(result.graphContext).toBe('');
  });

  it('populates result fields when query has content', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-debug-full-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const recallConfig = {
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    };
    const readRuntimeMemorySettings = vi.fn(async () => recallConfig);

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => 'stamp-full'),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({
      search: vi.fn(async () => [
        {
          id: 'doc-1',
          text: 'Finance overview document',
          score: 0.95,
        },
      ]),
      queryVector: vi.fn(async () => []),
      getStats: vi.fn(async () => ({ dimensions: 384, documentCount: 1 })),
      listIndexes: vi.fn(async () => [{ name: 'forge_runtime_memory_recall' }]),
    });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      persistenceStore: persistenceStore as any,
    });

    await recall.initialize();
    const result = await recall.debugSearch({ query: 'finance overview' });

    expect(result.query).toBe('finance overview');
    expect(result.searchMode).toBe('hybrid');
    expect(result.workspaceResults.length).toBeGreaterThan(0);
    expect(result.workspaceResults[0]?.id).toBe('doc-1');
    expect(result.queryEmbeddingDimension).toBeGreaterThan(0);
    expect(result.injectedSystemMessage).toBeTruthy();
    expect(result.workspaceCanBm25).toBe(true);
    expect(result.workspaceCanVector).toBe(true);
    expect(result.workspaceCanHybrid).toBe(true);
  });
});

describe('AgentLongTermMemoryRecall.dispose', () => {
  it('disposes retrieval workspace without throwing', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-dispose-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });

    const mockConversationStore = {
      upsertThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      updateMessageMetadata: vi.fn(),
      updateMessageReplacement: vi.fn(),
      listMessages: vi.fn(),
      listOperationalMemoryMessages: vi.fn(),
    };

    const persistenceStore = {
      readState: vi.fn(async () => ({
        version: 1 as const,
        packages: [] as any,
        lastWrittenPackageId: null,
        lastWrittenAt: null,
        lastRunAt: null,
        lastRunError: null,
        lastRunErrorAt: null,
        updatedAt: new Date().toISOString(),
      })),
      writeState: vi.fn(),
      readRecallIndexStamp: vi.fn(async () => null),
      writeRecallIndexStamp: vi.fn(),
      readRecallState: vi.fn(async () => null),
      writeRecallState: vi.fn(),
      clearRecallState: vi.fn(),
    };

    setForgeInstance({ dispose: vi.fn() });

    const recall = new AgentLongTermMemoryRecall({
      conversationStore: mockConversationStore,
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings: undefined,
      persistenceStore: persistenceStore as any,
    });

    await recall.dispose();

    const retrievalInstance = getCreatedInstance();
    expect(retrievalInstance?.dispose).toHaveBeenCalledTimes(1);
  });
});
