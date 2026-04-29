import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';


vi.mock('@forge-runtime/core', () => ({
  SqliteWorkspaceRetrieval: vi.fn().mockImplementation(function() { return {}; }),
  FilesystemDocumentSource: vi.fn().mockImplementation(function() { return {}; }),
  forgeDebug: vi.fn(),
}));

import { AgentLongTermMemoryRecall } from './agent-long-term-memory-recall';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
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
        packages: [],
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
      step: {},
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
        packages: [],
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
    (vi.spyOn(recall as any, 'readRecallThreadState') as any).mockResolvedValue({
      recentFingerprints: [],
      windowSize: 1,
      rawWindowMessageCount: 8,
    });

    const result = await recall.recallFromStep({
      step: {
        text: 'current step',
      },
      steps: [],
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });

    expect(result).toBeNull();
    expect(persistenceStore.writeRecallState).toHaveBeenCalledTimes(1);
  });
});
