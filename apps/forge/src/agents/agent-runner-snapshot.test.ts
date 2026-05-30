/**
 * Unit tests for agents/agent-runner-snapshot.ts.
 *
 * Tests buildRunnerSnapshot() — the snapshot builder for agent-runner health
 * and debug inspection.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildRunnerSnapshot, type AgentRunnerSnapshot } from './agent-runner-snapshot';

// ─── Mock factories ─────────────────────────────────────────────────────────

function makeSchedulerState(overrides: {
  nextStepAt?: number | null;
  backoffMs?: number;
  instant?: boolean;
  activeRunEpoch?: number;
  activeStepEpoch?: number;
  activeGenerateToken?: number;
} = {}) {
  return {
    nextStepAt: null,
    backoffMs: 60_000,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    ...overrides,
  };
}

function makeMessageManagerState(pendingRunMessages: Map<string, unknown> = new Map()) {
  return { pendingRunMessages };
}

function makeWakeQueue(snapshot: object = { queued: 0, executing: false, lastExecuteAt: null }) {
  return {
    getSnapshot: vi.fn(() => snapshot),
  };
}

function makeExtra(overrides: {
  stopped?: boolean;
  startingRun?: boolean;
  startingRunStartedAt?: number | null;
  executing?: boolean;
  lastStepStartedAt?: number | null;
  lastStepStage?: string | null;
  lastWakeStartedAt?: number | null;
  timer?: ReturnType<typeof setTimeout> | null;
} = {}) {
  return {
    stopped: false,
    startingRun: false,
    startingRunStartedAt: null,
    executing: false,
    lastStepStartedAt: null,
    lastStepStage: null,
    lastWakeStartedAt: null,
    timer: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRunnerSnapshot', () => {
  it('should be a valid interface (types only — runtime shape verified by buildRunnerSnapshot)', () => {
    // Verify the type is exportable and structurally sound
    const snapshot: AgentRunnerSnapshot = {
      stopped: false,
      instant: false,
      startingRun: false,
      startingRunStartedAt: null,
      executing: false,
      activeRunEpoch: 1,
      activeStepEpoch: 2,
      scheduled: false,
      backoffMs: 60_000,
      nextStepAt: null,
      estimatedDelayMs: null,
      lastStepStartedAt: null,
      lastStepStage: null,
      pendingRunEvents: [],
      wake: { queued: 0, executing: false, lastExecuteAt: null },
      lastWakeStartedAt: null,
    };
    expect(snapshot.activeRunEpoch).toBe(1);
    expect(snapshot.activeStepEpoch).toBe(2);
  });
});

describe('buildRunnerSnapshot', () => {
  it('should return a snapshot with correct stopped state', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra({ stopped: true });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.stopped).toBe(true);
  });

  it('should return a snapshot with correct scheduler fields', () => {
    const scheduler = {
      getState: vi.fn(() => makeSchedulerState({ activeRunEpoch: 5, activeStepEpoch: 12, backoffMs: 120_000 })),
    };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.activeRunEpoch).toBe(5);
    expect(snapshot.activeStepEpoch).toBe(12);
    expect(snapshot.backoffMs).toBe(120_000);
  });

  it('should set scheduled=true when timer is not null', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra({ timer: setTimeout(() => {}, 1000) });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.scheduled).toBe(true);
  });

  it('should set scheduled=false when timer is null', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra({ timer: null });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.scheduled).toBe(false);
  });

  it('should return estimatedDelayMs as null when nextStepAt is null', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState({ nextStepAt: null })) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.nextStepAt).toBeNull();
    expect(snapshot.estimatedDelayMs).toBeNull();
  });

  it('should return estimatedDelayMs >= 0 when nextStepAt is set in the future', () => {
    const futureTime = Date.now() + 30_000;
    const scheduler = { getState: vi.fn(() => makeSchedulerState({ nextStepAt: futureTime })) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.nextStepAt).toBe(futureTime);
    expect(snapshot.estimatedDelayMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.estimatedDelayMs).toBeLessThanOrEqual(30_000);
  });

  it('should return estimatedDelayMs as 0 when nextStepAt is in the past', () => {
    const pastTime = Date.now() - 10_000;
    const scheduler = { getState: vi.fn(() => makeSchedulerState({ nextStepAt: pastTime })) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.estimatedDelayMs).toBe(0);
  });

  it('should set instant from scheduler state', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState({ instant: true })) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.instant).toBe(true);
  });

  it('should forward lastStepStartedAt and lastStepStage from extra', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const now = 1_700_000_000_000;
    const extra = makeExtra({ lastStepStartedAt: now, lastStepStage: 'generate' });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.lastStepStartedAt).toBe(now);
    expect(snapshot.lastStepStage).toBe('generate');
  });

  it('should forward lastWakeStartedAt from extra', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const now = 1_800_000_000_000;
    const extra = makeExtra({ lastWakeStartedAt: now });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.lastWakeStartedAt).toBe(now);
  });

  it('should collect pendingRunEvents from messageManager', () => {
    const pending = new Map<string, unknown>([
      ['event-1', { type: 'run-start' }],
      ['event-2', { type: 'run-end' }],
    ]);
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState(pending)) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.pendingRunEvents).toHaveLength(2);
  });

  it('should return empty pendingRunEvents when no events are queued', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.pendingRunEvents).toHaveLength(0);
  });

  it('should forward executing and startingRun from extra', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue();
    const extra = makeExtra({ executing: true, startingRun: true, startingRunStartedAt: 1_700_000_000_000 });

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(snapshot.executing).toBe(true);
    expect(snapshot.startingRun).toBe(true);
    expect(snapshot.startingRunStartedAt).toBe(1_700_000_000_000);
  });

  it('should call wakeQueue.getSnapshot() to populate wake field', () => {
    const scheduler = { getState: vi.fn(() => makeSchedulerState()) };
    const messageManager = { getState: vi.fn(() => makeMessageManagerState()) };
    const wakeQueue = makeWakeQueue({ queued: 3, executing: true, lastExecuteAt: 1_750_000_000_000 });
    const extra = makeExtra();

    const snapshot = buildRunnerSnapshot(scheduler as any, messageManager as any, wakeQueue, extra);

    expect(wakeQueue.getSnapshot).toHaveBeenCalledTimes(1);
    expect(snapshot.wake.queued).toBe(3);
    expect(snapshot.wake.executing).toBe(true);
    expect(snapshot.wake.lastExecuteAt).toBe(1_750_000_000_000);
  });
});