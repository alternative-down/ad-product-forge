import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let __forgeInstance: Record<string, any> | null = null;

vi.mock('@forge-runtime/core', () => {
  function makeDefaultInstance() {
    return {
      refresh: vi.fn(async () => undefined),
      search: vi.fn(async () => []),
      searchGraph: vi.fn(async () => ({
        hit: false, score: null, context: '',
        sourcesCount: 0, sourcesJson: null, rawJson: null,
      })),
      getStats: vi.fn(async () => ({ dimensions: 384, documentCount: 0 })),
      listIndexes: vi.fn(async () => []),
      queryVector: vi.fn(async () => []),
      dispose: vi.fn(),
    };
  }
  class SqliteWorkspaceRetrieval {
    private _inst: Record<string, any>;
    constructor(..._args: unknown[]) {
      this._inst = __forgeInstance !== null
        ? { ...makeDefaultInstance(), ...__forgeInstance }
        : makeDefaultInstance();
    }
    get refresh() { return this._inst.refresh; }
    get search() { return this._inst.search; }
    get searchGraph() { return this._inst.searchGraph; }
    get getStats() { return this._inst.getStats; }
    get listIndexes() { return this._inst.listIndexes; }
    get queryVector() { return this._inst.queryVector; }
    get dispose() { return this._inst.dispose; }
  }
  return {
    SqliteWorkspaceRetrieval,
    FilesystemDocumentSource: vi.fn(function(arg: unknown) {
      return { loadDocuments: vi.fn(async () => []) };
    }),
    forgeDebug: vi.fn(),
    embedTextWithWorkspaceEmbedder: vi.fn(async () => new Array(384).fill(0)),
  };
});

import { AgentLongTermMemoryRecall } from './ltm/recall';

const temporaryDirectories: string[] = [];

const mockConversationStore = {
  upsertThread: vi.fn(), getThread: vi.fn(), listThreads: vi.fn(),
  appendMessage: vi.fn(), updateMessage: vi.fn(), updateMessageMetadata: vi.fn(),
  updateMessageReplacement: vi.fn(), listMessages: vi.fn(), listOperationalMemoryMessages: vi.fn(),
};

function makePersistenceStore() {
  return {
    readState: vi.fn(async () => ({
      version: 1 as const, packages: [] as any, lastWrittenPackageId: null,
      lastWrittenAt: null, lastRunAt: null, lastRunError: null,
      lastRunErrorAt: null, updatedAt: new Date().toISOString(),
    })),
    writeState: vi.fn(),
    readRecallIndexStamp: vi.fn(async () => null),
    writeRecallIndexStamp: vi.fn(),
    readRecallState: vi.fn(async () => null),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  };
}

function defaultRecallSearch() {
  return {
    formatted: 'formatted context',
    results: [{ id: 'r1', content: 'the result', score: 0.9 }],
    rawWorkspaceResults: [{ id: 'r1', content: 'the result', score: 0.9 }],
    graph: {
      queryText: 'query', dimension: 384, includeSources: false,
      hit: false, score: null, context: '', sourcesCount: 0,
      sourcesJson: null, rawJson: null, error: null,
    },
    effectiveGraphTopK: 3,
    effectiveGraphThreshold: 0.7,
  };
}

async function createRecall(overrides?: {
  persistenceStore?: ReturnType<typeof makePersistenceStore>;
}) {
  const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-ext-'));
  temporaryDirectories.push(workspaceBasePath);
  const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
  const agentMemoryPath = path.join(agentWorkspacePath, 'memory');
  await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
  await mkdir(agentMemoryPath, { recursive: true });

  return new AgentLongTermMemoryRecall({
    conversationStore: mockConversationStore as any,
    agentId: 'agent-ext',
    agentWorkspacePath,
    agentMemoryPath,
    mastraId: 'agent_ext',
    readRuntimeMemorySettings: vi.fn(async () => ({
      ltmRecallSearchMode: 'hybrid' as const,
      ltmRecallWorkspaceTopK: 3,
      ltmRecallGraphTopK: 3,
      ltmRecallGraphThreshold: 0.7,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 3,
    })),
    persistenceStore: (overrides?.persistenceStore ?? makePersistenceStore()) as any,
  });
}

