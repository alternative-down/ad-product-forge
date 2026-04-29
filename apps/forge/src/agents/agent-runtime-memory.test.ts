import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRecallInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
};

const mockCreateLtmRecall = vi.fn().mockReturnValue(mockRecallInstance);

vi.mock('./agent-long-term-memory-recall', () => ({
  createAgentLongTermMemoryRecall: mockCreateLtmRecall,
}));

vi.mock('./agent-long-term-memory-store', () => ({
  createAgentLongTermMemoryStore: vi.fn(() => ({})),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAgentRuntimeMemory', () => {
  it('creates longTermMemoryRecall when longTermMemory is true', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const persistenceStore = {} as any;
    const conversationStore = {} as any;

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/workspace/agent-123',
      agentMemoryPath: '/workspace/agent-123/memory',
      agentModel: {},
      longTermMemory: true,
      workspaceEmbedder: 'claude-4-sonnet',
      conversationStore,
      checkpointedOmLimits: { recentRawTokens: 8000 },
      persistenceStore,
      readRuntimeMemorySettings: vi.fn().mockResolvedValue({
        ltmRecallSearchMode: 'hybrid' as const,
        ltmRecallWorkspaceTopK: 5,
        ltmRecallGraphTopK: 3,
        ltmRecallGraphThreshold: 0.7,
        ltmRecallGraphRandomWalkSteps: 10,
        ltmRecallGraphIncludeSources: true,
        ltmRecallScoreThreshold: 0.5,
        ltmRecallDocumentCount: 10,
      }),
    });

    expect(result.longTermMemoryRecall).toBeDefined();
    expect(mockCreateLtmRecall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-123',
        agentWorkspacePath: '/workspace/agent-123',
        agentMemoryPath: '/workspace/agent-123/memory',
        workspaceEmbedder: 'claude-4-sonnet',
        mastraId: 'mastra-abc',
      }),
    );
    expect(mockRecallInstance.initialize).toHaveBeenCalled();
  });

  it('returns null longTermMemoryRecall when longTermMemory is false', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-456',
      mastraId: 'mastra-xyz',
      agentWorkspacePath: '/workspace/agent-456',
      agentMemoryPath: '/workspace/agent-456/memory',
      agentModel: {},
      longTermMemory: false,
      conversationStore: {} as any,
      checkpointedOmLimits: {},
      persistenceStore: {} as any,
    });

    expect(result.longTermMemoryRecall).toBeNull();
    expect(mockCreateLtmRecall).not.toHaveBeenCalled();
  });

  it('returns null longTermMemoryRecall when longTermMemory is undefined', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-789',
      mastraId: 'mastra-qrs',
      agentWorkspacePath: '/workspace/agent-789',
      agentMemoryPath: '/workspace/agent-789/memory',
      agentModel: {},
      conversationStore: {} as any,
      checkpointedOmLimits: {},
      persistenceStore: {} as any,
    });

    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('always returns an object with longTermMemoryRecall property', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-test',
      mastraId: 'mastra-test',
      agentWorkspacePath: '/workspace/test',
      agentMemoryPath: '/workspace/test/memory',
      agentModel: {},
      longTermMemory: true,
      conversationStore: {} as any,
      checkpointedOmLimits: {},
      persistenceStore: {} as any,
      readRuntimeMemorySettings: vi.fn().mockResolvedValue({
        ltmRecallSearchMode: 'vector' as const,
        ltmRecallWorkspaceTopK: 10,
        ltmRecallGraphTopK: 5,
        ltmRecallGraphThreshold: 0.5,
        ltmRecallGraphRandomWalkSteps: 20,
        ltmRecallGraphIncludeSources: false,
        ltmRecallScoreThreshold: 0.3,
        ltmRecallDocumentCount: 20,
      }),
    });

    expect(result).toHaveProperty('longTermMemoryRecall');
  });
});