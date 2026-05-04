import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';

import { InMemoryConversationStore } from 'agent-runtime-core/integrations';

import type { CreateRuntimeAgentSessionOptions } from './runtime-agent-session.js';
import type { ForgeConversationMemory } from './memory.js';

// ---------------------------------------------------------------------
// Shared mock state via vi.hoisted — module-local, safe to update
// ---------------------------------------------------------------------

const { sharedMocks, mockLogger } = vi.hoisted(() => {
  const warnMock = vi.fn();
  const debugMock = vi.fn();
  const errorMock = vi.fn();

  const memorySync = vi.fn().mockResolvedValue(undefined);
  const memoryStabilize = vi.fn().mockResolvedValue(undefined);

  const innerMemory = {
    sync: memorySync,
    stabilize: memoryStabilize,
  };

  const conversationMemory = {
    memory: innerMemory,
    captureRunHistoryWindow: vi.fn().mockResolvedValue({
      historyStartMessageId: null,
      historyEndMessageId: null,
    }),
    renderModelMessages: vi.fn().mockResolvedValue([]),
    plugins: [],
    observers: [],
  } as unknown as ForgeConversationMemory;



  const createForgeConversationMemory = vi.fn().mockReturnValue(conversationMemory);
  const createOperationalMemoryConversationObserver = vi.fn().mockReturnValue({
    onStepComplete: vi.fn(),
    onGenerationStart: vi.fn(),
  });
  const readOperationalMemoryState = vi.fn().mockResolvedValue({ observationMessages: [] });
  const toolToRuntimeAction = vi.fn().mockImplementation((tool: { id: string }) => ({
    name: tool.id,
    description: 'mocked action',
    inputSchema: {},
    parseInput: vi.fn(),
    execute: vi.fn(),
  }));

  const mockLogger = {
    warn: warnMock,
    debug: debugMock,
    info: vi.fn(),
    error: errorMock,
  };

  return {
    sharedMocks: {
      warnMock,
      debugMock,
      errorMock,
      memorySync,
      memoryStabilize,
      innerMemory,
      conversationMemory,
      createForgeConversationMemory,
      createOperationalMemoryConversationObserver,
      readOperationalMemoryState,
      toolToRuntimeAction,
    },
    mockLogger,
  };
});

// ---------------------------------------------------------------------
// Module mocks — applied before SUT import
// ---------------------------------------------------------------------

vi.mock('./memory.js', () => ({
  createForgeConversationMemory: sharedMocks.createForgeConversationMemory,
}));

vi.mock('./operational-memory-conversation-observer.js', () => ({
  createOperationalMemoryConversationObserver: sharedMocks.createOperationalMemoryConversationObserver,
}));


vi.mock('./tools.js', () => ({
  toolToRuntimeAction: sharedMocks.toolToRuntimeAction,
}));

vi.mock('./operational-memory-state.js', () => ({
  readOperationalMemoryState: sharedMocks.readOperationalMemoryState,
}));

