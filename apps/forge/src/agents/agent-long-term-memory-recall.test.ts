import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
    await writeFile(
      path.join(agentMemoryPath, '.ltm-recall-snapshot.json'),
      JSON.stringify({ status: 'miss' }),
    );
    await writeFile(
      path.join(agentMemoryPath, '.ltm-recall-history.json'),
      JSON.stringify({ recentFingerprints: ['workspace:test'] }),
    );

    const readRuntimeMemorySettings = vi.fn(async () => ({
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

    const recall = new AgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath,
      agentMemoryPath,
      mastraId: 'agent_1',
      readRuntimeMemorySettings,
      checkpointedOmStateStore,
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
    await expect(
      readFile(path.join(agentMemoryPath, '.ltm-recall-snapshot.json'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(agentMemoryPath, '.ltm-recall-history.json'), 'utf8'),
    ).rejects.toThrow();
  });
});
