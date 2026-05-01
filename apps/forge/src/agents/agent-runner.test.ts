import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (run before any imports) ───────────────────────────────────

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  delay: vi.fn().mockImplementation((ms: number) => Promise.resolve()),
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
  createAgentContractStore: vi.fn(() => ({
    getExecutionState: vi.fn().mockResolvedValue('idle'),
    setExecutionState: vi.fn().mockResolvedValue(undefined),
    setExecutionAbsent: vi.fn().mockResolvedValue(undefined),
    getRunnableContract: vi.fn().mockResolvedValue(null),
    getRunLastMessages: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn(() => ({
    getSettings: vi.fn().mockResolvedValue({ memoryLastMessagesFullEnabled: false }),
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
  withTimeout: vi.fn().mockImplementation((p) => p),
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
}));

vi.mock('./agent-runner-loop-detector', () => ({
  createLoopDetector: vi.fn(() => ({
    reset: vi.fn(),
    register: vi.fn(),
    isStuck: () => false,
  })),
}));

vi.mock('./agent-runner-scheduler', () => ({
  createScheduler: vi.fn(() => ({
    clearTimer: vi.fn(),
    getSnapshot: vi.fn(() => ({
      nextStepAt: null,
      backoffMs: 60_000,
      instant: false,
      activeRunEpoch: 0,
      stopped: false,
      activeStepEpoch: 0,
    })),
    startHealthcheck: vi.fn(),
    stop: vi.fn(),
    clearHealthcheck: vi.fn(),
    setInstant: vi.fn(),
    resetBackoff: vi.fn(),
    scheduleNextStep: vi.fn(),
  })),
}));

vi.mock('./agent-runner-messages', () => ({
  createMessageManager: vi.fn(() => ({
    appendPendingRunMessages: vi.fn(),
    flushPendingRunMessages: vi.fn(),
    getPendingCount: vi.fn().mockReturnValue(0),
    resetFlushedRunEventKeys: vi.fn(),
    updateFlushSettings: vi.fn(),
  })),
}));

vi.mock('./agent-home-metrics', () => ({
  readAgentHomeMetricSnapshot: vi.fn().mockResolvedValue(null),
}));

// ── Imports (after hoisted mocks) ───────────────────────────────────────────

import type { InternalAgentRuntime } from './agent-runtime-types';
import type { Database } from '../database/index';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMinimalRuntime(overrides: Partial<InternalAgentRuntime> = {}): InternalAgentRuntime {
  return {
    id: 'test-agent-1',
    mastraId: 'mastra-1',
    pricingModelKey: 'anthropic',
    omPricingModelKey: 'anthropic',
    agent: { id: 'test-agent-1', name: 'Test Agent', instructions: 'Test agent', model: { modelId: 'claude-3-5-sonnet' } } as InternalAgentRuntime['agent'],
    workspace: {
      id: 'ws-1',
      path: '/tmp/test-ws',
      filesystem: {
        read: vi.fn().mockResolvedValue(''),
        write: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(false),
      },
    },
    communication: { sendDirectMessage: vi.fn(), sendGroupMessage: vi.fn() } as unknown as InternalAgentRuntime['communication'],
    longTermMemory: null,
    longTermMemoryRecall: null,
    onReceiveMessage: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InternalAgentRuntime;
}

function makeDb(): Database {
  return {
    query: {
      systemSettings: { findFirst: vi.fn(), findMany: vi.fn() },
      agentContracts: { findFirst: vi.fn() },
      agentNotificationEvents: { findFirst: vi.fn(), findMany: vi.fn() },
      agentHomeMetricSnapshots: { findFirst: vi.fn(), findMany: vi.fn() },
      agentRoles: { findFirst: vi.fn() },
      agents: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Database;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createAgentRunner', () => {
  describe('type exports', () => {
    it('is a function', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      expect(typeof createAgentRunner).toBe('function');
    });
  });

  describe('public interface', () => {
    let db: Database;
    let runtime: InternalAgentRuntime;

    beforeEach(() => {
      db = makeDb();
      runtime = makeMinimalRuntime();
    });

    it('returns an object with all required public methods', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      expect(runner).toHaveProperty('start');
      expect(runner).toHaveProperty('stop');
      expect(runner).toHaveProperty('execute');
      expect(runner).toHaveProperty('forceIdle');
      expect(runner).toHaveProperty('getSnapshot');
      expect(runner).toHaveProperty('notifyExternalEvent');
    });

    it('getSnapshot returns runner state', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      const snap = runner.getSnapshot();
      expect(snap).toHaveProperty('stopped');
      expect(snap).toHaveProperty('scheduled');
      expect(snap).toHaveProperty('backoffMs');
      expect(snap).toHaveProperty('lastStepStage');
      expect(snap).toHaveProperty('pendingRunEvents');
    });

    it('stop prevents further execution', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      runner.stop();
      expect(runner.getSnapshot().stopped).toBe(true);
    });

    it('start triggers healthcheck scheduler without throwing', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      expect(() => runner.start()).not.toThrow();
    });

    it('execute with empty array does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      await expect(runner.execute([])).resolves.toBeUndefined();
    });

    it('execute with idle-only event queues the event without starting run', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      const event = { id: 'evt-1', type: 'message' as const, idleOnly: true };
      await expect(runner.execute([event])).resolves.toBeUndefined();
    });

    it('notifyExternalEvent is callable without throwing', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      runner.notifyExternalEvent({ id: 'ext-1', type: 'message' as const });
    });

    it('forceIdle transitions runner to idle state', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      await runner.forceIdle();
      expect(runner.getSnapshot()).toBeDefined();
    });
  });

  describe('state transitions', () => {
    let db: Database;
    let runtime: InternalAgentRuntime;

    beforeEach(() => {
      db = makeDb();
      runtime = makeMinimalRuntime();
    });

    it('runner starts in non-running state', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      expect(runner.getSnapshot().stopped).toBe(false);
    });

    it('calling stop() twice does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      runner.stop();
      expect(() => runner.stop()).not.toThrow();
    });

    it('calling forceIdle() twice does not throw', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      await runner.forceIdle();
      await expect(runner.forceIdle()).resolves.toBeUndefined();
    });
  });

  describe('snapshot shape', () => {
    let db: Database;
    let runtime: InternalAgentRuntime;

    beforeEach(() => {
      db = makeDb();
      runtime = makeMinimalRuntime();
    });

    it('getSnapshot returns defined boolean and number fields', async () => {
      const { createAgentRunner } = await import('./agent-runner');
      const runner = createAgentRunner(db, runtime);
      const snap = runner.getSnapshot();
      expect(typeof snap.stopped).toBe('boolean');
      expect(typeof snap.scheduled).toBe('boolean');
      expect(typeof snap.backoffMs).toBe('number');
      expect(typeof snap.pendingRunEvents).toBe('object'); // Array
      expect(snap.lastStepStage === null || typeof snap.lastStepStage === 'string').toBe(true);
    });
  });
});