vi.mock('./logger.js', () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------
// SUT import — ESM top-level (must come after vi.mock)
// ---------------------------------------------------------------------

const { createRuntimeAgentSessionRuntime } = await import('./runtime-agent-session-runtime.js');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function makeModel() {
  return new MockLanguageModelV3({
    doGenerate: async () => { throw new Error('not used'); },
  });
}

function makeMinimalOptions(overrides: Partial<CreateRuntimeAgentSessionOptions> = {}): CreateRuntimeAgentSessionOptions {
  return {
    model: makeModel(),
    threadId: 'thread_test',
    resourceId: 'resource_test',
    conversationStore: new InMemoryConversationStore(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe('createRuntimeAgentSessionRuntime', () => {
  it('returns an object with the expected shape', async () => {
    const runtime = await createRuntimeAgentSessionRuntime(makeMinimalOptions());

    expect(runtime).toMatchObject({
      model: expect.anything(),
      conversationStore: expect.anything(),
      conversationMemory: expect.anything(),
    });
    expect(typeof runtime.getRuntimeActions).toBe('function');
    expect(typeof runtime.syncState).toBe('function');
  });

  it('passes assistantAuthorId through to the runtime', async () => {
    const runtime = await createRuntimeAgentSessionRuntime(
      makeMinimalOptions({ assistantAuthorId: 'agent_sess_42' }),
    );
    expect(runtime.assistantAuthorId).toBe('agent_sess_42');
  });

  it('does not pass assistantAuthorId when omitted', async () => {
    const runtime = await createRuntimeAgentSessionRuntime(makeMinimalOptions());
    expect(runtime.assistantAuthorId).toBeUndefined();
  });
});

describe('getRuntimeActions', () => {
  it('returns static actions when loadRuntimeActions is absent', async () => {
    const runtime = await createRuntimeAgentSessionRuntime(makeMinimalOptions());
    const actions = await runtime.getRuntimeActions();

    expect(actions).toHaveLength(2);
    expect(actions.map(a => a.name).sort()).toEqual(['enterPlanMode', 'exitPlanMode']);
  });

  it('appends dynamic actions when loadRuntimeActions succeeds', async () => {
    const dynamicActions = [
      {
        name: 'custom-action',
        description: 'custom',
        inputSchema: {},
        parseInput: vi.fn(),
        execute: vi.fn(),
      },
    ];

    const runtime = await createRuntimeAgentSessionRuntime(
      makeMinimalOptions({ runtimeActions: dynamicActions }),
    );
    const actions = await runtime.getRuntimeActions();

    expect(actions).toHaveLength(3);
    expect(actions[0].name).toBe('custom-action');
    expect(actions.map(a => a.name).sort()).toEqual(['custom-action', 'enterPlanMode', 'exitPlanMode']);
  });

  it('logs a warning and omits dynamic actions when loadRuntimeActions throws', async () => {
    sharedMocks.warnMock.mockClear();

    const runtime = await createRuntimeAgentSessionRuntime(
      makeMinimalOptions({
        loadRuntimeActions: vi.fn().mockRejectedValue(new Error('load failed')),
      }),
    );
    const actions = await runtime.getRuntimeActions();

    expect(actions).toHaveLength(2); // plan-mode actions always present
    expect(sharedMocks.warnMock).toHaveBeenCalledTimes(1);
    const [scope, message] = sharedMocks.warnMock.mock.calls[0];
    expect(scope).toBe('runtime');
    expect(message).toBe('Failed to load dynamic runtime actions');
  });
});

describe('syncState', () => {
  it('calls memory.sync when consolidateConversationOverflow is disabled', async () => {
    sharedMocks.memorySync.mockClear();

    const runtime = await createRuntimeAgentSessionRuntime(
      makeMinimalOptions({ consolidateConversationOverflow: false }),
    );
    await runtime.syncState();

    expect(sharedMocks.memorySync).toHaveBeenCalledTimes(1);
  });

  it('calls memory.stabilize when consolidateConversationOverflow is enabled', async () => {
    sharedMocks.memoryStabilize.mockClear();

    const runtime = await createRuntimeAgentSessionRuntime(
      makeMinimalOptions({
        consolidateConversationOverflow: true,
        checkpointedOmLimits: {
          recentRawTokens: 1000,
          rawObservationBatchTokens: 500,
          observationSupportTokens: 200,
        },
        checkpointedOmModel: makeModel(),
        checkpointedOmSystemPrompt: 'test prompt',
      }),
    );
    await runtime.syncState();

    expect(sharedMocks.memoryStabilize).toHaveBeenCalledTimes(1);
  });

  it('records diagnostics events during sync when diagnostics callback is provided', async () => {
    const recordMock = vi.fn();

    const runtime = await createRuntimeAgentSessionRuntime(makeMinimalOptions());
    await runtime.syncState({ diagnostics: { record: recordMock } });

    // syncState always records a "sync.complete" diagnostic event
    expect(recordMock).toHaveBeenCalled();
    const event = recordMock.mock.calls[0][0];
    
    expect(event.scope).toBe('om');
    expect(['sync-state-start', 'sync-state-after-conversation-memory', 'sync-state-finished']).toContain(event.phase);
  });

  it('throws when consolidateConversationOverflow is true but checkpointedOmLimits is absent', async () => {
    await expect(
      createRuntimeAgentSessionRuntime(
        makeMinimalOptions({ consolidateConversationOverflow: true }),
      ),
    ).rejects.toThrow(
      'Operational OM limits are required when conversation overflow consolidation is enabled.',
    );
  });
});
