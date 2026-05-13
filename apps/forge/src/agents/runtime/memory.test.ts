import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConversationStore } from '@forge-runtime/core';

// Mock the LTM recall factory — source calls createAgentLongTermMemoryRecall() once when
// longTermMemory=true, then calls .initialize() on the returned object.
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockRecallObject = { initialize: mockInitialize };

vi.mock('../ltm/recall', () => ({
  createAgentLongTermMemoryRecall: vi.fn(() => mockRecallObject),
}));

import { createAgentRuntimeMemory } from './memory';

// ---- Test helpers ----

function mockConversationStore(): ConversationStore {
  return {
    getMessages: vi.fn().mockResolvedValue([]),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getThreads: vi.fn().mockResolvedValue([]),
  } as unknown as ConversationStore;
}

function mockPersistenceStore() {
  return {
    readState: vi.fn().mockResolvedValue({ version: 1, packages: [] }),
    writeState: vi.fn().mockResolvedValue(undefined),
  };
}

function mockReadSettings() {
  return Promise.resolve({
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallWorkspaceTopK: 5,
    ltmRecallGraphTopK: 3,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 10,
    ltmRecallGraphIncludeSources: true,
    ltmRecallScoreThreshold: 0.5,
    ltmRecallDocumentCount: 20,
  });
}

function makeInput(overrides = {}) {
  return {
    agentId: 'agent-test-1',
    mastraId: 'mastra-1',
    agentWorkspacePath: '/tmp/ws',
    agentModel: { model: 'gpt-4' },
    agentMemoryPath: '/tmp/memory',
    conversationStore: mockConversationStore(),
    persistenceStore: mockPersistenceStore(),
    checkpointedOmLimits: { recentRawTokens: 1024 },
    readRuntimeMemorySettings: mockReadSettings,
    ...overrides,
  };
}

describe('createAgentRuntimeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
  });

  it('returns object with longTermMemoryRecall when longTermMemory=true', async () => {
    const result = await createAgentRuntimeMemory(makeInput({ longTermMemory: true }) as any);
    expect(result).toHaveProperty('longTermMemoryRecall');
    expect(result.longTermMemoryRecall).not.toBeNull();
  });

  it('calls createAgentLongTermMemoryRecall once when longTermMemory=true', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');
    await createAgentRuntimeMemory(makeInput({ longTermMemory: true }) as any);
    expect(createAgentLongTermMemoryRecall).toHaveBeenCalledTimes(1);
  });

  it('passes correct params to createAgentLongTermMemoryRecall', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');
    await createAgentRuntimeMemory(makeInput({
      longTermMemory: true,
      workspaceEmbedder: 'openai' as const,
      ltmRecallScoreThreshold: 0.6,
      ltmRecallDocumentCount: 15,
    }) as any);
    expect(createAgentLongTermMemoryRecall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-test-1',
        agentWorkspacePath: '/tmp/ws',
        agentMemoryPath: '/tmp/memory',
        workspaceEmbedder: 'openai',
        scoreThreshold: 0.6,
        documentCount: 15,
      }),
    );
  });

  it('returns null longTermMemoryRecall when longTermMemory=false', async () => {
    const result = await createAgentRuntimeMemory(makeInput({ longTermMemory: false }) as any);
    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('does not call createAgentLongTermMemoryRecall when longTermMemory=false', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');
    await createAgentRuntimeMemory(makeInput({ longTermMemory: false }) as any);
    expect(createAgentLongTermMemoryRecall).not.toHaveBeenCalled();
  });

  it('calls .initialize() on the recall object when longTermMemory=true', async () => {
    await createAgentRuntimeMemory(makeInput({ longTermMemory: true }) as any);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('does not call .initialize() when longTermMemory=false', async () => {
    await createAgentRuntimeMemory(makeInput({ longTermMemory: false }) as any);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('accepts optional omModel override', async () => {
    const result = await createAgentRuntimeMemory(makeInput({ omModel: { model: 'gpt-3.5' } }) as any);
    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('accepts memoryLastMessagesCount and tokenCountFilterLimit', async () => {
    const result = await createAgentRuntimeMemory(makeInput({
      memoryLastMessagesCount: 50,
      tokenCountFilterLimit: 4096,
    }) as any);
    expect(result.longTermMemoryRecall).toBeNull();
  });

  it('passes checkpointedOmLimits.recentRawTokens to recall factory', async () => {
    const { createAgentLongTermMemoryRecall } = await import('../ltm/recall');
    await createAgentRuntimeMemory(makeInput({
      longTermMemory: true,
      checkpointedOmLimits: { recentRawTokens: 2048 },
    }) as any);
    expect(createAgentLongTermMemoryRecall).toHaveBeenCalledWith(
      expect.objectContaining({ recentRawTokens: 2048 }),
    );
  });
});