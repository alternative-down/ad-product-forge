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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAgentRuntimeMemory', () => {
  it('creates longTermMemoryRecall when longTermMemory is true', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: true,
      persistenceStore: {},
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBe(mockRecallInstance);
    expect(mockCreateLtmRecall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-123',
        agentWorkspacePath: '/tmp/workspace',
        persistenceStore: {},
        conversationStore: expect.anything(),
        recentRawTokens: 2048,
      }),
    );
  });

  it('returns null longTermMemoryRecall when longTermMemory is false', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: false,
      persistenceStore: {},
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('returns null longTermMemoryRecall when longTermMemory is undefined', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      longTermMemory: undefined,
      persistenceStore: {},
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('always returns an object with longTermMemoryRecall property', async () => {
    const { createAgentRuntimeMemory } = await import('./agent-runtime-memory');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-123',
      mastraId: 'mastra-abc',
      agentWorkspacePath: '/tmp/workspace',
      agentModel: {},
      agentMemoryPath: '/tmp/memory',
      persistenceStore: {},
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    });

    expect(result).toHaveProperty('longTermMemoryRecall');
  });
});