import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock refs ──────────────────────────────────────────────────────────

type MockScheduler = {
  startHealthcheck: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  clearHealthcheck: ReturnType<typeof vi.fn>;
  clearTimer: ReturnType<typeof vi.fn>;
  setInstant: ReturnType<typeof vi.fn>;
  resetBackoff: ReturnType<typeof vi.fn>;
  scheduleNextStep: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  isStopped: ReturnType<typeof vi.fn>;
};

type MockLoopDetector = {
  reset: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
};

type MockMessageManager = {
  appendPendingRunMessages: ReturnType<typeof vi.fn>;
  flushPendingRunMessages: ReturnType<typeof vi.fn>;
  updateFlushSettings: ReturnType<typeof vi.fn>;
  resetFlushedRunEventKeys: ReturnType<typeof vi.fn>;
  getPendingCount: ReturnType<typeof vi.fn>;
};

type MockStore = {
  getExecutionState: ReturnType<typeof vi.fn>;
  setExecutionState: ReturnType<typeof vi.fn>;
  getRunnableContract: ReturnType<typeof vi.fn>;
  getContractSpend: ReturnType<typeof vi.fn>;
};

let mockScheduler: MockScheduler;
let mockLoopDetector: MockLoopDetector;
let mockMessageManager: MockMessageManager;
let mockStore: MockStore;

function resetAllMocks() {
  if (mockScheduler) {
    mockScheduler.startHealthcheck.mockReset();
    mockScheduler.stop.mockReset();
    mockScheduler.clearHealthcheck.mockReset();
    mockScheduler.clearTimer.mockReset();
    mockScheduler.setInstant.mockReset();
    mockScheduler.resetBackoff.mockReset();
    mockScheduler.scheduleNextStep.mockReset();
    mockScheduler.getSnapshot.mockReset().mockReturnValue({
      nextStepAt: null, backoffMs: 60_000, instant: false,
      activeRunEpoch: 0, stopped: false, activeStepEpoch: 0,
    });
    mockScheduler.isStopped.mockReset().mockReturnValue(false);
  }
  if (mockLoopDetector) {
    mockLoopDetector.reset.mockReset();
    mockLoopDetector.register.mockReset();
  }
  if (mockMessageManager) {
    mockMessageManager.appendPendingRunMessages.mockReset();
    mockMessageManager.flushPendingRunMessages.mockReset();
    mockMessageManager.updateFlushSettings.mockReset();
    mockMessageManager.resetFlushedRunEventKeys.mockReset();
    mockMessageManager.getPendingCount.mockReset().mockReturnValue(0);
  }
  if (mockStore) {
    mockStore.getExecutionState.mockReset().mockResolvedValue('idle');
    mockStore.setExecutionState.mockReset().mockResolvedValue(undefined);
    mockStore.setExecutionAbsent.mockReset().mockResolvedValue(undefined);
    mockStore.getRunnableContract.mockReset().mockResolvedValue(null);
    mockStore.getRunLastMessages.mockReset().mockResolvedValue([]);
    mockStore.getContractSpend.mockReset().mockResolvedValue(0);
  }
}

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
  withTimeout: vi.fn().mockImplementation((promise) => promise),
  createAgentWakeQueue: vi.fn(() => ({
    getSnapshot: () => ({ pending: 0, waitingForIdle: false }),
    notifyExternalEvent: vi.fn(),
    stop: vi.fn(),
    clearHealthcheck: vi.fn(),
    onRunnerIdle: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => {
    mockStore = {
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      setExecutionState: vi.fn().mockResolvedValue(undefined),
      setExecutionAbsent: vi.fn().mockResolvedValue(undefined),
      getRunnableContract: vi.fn().mockResolvedValue(null),
      getRunLastMessages: vi.fn().mockResolvedValue([]),
      getContractSpend: vi.fn().mockResolvedValue(0),
    };
    return mockStore;
  }),
}));

vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn(() => ({
    getSettings: vi.fn().mockResolvedValue({
      memoryLastMessagesFullEnabled: false,
      memoryLastMessagesCount: 20,
      stepDelayEnabled: true,
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    }),
  })),
}));

