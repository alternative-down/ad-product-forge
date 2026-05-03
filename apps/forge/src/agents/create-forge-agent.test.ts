import { describe, expect, test, vi } from 'vitest';

// ── vi.hoisted must be at module top level ─────────────────────────────────
const mockMemoryStore = vi.hoisted(() => ({
  attachRecallIndexRefresh: vi.fn(),
  getMessages: vi.fn(),
  insertMessages: vi.fn(),
}));
const mockRuntimeMemory = vi.hoisted(() => ({
  longTermMemoryRecall: null,
  getMessages: vi.fn(),
  insertMessages: vi.fn(),
}));

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('@forge-runtime/core', () => {
  const mockSession = vi.fn();
  return {
    createRuntimeAgentSession: mockSession,
    createExternalAccountTools: vi.fn().mockReturnValue({}),
    toolsToRuntimeActions: vi.fn().mockReturnValue([]),
    toMastraSafeIdentifier: vi.fn((s: string) => s),
  };
});

vi.mock('../database', () => ({
  getDatabase: vi.fn().mockReturnValue({}),
}));

vi.mock('./agent-long-term-memory-store', () => ({
  createAgentLongTermMemoryStore: vi.fn(() => mockMemoryStore),
}));

vi.mock('./runtime/platform', () => ({
  createAgentRuntimePlatform: vi.fn().mockResolvedValue({
    mastraId: 'forge-agent',
    agentWorkspacePath: '/workspaces/forge-agent',
    agentMemoryPath: '/workspaces/forge-agent/memory',
    conversationStore: {},
    workspaceActions: [],
    communication: {},
  }),
}));

vi.mock('./agent-long-term-memory', () => ({
  createAgentLongTermMemory: vi.fn().mockReturnValue(null),
}));

vi.mock('./agent-runtime-memory', () => ({
  createAgentRuntimeMemory: vi.fn().mockResolvedValue(mockRuntimeMemory),
}));

vi.mock('./agent-runtime-prompt', () => ({
  buildAgentSystemPrompt: vi.fn().mockReturnValue('system prompt'),
}));

vi.mock('./mcp/client-manager', () => ({
  createAgentMcpRuntimeActionSource: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('./migrate-legacy-checkpointed-om', () => ({
  migrateLegacyCheckpointedOmState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./normalize-operational-memory-messages', () => ({
  normalizeOperationalMemoryMessages: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { createForgeAgent, createAgent } from './create-forge-agent';

const minimalConfig = {
  id: 'test-agent',
  name: 'Test Agent',
  checkpointedOmTotalContextTokens: 50000,
  checkpointedOmRecentRawTokens: 10000,
  checkpointedOmRawObservationBatchTokens: 5000,
  checkpointedOmObservationReflectionBatchTokens: 5000,
  checkpointedOmObservationSupportTokens: 2000,
  checkpointedOmReflectionSupportTokens: 2000,
};

describe('createForgeAgent — config validation', () => {
  test('throws when checkpointedOmTotalContextTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmTotalContextTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmTotalContextTokens is required in agent runtime config.',
    );
  });

  test('throws when checkpointedOmRecentRawTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmRecentRawTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmRecentRawTokens is required in agent runtime config.',
    );
  });

  test('throws when checkpointedOmRawObservationBatchTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmRawObservationBatchTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmRawObservationBatchTokens is required in agent runtime config.',
    );
  });

  test('throws when checkpointedOmObservationReflectionBatchTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmObservationReflectionBatchTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmObservationReflectionBatchTokens is required in agent runtime config.',
    );
  });

  test('throws when checkpointedOmObservationSupportTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmObservationSupportTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmObservationSupportTokens is required in agent runtime config.',
    );
  });

  test('throws when checkpointedOmReflectionSupportTokens is missing', async () => {
    const config = { ...minimalConfig } as any;
    delete config.checkpointedOmReflectionSupportTokens;
    await expect(createForgeAgent(config)).rejects.toThrow(
      'checkpointedOmReflectionSupportTokens is required in agent runtime config.',
    );
  });
});

describe('createAgent — config validation', () => {
  test('createAgent with longTermMemory=true requires contractStore', async () => {
    const config = { ...minimalConfig };
    const options = { longTermMemory: true };
    await expect(
      createAgent(config as any, options),
    ).rejects.toThrow();
  });
});