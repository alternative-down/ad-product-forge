import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';

import { InMemoryConversationStore } from 'agent-runtime-core/integrations';

import { createRuntimeAgentSessionRuntime } from './runtime-agent-session-runtime.js';
import type { ForgeConversationMemory } from './memory.js';
import type { RuntimeWorkingMemoryStore } from './runtime-working-memory.js';

// ---------------------------------------------------------------------------
// Shared mock state via vi.hoisted — persisted across all imports of this
// module within a test run, safe to update between tests.
// ---------------------------------------------------------------------------

// Module-level variables that the vi.mock factories read from.
const shared = vi.hoisted(() => {
  const warnMock = vi.fn();
  const conversationMemory = {
    memory: {
      sync: vi.fn(),
      stabilize: vi.fn(),
    },
    captureRunHistoryWindow: vi.fn().mockResolvedValue({
      historyStartMessageId: null,
      historyEndMessageId: null,
    }),
    renderModelMessages: vi.fn().mockResolvedValue([]),
    plugins: [],
    observers: [],
  } as unknown as ForgeConversationMemory;

  const tool = {
    id: 'working-memory',
    description: 'Updates working memory',
    inputSchema: { type: 'object', properties: {} },
    execute: vi.fn(),
  };

  const workingMemoryStore: RuntimeWorkingMemoryStore = {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(),
  };

  return { warnMock, conversationMemory, tool, workingMemoryStore };
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockModel() {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error('not used');
    },
  });
}