afterEach(async () => {
  __forgeInstance = null;
  await Promise.all(
    temporaryDirectories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

// ---------------------------------------------------------------------------
// Step format edge cases
// buildRecallQueryFromStep looks for: text, reasoningText, toolCalls, toolResults
// ---------------------------------------------------------------------------

describe('AgentLongTermMemoryRecall — buildRecallQueryFromStep edge cases', () => {
  it('returns empty string for null step', async () => {
    const recall = await createRecall();
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue(defaultRecallSearch());
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    const result = await recall.recallFromStep({ step: null as any, steps: [], threadId: null });
    expect(result).toBeNull();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns empty string for primitive step', async () => {
    const recall = await createRecall();
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue(defaultRecallSearch());
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    const result = await recall.recallFromStep({ step: 'just a string' as any, steps: [], threadId: null });
    expect(result).toBeNull();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns empty string when step has no recognized fields', async () => {
    const recall = await createRecall();
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue(defaultRecallSearch());
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    const result = await recall.recallFromStep({
      step: { type: 'custom-event', data: {} } as any,
      steps: [],
      threadId: null,
    });
    expect(result).toBeNull();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns empty string when toolCall has no args/input', async () => {
    const recall = await createRecall();
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue(defaultRecallSearch());
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    // formatStructuredValue returns '' for undefined/empty args → toolCall filtered out → empty query
    const result = await recall.recallFromStep({
      step: { toolCalls: [{ toolName: 'doNothing' }] } as any,
      steps: [],
      threadId: null,
    });
    expect(result).toBeNull();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns recall when toolCall step has structured args and result', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'r1', content: 'file content', score: 0.9 }],
    });
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });

    const result = await recall.recallFromStep({
      step: {
        toolCalls: [{ toolName: 'readFile', args: { path: '/tmp/test.txt' } }],
        toolResults: [{ toolName: 'readFile', result: { content: 'file contents' } }],
      } as any,
      steps: [],
      threadId: null,
    });

    expect(result).not.toBeNull();
    expect(ps.writeRecallState).toHaveBeenCalled();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns recall when step has nested structured args', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'r2', content: 'nested', score: 0.85 }],
    });
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });

    const result = await recall.recallFromStep({
      step: {
        toolCalls: [{ toolName: 'query', args: { sql: 'SELECT * FROM users' } }],
        toolResults: [{ toolName: 'query', result: { rows: [{ id: 1, name: 'Alice' }] } }],
      } as any,
      steps: [],
      threadId: null,
    });

    expect(result).not.toBeNull();
    expect(ps.writeRecallState).toHaveBeenCalled();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns null when assistant step has empty text', async () => {
    const recall = await createRecall();
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue(defaultRecallSearch());
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    const result = await recall.recallFromStep({
      step: { text: '' } as any,
      steps: [],
      threadId: null,
    });
    expect(result).toBeNull();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('returns recall when step has toolCall with only args (no result)', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'r3', content: 'result', score: 0.8 }],
    });
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });

    const result = await recall.recallFromStep({
      step: {
        toolCalls: [{ toolName: 'writeFile', args: { path: '/tmp/out.txt', content: 'data' } }],
      } as any,
      steps: [],
      threadId: null,
    });

    expect(result).not.toBeNull();
    expect(ps.writeRecallState).toHaveBeenCalled();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });

  it('handles deep nesting in structured values without throwing', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });
    const recallSearch = vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'r1', content: 'test', score: 0.9 }],
    });
    const threadState = vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });

    await recall.recallFromStep({
      step: {
        toolCalls: [{ toolName: 'nestedTool', args: { level1: { level2: { level3: 'deep' } } } }],
        toolResults: [{ toolName: 'nestedTool', result: { status: 'ok', nested: { deep: true } } }],
      } as any,
      steps: [],
      threadId: null,
    });

    expect(ps.writeRecallState).toHaveBeenCalled();
    recallSearch.mockRestore();
    threadState.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Dedup and history
// ---------------------------------------------------------------------------

