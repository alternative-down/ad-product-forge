import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentLongTermMemoryRecall } from './agent-long-term-memory-recall';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe('AgentLongTermMemoryRecall', () => {
  it('clears persisted recall state and skips config reads when recall query is empty', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-recall-test-'));
    temporaryDirectories.push(workspaceBasePath);

    const agentWorkspacePath = path.join(workspaceBasePath, 'workspace');
    const agentMemoryPath = path.join(agentWorkspacePath, 'memory');

    await mkdir(path.join(agentWorkspacePath, 'skills'), { recursive: true });
    await mkdir(agentMemoryPath, { recursive: true });
    const readRuntimeMemorySettings = vi.fn(async () => ({
      ltmRecallSearchMode: 'hybrid' as const,
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
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      checkpointedOmStateStore,
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
    expect(checkpointedOmStateStore.readState).not.toHaveBeenCalled();
    expect(persistenceStore.clearRecallState).toHaveBeenCalledTimes(1);
    expect(persistenceStore.readRecallState).not.toHaveBeenCalled();
  });
});