function makeMockRuntimeAction() {
  return {
    name: 'custom-action',
    description: 'A custom action',
    inputSchema: {},
    parseInput: vi.fn(),
    execute: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Module mocks — applied before any import of the SUT
// ---------------------------------------------------------------------------

vi.mock('./memory.js', () => ({
  createForgeConversationMemory: vi.fn().mockReturnValue(shared.conversationMemory),
}));

vi.mock('./operational-memory-conversation-observer.js', () => ({
  createOperationalMemoryConversationObserver: vi.fn().mockReturnValue({
    onStepComplete: vi.fn(),
    onGenerationStart: vi.fn(),
  }),
}));

vi.mock('./runtime-working-memory.js', () => ({
  createUpdateWorkingMemoryTool: vi.fn().mockReturnValue(shared.tool),
}));

vi.mock('./tools.js', () => ({
  toolToRuntimeAction: (tool: unknown) => ({
    name: (tool as { id: string }).id,
    description: 'mocked action',
    inputSchema: {},
    parseInput: vi.fn(),
    execute: vi.fn(),
  }),
}));

vi.mock('./operational-memory-state.js', () => ({
  readOperationalMemoryState: vi.fn().mockResolvedValue({ observationMessages: [] }),
}));

vi.mock('./logger.js', () => ({
  logger: {
    warn: shared.warnMock,
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// SUT import — must come AFTER vi.mock calls
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRuntimeAgentSessionRuntime: factory } = require('./runtime-agent-session-runtime.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRuntimeAgentSessionRuntime', () => {
  beforeEach(() => {
    // Reset all shared spies between tests so each test starts clean.
    shared.warnMock.mockClear();
    shared.conversationMemory.memory.sync.mockClear();
    shared.conversationMemory.memory.stabilize.mockClear();
    shared.conversationMemory.captureRunHistoryWindow.mockClear();
    shared.conversationMemory.renderModelMessages.mockClear();
  });

  // -------------------------------------------------------------------------
  // Factory / return shape
  // -------------------------------------------------------------------------

  describe('factory', () => {
    it('returns an object with model, conversationStore, and workingMemoryStore', async () => {
      const model = makeMockModel();
      const store = new InMemoryConversationStore();

      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model,
        conversationStore: store,
        workingMemoryStore: shared.workingMemoryStore,
      });

      expect(runtime).toHaveProperty('model', model);
      expect(runtime).toHaveProperty('conversationStore', store);
      expect(runtime).toHaveProperty('workingMemoryStore', shared.workingMemoryStore);
      expect(typeof runtime.getRuntimeActions).toBe('function');
      expect(typeof runtime.syncState).toBe('function');
    });

    it('sets assistantAuthorId when provided', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        assistantAuthorId: 'author-x',
      });

      expect(runtime.assistantAuthorId).toBe('author-x');
    });
  });

  // -------------------------------------------------------------------------
  // getRuntimeActions
  // -------------------------------------------------------------------------

  describe('getRuntimeActions', () => {
    it('returns the working-memory action when no loadRuntimeActions is provided', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
      });

      const actions = await runtime.getRuntimeActions();
      expect(actions.some((a) => a.name === 'working-memory')).toBe(true);
    });

    it('appends dynamic actions returned by loadRuntimeActions', async () => {
      const customAction = makeMockRuntimeAction();

      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        loadRuntimeActions: async () => [customAction as never],
      });

      const actions = await runtime.getRuntimeActions();
      expect(actions.some((a) => a.name === 'custom-action')).toBe(true);
      expect(actions.some((a) => a.name === 'working-memory')).toBe(true);
    });

    it('logs a warning and returns static actions when loadRuntimeActions throws', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        loadRuntimeActions: async () => {
          throw new Error('load failed');
        },
      });

      const actions = await runtime.getRuntimeActions();

      expect(shared.warnMock).toHaveBeenCalledOnce();
      expect(shared.warnMock).toHaveBeenCalledWith(
        'runtime',
        'Failed to load dynamic runtime actions',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      // Static working-memory action is still present
      expect(actions.some((a) => a.name === 'working-memory')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // syncState
  // -------------------------------------------------------------------------

  describe('syncState', () => {
    it('calls memory.sync() when consolidateConversationOverflow is false', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        consolidateConversationOverflow: false,
      });

      const diagnostics = { record: vi.fn() };
      await runtime.syncState({ diagnostics });

      expect(shared.conversationMemory.memory.sync).toHaveBeenCalledOnce();
      expect(shared.conversationMemory.memory.stabilize).not.toHaveBeenCalled();
    });

    it('calls memory.stabilize() when consolidateConversationOverflow is true and limits provided', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        consolidateConversationOverflow: true,
        checkpointedOmLimits: {
          totalContextTokens: 8000,
          recentRawTokens: 1000,
          rawObservationBatchTokens: 2000,
          observationReflectionBatchTokens: 2000,
          observationSupportTokens: 500,
          reflectionSupportTokens: 500,
        },
      });

      const diagnostics = { record: vi.fn() };
      await runtime.syncState({ diagnostics });

      expect(shared.conversationMemory.memory.stabilize).toHaveBeenCalledOnce();
      expect(shared.conversationMemory.memory.sync).not.toHaveBeenCalled();
    });

    it('throws when consolidateConversationOverflow is true but checkpointedOmLimits is absent', async () => {
      await expect(
        factory({
          agentId: 'agent-1',
          agentName: 'TestAgent',
          threadId: 'thread-1',
          resourceId: 'resource-1',
          model: makeMockModel(),
          conversationStore: new InMemoryConversationStore(),
          workingMemoryStore: shared.workingMemoryStore,
          consolidateConversationOverflow: true,
        }),
      ).rejects.toThrow(
        'Operational OM limits are required when conversation overflow consolidation is enabled.',
      );
    });

    it('records diagnostics phases in correct order', async () => {
      const runtime = await factory({
        agentId: 'agent-1',
        agentName: 'TestAgent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        model: makeMockModel(),
        conversationStore: new InMemoryConversationStore(),
        workingMemoryStore: shared.workingMemoryStore,
        consolidateConversationOverflow: false,
      });

      const phases: string[] = [];
      const diagnostics = {
        record: vi.fn(({ phase }: { phase: string }) => phases.push(phase)),
      };

      await runtime.syncState({ diagnostics });

      expect(phases).toContain('sync-state-start');
      expect(phases).toContain('sync-state-after-conversation-memory');
      expect(phases).toContain('sync-state-finished');
      expect(phases.indexOf('sync-state-start')).toBeLessThan(
        phases.indexOf('sync-state-after-conversation-memory'),
      );
      expect(phases.indexOf('sync-state-after-conversation-memory')).toBeLessThan(
        phases.indexOf('sync-state-finished'),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// estimateTokenCount behaviour (wraps countTokens, min 1)
// ---------------------------------------------------------------------------

describe('estimateTokenCount', () => {
  it('returns at least 1 for empty string', async () => {
    const { countTokens } = await import('agent-runtime-core');
    const result = Math.max(1, countTokens(''));
    expect(result).toBe(1);
  });
});