describe('AgentLongTermMemoryRecall — dedup and history', () => {
  it('graph result is filtered out when fingerprint already in history', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    // First call — graph hits, history is empty → fingerprint added
    // Second call — same graph fingerprint in history → filtered out
    vi.spyOn(recall as any, 'readRecallThreadState')
      .mockResolvedValueOnce({ recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0 })
      .mockResolvedValueOnce({ recentFingerprints: ['graph:052a59b0dfbda092b9a767c1be95e9437d8b93f7'], windowSize: 20, rawWindowMessageCount: 0 });

    const graphWithContext = {
      queryText: 'q', dimension: 384, includeSources: false,
      hit: true, score: 0.8, context: 'graph context',
      sourcesCount: 0, sourcesJson: null, rawJson: null, error: null,
    };
    vi.spyOn(recall as any, 'runRecallSearch')
      .mockResolvedValueOnce({ ...defaultRecallSearch(), graph: graphWithContext })
      .mockResolvedValueOnce({ ...defaultRecallSearch(), graph: graphWithContext });

    await recall.recallFromStep({ step: { text: 'first recall' } as any, steps: [], threadId: 't1' });
    await recall.recallFromStep({ step: { text: 'second recall' } as any, steps: [], threadId: 't1' });

    // Second snapshot should have graphHit=false (deduped)
    const secondWrite = ps.writeRecallState.mock.calls[1];
    const snapshot = secondWrite?.[0]?.snapshot;
    expect(snapshot?.graphHit).toBe(false);
    expect(snapshot?.graphContext ?? '').toBe('');
  });

  it('workspace result fingerprint is added to history after recall', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'doc-A', content: 'seen content', score: 0.9 }],
    });

    await recall.recallFromStep({ step: { text: 'first' } as any, steps: [], threadId: 't2' });

    const writeCall = ps.writeRecallState.mock.calls[0];
    expect(writeCall?.[0]?.history?.recentFingerprints).toContain('workspace:doc-A');
  });

  it('workspace results already in history are filtered from injection', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: ['workspace:doc-A'], windowSize: 20, rawWindowMessageCount: 0,
    });
    vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [
        { id: 'doc-A', content: 'already known', score: 0.9 },
        { id: 'doc-new', content: 'new result', score: 0.85 },
      ],
    });

    await recall.recallFromStep({ step: { text: 'mixed recall' } as any, steps: [], threadId: null });

    const writeCall = ps.writeRecallState.mock.calls[0];
    const resultIds: string[] = writeCall?.[0]?.snapshot?.resultIds ?? [];
    expect(resultIds).not.toContain('doc-A');
    expect(resultIds).toContain('doc-new');
  });

  it('windowSize defaults to 20 when rawWindowMessageCount is 0', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: Array(25).fill(null).map((_, i) => `workspace:doc-${i}`),
      windowSize: 20,
      rawWindowMessageCount: 0,
    });
    vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'new-doc', content: 'new', score: 0.9 }],
    });

    await recall.recallFromStep({ step: { text: 'large history' } as any, steps: [], threadId: null });

    const writeCall = ps.writeRecallState.mock.calls[0];
    expect(writeCall?.[0]?.history?.recentFingerprints?.length).toBeLessThanOrEqual(20);
  });

  it('unrecognized step type persists snapshot (no injection)', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });

    const result = await recall.recallFromStep({
      step: { type: 'unknown-step', extra: 'data' } as any,
      steps: [],
      threadId: null,
    });

    expect(result).toBeNull();
    expect(ps.writeRecallState).toHaveBeenCalled();
  });

  it('history fingerprints dedup candidate list before windowing', async () => {
    const ps = makePersistenceStore();
    const recall = await createRecall({ persistenceStore: ps });

    vi.spyOn(recall as any, 'readRecallThreadState').mockResolvedValue({
      recentFingerprints: [], windowSize: 20, rawWindowMessageCount: 0,
    });
    vi.spyOn(recall as any, 'runRecallSearch').mockResolvedValue({
      ...defaultRecallSearch(),
      results: [{ id: 'doc-A', content: 'content', score: 0.9 }],
      graph: {
        queryText: 'q', dimension: 384, includeSources: false,
        hit: true, score: 0.8, context: 'graph ctx for dedup test',
        sourcesCount: 0, sourcesJson: null, rawJson: null, error: null,
      },
    });

    await recall.recallFromStep({ step: { text: 'call' } as any, steps: [], threadId: null });

    // buildNextRecallHistory merges candidates + recent, deduplicates with Set, then slices
    const writeCall = ps.writeRecallState.mock.calls[0];
    const history: string[] = writeCall?.[0]?.history?.recentFingerprints ?? [];
    expect(history).toContain('workspace:doc-A');
    const counts = history.reduce<Record<string, number>>((acc, fp) => { acc[fp] = (acc[fp] ?? 0) + 1; return acc; }, {});
    for (const count of Object.values(counts)) {
      expect(count).toBe(1);
    }
  });
});
