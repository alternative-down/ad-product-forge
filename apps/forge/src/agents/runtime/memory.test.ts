import { describe, it, expect, vi, beforeEach } from 'vitest';

const WORKSPACE_EMBEDDER_ID = Symbol.for('WorkspaceEmbedderId');
const CONVERSATION_STORE = Symbol.for('ConversationStore');

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  WorkspaceEmbedderId: WORKSPACE_EMBEDDER_ID,
  ConversationStore: CONVERSATION_STORE,
}));

vi.mock('../ltm/recall', () => ({
  createAgentLongTermMemoryRecall: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../ltm/store', () => ({
  createAgentLongTermMemoryStore: vi.fn(),
}));

import { createAgentRuntimeMemory } from './memory';

describe('createAgentRuntimeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns longTermMemoryRecall when longTermMemory is true', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-1',
      mastraId: 'mastra-1',
      agentWorkspacePath: '/ws',
      agentModel: {},
      agentMemoryPath: '/ws/memory',
      longTermMemory: true,
      workspaceEmbedder: 'transformers-multilingual-e5-small-cpu' as any,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 5000 },
      persistenceStore: {} as any,
    });

    expect(result.longTermMemoryRecall).toBeDefined();
    expect(createAgentLongTermMemoryRecall).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
    }));
  });

  it('returns null longTermMemoryRecall when longTermMemory is false', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');

    const result = await createAgentRuntimeMemory({
      agentId: 'agent-1',
      mastraId: 'mastra-1',
      agentWorkspacePath: '/ws',
      agentModel: {},
      agentMemoryPath: '/ws/memory',
      longTermMemory: false,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 5000 },
      persistenceStore: {} as any,
    });

    expect(result.longTermMemoryRecall).toBeNull();
    expect(createAgentLongTermMemoryRecall).not.toHaveBeenCalled();
  });

  it('calls initialize on recall when longTermMemory is enabled', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');
    const recall = { initialize: vi.fn().mockResolvedValue(undefined) };
    createAgentLongTermMemoryRecall.mockReturnValueOnce(recall);

    await createAgentRuntimeMemory({
      agentId: 'agent-1',
      mastraId: 'mastra-1',
      agentWorkspacePath: '/ws',
      agentModel: {},
      agentMemoryPath: '/ws/memory',
      longTermMemory: true,
      conversationStore: {} as any,
      checkpointedOmLimits: { recentRawTokens: 5000 },
      persistenceStore: {} as any,
    });

    expect(recall.initialize).toHaveBeenCalledTimes(1);
  });
});