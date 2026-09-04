import type { ConversationStore } from '@forge-runtime/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockRecall = { initialize: mockInitialize };

vi.mock('../ltm/recall', () => ({
  createAgentLongTermMemoryRecall: vi.fn(() => mockRecall),
}));

import { createAgentLongTermMemoryRecall } from '../ltm/recall';
import { createAgentRuntimeMemory } from './memory';

function makeInput() {
  return {
    agentId: 'agent-test-1',
    mastraId: 'mastra-1',
    agentWorkspacePath: '/tmp/workspace',
    agentMemoryPath: '/tmp/workspace/memory',
    workspaceEmbedder: 'openai' as const,
    ltmRecallScoreThreshold: 0.6,
    ltmRecallDocumentCount: 15,
    conversationStore: {} as ConversationStore,
    checkpointedOmLimits: { recentRawTokens: 2_048 },
    persistenceStore: {
      readRecallState: vi.fn(),
      writeRecallState: vi.fn(),
    },
    readRuntimeMemorySettings: vi.fn(),
  };
}

describe('createAgentRuntimeMemory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always creates and initializes semantic recall', async () => {
    const input = makeInput();
    const result = await createAgentRuntimeMemory(input);

    expect(result.longTermMemoryRecall).toBe(mockRecall);
    expect(createAgentLongTermMemoryRecall).toHaveBeenCalledWith({
      agentId: input.agentId,
      mastraId: input.mastraId,
      agentWorkspacePath: input.agentWorkspacePath,
      agentMemoryPath: input.agentMemoryPath,
      workspaceEmbedder: input.workspaceEmbedder,
      scoreThreshold: input.ltmRecallScoreThreshold,
      documentCount: input.ltmRecallDocumentCount,
      conversationStore: input.conversationStore,
      recentRawTokens: input.checkpointedOmLimits.recentRawTokens,
      persistenceStore: input.persistenceStore,
      readRuntimeMemorySettings: input.readRuntimeMemorySettings,
    });
    expect(mockInitialize).toHaveBeenCalledOnce();
  });
});
