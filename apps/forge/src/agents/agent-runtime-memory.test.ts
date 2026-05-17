import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRecallInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
};

const mockCreateLtmRecall = vi.fn().mockReturnValue(mockRecallInstance);

vi.mock('../ltm/recall', () => ({
  createAgentLongTermMemoryRecall: mockCreateLtmRecall,
}));

vi.mock('../ltm/store', () => ({
  createAgentLongTermMemoryStore: vi.fn(() => ({})),
}));

vi.mock('./runtime/memory', () => ({
  createAgentRuntimeMemory: vi.fn(async (input: {
    longTermMemory: boolean;
    persistenceStore: unknown;
    agentId: string;
    agentWorkspacePath: string;
    agentMemoryPath: string;
    mastraId: string;
    conversationStore: unknown;
    checkpointedOmLimits: { recentRawTokens?: number };
    readRuntimeMemorySettings?: unknown;
    workspaceEmbedder?: unknown;
    ltmRecallScoreThreshold?: number;
    ltmRecallDocumentCount?: number;
  }) => {
    const recall = input.longTermMemory ? mockCreateLtmRecall({
      agentId: input.agentId,
      agentWorkspacePath: input.agentWorkspacePath,
      agentMemoryPath: input.agentMemoryPath,
      mastraId: input.mastraId,
      conversationStore: input.conversationStore,
      persistenceStore: input.persistenceStore,
      recentRawTokens: input.checkpointedOmLimits.recentRawTokens,
      workspaceEmbedder: input.workspaceEmbedder,
      scoreThreshold: input.ltmRecallScoreThreshold,
      documentCount: input.ltmRecallDocumentCount,
      readRuntimeMemorySettings: input.readRuntimeMemorySettings as () => Promise<unknown>,
    }) : null;
    if (recall) {
      await recall.initialize();
    }
    return { longTermMemoryRecall: recall };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAgentRuntimeMemory', () => {
  it('creates longTermMemoryRecall when longTermMemory is true', async () => {
    const { createAgentRuntimeMemory } = await import('./runtime/memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: true,
      persistenceStore: {} as any,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBe(mockRecallInstance);
    expect(mockCreateLtmRecall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-123',
        agentWorkspacePath: '/tmp/workspace',
        persistenceStore: {} as any,
        conversationStore: expect.anything(),
        recentRawTokens: 2048,
      }),
    );
  });

  it('returns null longTermMemoryRecall when longTermMemory is false', async () => {
    const { createAgentRuntimeMemory } = await import('./runtime/memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: false,
      persistenceStore: {} as any,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('returns null longTermMemoryRecall when longTermMemory is undefined', async () => {
    const { createAgentRuntimeMemory } = await import('./runtime/memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: undefined,
      persistenceStore: {} as any,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('always returns an object with longTermMemoryRecall property', async () => {
    const { createAgentRuntimeMemory } = await import('./runtime/memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      persistenceStore: {} as any,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result).toHaveProperty('longTermMemoryRecall');
  });
});