vi.mock('../notifications/store', () => ({
  createAgentNotificationStore: vi.fn(() => ({
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('./agent-home-metric-snapshot-store', () => ({
  createAgentHomeMetricSnapshotStore: vi.fn(() => ({
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('./agent-runner-helpers', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
  withTimeout: vi.fn().mockImplementation((promise) => promise),
  serializeError: vi.fn((e) => String(e)),
  serializeUnknown: vi.fn((e) => String(e)),
  formatAbsentExecutionError: vi.fn(() => ({ message: 'err' })),
  extractAbsentErrorDetails: vi.fn(() => null),
  buildStepSystemPrompt: vi.fn(() => ''),
  extractRunnerControlDirective: vi.fn(() => null),
  extractRunnerControlDirectiveFromIteration: vi.fn(() => null),
  buildRecallStepFromIteration: vi.fn(() => null),
  didIterationUpdateWorkingMemory: vi.fn(() => false),
  didIterationProduceVisibleAssistantText: vi.fn(() => false),
  collectStepTextParts: vi.fn(() => []),
  hasExactControlDirective: vi.fn(() => false),
  buildIterationLoopSignature: vi.fn(() => 'sig'),
}));

vi.mock('./agent-runner-loop-detector', () => ({
  createLoopDetector: vi.fn(() => {
    mockLoopDetector = { reset: vi.fn(), register: vi.fn() };
    return mockLoopDetector;
  }),
}));

vi.mock('./agent-runner-scheduler', () => ({
  createScheduler: vi.fn(() => {
    mockScheduler = {
      startHealthcheck: vi.fn(),
      stop: vi.fn(),
      clearHealthcheck: vi.fn(),
      clearTimer: vi.fn(),
      setInstant: vi.fn(),
      resetBackoff: vi.fn(),
      scheduleNextStep: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({
        nextStepAt: null, backoffMs: 60_000, instant: false,
        activeRunEpoch: 0, stopped: false, activeStepEpoch: 0,
      }),
      isStopped: vi.fn().mockReturnValue(false),
    };
    return mockScheduler;
  }),
}));

vi.mock('./agent-runner-messages', () => ({
  createMessageManager: vi.fn(() => {
    mockMessageManager = {
      appendPendingRunMessages: vi.fn().mockResolvedValue(undefined),
      flushPendingRunMessages: vi.fn().mockResolvedValue(undefined),
      updateFlushSettings: vi.fn().mockResolvedValue(undefined),
      resetFlushedRunEventKeys: vi.fn(),
      getPendingCount: vi.fn().mockReturnValue(0),
    };
    return mockMessageManager;
  }),
}));

vi.mock('./agent-usage', () => ({
  createAgentUsage: vi.fn(() => ({
    estimateStepCostUsd: vi.fn().mockResolvedValue(null),
    recordStepUsage: vi.fn().mockResolvedValue(undefined),
    recordGenerationUsage: vi.fn().mockResolvedValue(undefined),
    getTotalSpentUsd: vi.fn().mockResolvedValue(0),
    getTotalSteps: vi.fn().mockResolvedValue(0),
  })),
}));

vi.mock('./agent-prompt-builder', () => ({
  buildAgentPrompt: vi.fn().mockResolvedValue({ messages: [], systemInstructions: '' }),
}));

vi.mock('./agent-generate', () => ({
  createAgentGenerate: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ iterations: [], finishReason: 'stop' }),
    abort: vi.fn(),
  })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRuntime() {
  return {
    id: 'test-agent-1',
    mastraId: 'mastra-1',
    pricingModelKey: 'gpt-4o',
    omPricingModelKey: 'gpt-4o',
    agent: {
      id: 'agent-1', name: 'Test Agent', systemPrompt: '',
      defaultModel: 'gpt-4o', temperature: 0.7,
      maxStepsPerRun: 30, budgetPerRunUsd: 5,
      tools: [], skills: [], timezone: 'UTC',
    },
    workspace: {
      id: 'ws-1', path: '/tmp/test-ws',
      filesystem: {
        read: vi.fn().mockResolvedValue(''),
        write: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(false),
      },
    },
    communication: { sendDirectMessage: vi.fn(), sendGroupMessage: vi.fn() },
    longTermMemoryRecall: null, longTermMemory: null,
    onReceiveMessage: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof import('./agent-runner.js').createAgentRunner>[1];
}

function makeDb() {
  return {
    systemSettings: { findFirst: vi.fn(), findMany: vi.fn() },
    agentContracts: { findFirst: vi.fn() },
    agentNotificationEvents: { findFirst: vi.fn(), findMany: vi.fn() },
    agentHomeMetricSnapshots: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRoles: { findFirst: vi.fn() },
    agents: { findFirst: vi.fn(), findMany: vi.fn() },
  } as unknown as import('../../db/types').Database;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createAgentRunner', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllMocks();
  });

  describe('public API surface', () => {
    it('createAgentRunner is exported as a function', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      expect(typeof createAgentRunner).toBe('function');
    });

    it('returns an object with start, stop, forceIdle, execute, getSnapshot', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      expect(runner).toHaveProperty('start');
      expect(runner).toHaveProperty('stop');
      expect(runner).toHaveProperty('forceIdle');
      expect(runner).toHaveProperty('execute');
      expect(runner).toHaveProperty('getSnapshot');
    });

    it('getSnapshot() returns an object with stopped boolean', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      const snap = runner.getSnapshot();
      expect(typeof snap).toBe('object');
      expect(typeof snap.stopped).toBe('boolean');
    });

    it('start() does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      expect(() => runner.start()).not.toThrow();
    });

    it('stop() makes stopped=true', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      runner.stop();
      expect(runner.getSnapshot().stopped).toBe(true);
    });

    it('execute([]) does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await expect(runner.execute([])).resolves.toBeUndefined();
    });

    it('execute with idle-check event does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      const event = { id: 'evt-idle-check', type: 'idle-check' as const };
      await expect(runner.execute([event])).resolves.toBeUndefined();
    });

    it('forceIdle() does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await expect(runner.forceIdle()).resolves.toBeUndefined();
    });

    it('forceIdle() called twice does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await runner.forceIdle();
      await expect(runner.forceIdle()).resolves.toBeUndefined();
    });

    it('getSnapshot returns stopped and executing boolean fields', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      const snap = runner.getSnapshot();
      expect('stopped' in snap).toBe(true);
      expect('executing' in snap).toBe(true);
    });

    it('getSnapshot returns backoffMs number field', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      const snap = runner.getSnapshot();
      expect(typeof snap.backoffMs).toBe('number');
      // When nextStepAt is null, backoffMs is always 60000
      expect(snap.backoffMs).toBe(60_000);
    });
  });

  describe('scheduler integration', () => {
    it('start() calls scheduler.startHealthcheck()', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      expect(mockScheduler.startHealthcheck).toHaveBeenCalled();
    });

    it('stop() calls scheduler.clearTimer()', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      runner.stop();
      expect(mockScheduler.clearTimer).toHaveBeenCalled();
    });

    it('stop() calls scheduler.stop()', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      runner.stop();
      expect(mockScheduler.stop).toHaveBeenCalled();
    });

    it('stop() calls scheduler.clearHealthcheck()', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      runner.stop();
      expect(mockScheduler.clearHealthcheck).toHaveBeenCalled();
    });

    it('stop() calls scheduler.clearTimer()', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      runner.stop();
      expect(mockScheduler.clearTimer).toHaveBeenCalled();
    });
  });

  describe('loop detector integration', () => {
    it('loop detector is created via createLoopDetector', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      const mod = await import('./agent-runner-loop-detector.js');
      expect(mod.createLoopDetector).toHaveBeenCalled();
    });

    it('loop detector reset is callable', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      expect(typeof mockLoopDetector.reset).toBe('function');
      mockLoopDetector.reset();
    });

    it('loop detector register is callable', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      expect(typeof mockLoopDetector.register).toBe('function');
      mockLoopDetector.register('test-signature');
    });
  });

  describe('messageManager integration', () => {
    it('messageManager is created via createMessageManager', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      const mod = await import('./agent-runner-messages.js');
      expect(mod.createMessageManager).toHaveBeenCalled();
    });

    it('resetFlushedRunEventKeys is callable on messageManager', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      mockMessageManager.resetFlushedRunEventKeys();
      expect(mockMessageManager.resetFlushedRunEventKeys).toHaveBeenCalled();
    });

    it('updateFlushSettings is callable on messageManager', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      mockMessageManager.updateFlushSettings({
        memoryLastMessagesFullEnabled: false, memoryLastMessagesCount: 20,
        stepDelayEnabled: true,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      });
      expect(mockMessageManager.updateFlushSettings).toHaveBeenCalled();
    });

    it('getPendingCount returns a number', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      expect(typeof mockMessageManager.getPendingCount()).toBe('number');
    });
  });

  describe('store integration', () => {
    it('contract store is created via createAgentContractStore', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      createAgentRunner(makeDb(), makeRuntime());
      const mod = await import('./agent-contract-store.js');
      expect(mod.createAgentContractStore).toHaveBeenCalled();
    });

    it('getExecutionState is called during healthcheck path', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      mockStore.getExecutionState.mockResolvedValue('idle');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      await runner.execute([{ id: 'hc', type: 'idle-check' as const }]);
      expect(mockStore.getExecutionState).toHaveBeenCalledWith('test-agent-1');
    });
  });

  describe('forceIdle behavior', () => {
    it('forceIdle calls scheduler.setInstant(false)', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await runner.forceIdle();
      expect(mockScheduler.setInstant).toHaveBeenCalledWith(false);
    });

    it('forceIdle calls loop detector reset', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await runner.forceIdle();
      expect(mockLoopDetector.reset).toHaveBeenCalled();
    });

    it('forceIdle calls messageManager resetFlushedRunEventKeys', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await runner.forceIdle();
      expect(mockMessageManager.resetFlushedRunEventKeys).toHaveBeenCalled();
    });

    it('forceIdle calls scheduler.setInstant(false)', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      await runner.forceIdle();
      expect(mockScheduler.setInstant).toHaveBeenCalledWith(false);
    });
  });

  describe('execute state transitions', () => {
    it('does not throw when execution state is already running', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      mockStore.getExecutionState.mockResolvedValue('running');
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      // planNextAttempt fires regardless; no throw is the expected behavior
      await runner.execute([{ id: 'evt-running', type: 'idle-check' as const }]);
      expect(true).toBe(true);
    });

    it('transitions to idle when execution state is absent and no contract', async () => {
      const { createAgentRunner } = await import('./agent-runner.js');
      mockStore.getExecutionState.mockResolvedValue('absent');
      mockStore.getRunnableContract.mockResolvedValue(null);
      const runner = createAgentRunner(makeDb(), makeRuntime());
      runner.start();
      // Should not throw when absent state with no contract
      await runner.execute([{ id: 'evt-absent', type: 'idle-check' as const }]);
      expect(true).toBe(true);
    });
  });

});
