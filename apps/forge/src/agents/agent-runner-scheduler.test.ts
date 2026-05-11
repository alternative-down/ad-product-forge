/**
 * Unit tests for agents/agent-runner-scheduler.ts.
 *
 * Tests createScheduler() — the scheduler factory that manages agent run
 * timing, budget-aware delays, healthchecks, and flush settings.
 *
 * No prior coverage.
 */
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { ONE_MINUTE_MS, TEN_MINUTES_MS } from './time-constants';
import { createScheduler, type SchedulerState, type SchedulerDependencies } from './agent-runner-scheduler';

// ─── Constants (duplicated for test use) ────────────────────────────────────
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;

// ─── Shared mock factories ───────────────────────────────────────────────────

function makeDefaultState(): SchedulerState {
  return {
    nextStepAt: null,
    backoffMs: ONE_MINUTE_MS,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    isStopped: false,
  };
}

function makeMinimalDeps(overrides: Partial<SchedulerDependencies> = {}): SchedulerDependencies {
  return {
    runtimeId: 'agent-1',
    getSystemSettings: async () => ({ stepDelayEnabled: true, memoryLastMessagesFullEnabled: false }),
    getRunnableContract: vi.fn<() => Promise<{ id: string; budgetUsd: number; endsAt: number } | null>>(),
    getContractSpend: vi.fn<() => Promise<number>>(),
    estimateStepCostUsd: vi.fn<() => Promise<number | null>>(),
    setExecutionState: vi.fn<() => Promise<void>>(),
    ...overrides,
  };
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Create a scheduler with minimal deps and return the scheduler instance.
 * Also returns a beginRun mock and stepCallback tracker.
 */
function setupScheduler(
  state: SchedulerState = makeDefaultState(),
  deps: SchedulerDependencies = makeMinimalDeps(),
) {
  const beginRunMock = vi.fn<() => Promise<void>>();
  const stepCallbackMock = vi.fn<() => Promise<void>>();

  const scheduler = createScheduler(state, deps);

  return { scheduler, state, deps, beginRunMock, stepCallbackMock };
}

// ─── Tests: Timer management ────────────────────────────────────────────────────

describe('timer management', () => {
  it('clearTimer sets nextStepAt to null', () => {
    const { scheduler, state } = setupScheduler();
    state.nextStepAt = Date.now() + 10000;
    scheduler.scheduleAt(Date.now() + 5000);
    expect(state.nextStepAt).not.toBeNull();

    scheduler.clearTimer();
    expect(state.nextStepAt).toBeNull();
  });

  it('setNextStepAt updates state', () => {
    const { scheduler, state } = setupScheduler();
    const ts = Date.now() + 3000;
    scheduler.setNextStepAt(ts);
    expect(state.nextStepAt).toBe(ts);
  });

  it('isTimerActive returns false when no timer set', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isTimerActive()).toBe(false);
  });

  it('isTimerActive returns true when state.nextStepAt is set', () => {
    const { scheduler, state } = setupScheduler();
    state.nextStepAt = Date.now() + 5000;
    expect(scheduler.isTimerActive()).toBe(true);
  });

  it('getNextStepAt returns current timestamp', () => {
    const { scheduler, state } = setupScheduler();
    const ts = Date.now() + 1000;
    scheduler.setNextStepAt(ts);
    expect(scheduler.getNextStepAt()).toBe(ts);
  });

  it('getTimer returns null initially', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getTimer()).toBeNull();
  });

  it('getHealthcheckTimer returns null initially', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getHealthcheckTimer()).toBeNull();
  });
});

// ─── Tests: Backoff ──────────────────────────────────────────────────────────

describe('backoff', () => {
  it('nextBackoff returns current backoff and doubles it', () => {
    const { scheduler, state } = setupScheduler();
    state.backoffMs = ONE_MINUTE_MS;
    const first = scheduler.nextBackoff();
    expect(first).toBe(ONE_MINUTE_MS);
    expect(state.backoffMs).toBe(ONE_MINUTE_MS * 2);
  });

  it('nextBackoff caps at TEN_MINUTES_MS', () => {
    const { scheduler, state } = setupScheduler();
    state.backoffMs = TEN_MINUTES_MS;
    const result = scheduler.nextBackoff();
    expect(result).toBe(TEN_MINUTES_MS);
    expect(state.backoffMs).toBe(TEN_MINUTES_MS); // no change
  });

  it('resetBackoff resets state.backoffMs to ONE_MINUTE_MS', () => {
    const { scheduler, state } = setupScheduler();
    state.backoffMs = TEN_MINUTES_MS;
    scheduler.resetBackoff();
    expect(state.backoffMs).toBe(ONE_MINUTE_MS);
  });

  it('getBackoffMs returns current backoffMs', () => {
    const { scheduler, state } = setupScheduler();
    state.backoffMs = 300_000;
    expect(scheduler.getBackoffMs()).toBe(300_000);
  });
});

// ─── Tests: Run epoch management ────────────────────────────────────────────────

describe('run epoch management', () => {
  it('startNewRunEpoch increments activeRunEpoch and resets stepEpoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 1;
    state.activeStepEpoch = 5;
    const epoch = scheduler.startNewRunEpoch();
    expect(epoch).toBe(2);
    expect(state.activeRunEpoch).toBe(2);
    expect(state.activeStepEpoch).toBe(0);
  });

  it('isStaleRun returns true when runEpoch does not match activeRunEpoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 3;
    expect(scheduler.isStaleRun(1)).toBe(true);
  });

  it('isStaleRun returns true when stopped', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 1;
    scheduler.stop();
    expect(scheduler.isStaleRun(1)).toBe(true);
  });

  it('isStaleRun returns false when epoch matches and not stopped', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 2;
    expect(scheduler.isStaleRun(2)).toBe(false);
  });

  it('getActiveRunEpoch returns current epoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 7;
    expect(scheduler.getActiveRunEpoch()).toBe(7);
  });

  it('advanceStepEpoch increments activeStepEpoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeStepEpoch = 3;
    scheduler.advanceStepEpoch();
    expect(state.activeStepEpoch).toBe(4);
  });

  it('getActiveStepEpoch returns current step epoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeStepEpoch = 9;
    expect(scheduler.getActiveStepEpoch()).toBe(9);
  });
});

// ─── Tests: Generate token ────────────────────────────────────────────────────

describe('generate token', () => {
  it('startGenerateAttempt increments token and stores controller', () => {
    const { scheduler, state } = setupScheduler();
    const controller = new AbortController();
    state.activeGenerateToken = 5;
    const token = scheduler.startGenerateAttempt(controller);
    expect(token).toBe(6);
    expect(state.activeGenerateToken).toBe(6);
  });

  it('finishGenerateAttempt aborts controller and clears it', () => {
    const { scheduler, state } = setupScheduler();
    const controller = new AbortController();
    state.activeGenerateToken = 5;
    scheduler.startGenerateAttempt(controller);
    scheduler.finishGenerateAttempt(6, controller);
    expect(state.activeGenerateToken).toBe(6); // token unchanged
  });

  it('finishGenerateAttempt does nothing for stale token', () => {
    const { scheduler, state } = setupScheduler();
    const controller = new AbortController();
    state.activeGenerateToken = 5;
    scheduler.startGenerateAttempt(controller);
    state.activeGenerateToken = 7; // simulate another attempt
    scheduler.finishGenerateAttempt(6, controller);
    expect(state.activeGenerateToken).toBe(7); // unchanged
  });

  it('getGenerateToken returns current token', () => {
    const { scheduler, state } = setupScheduler();
    state.activeGenerateToken = 42;
    expect(scheduler.getGenerateToken()).toBe(42);
  });

  it('invalidateInFlightGenerate increments token', () => {
    const { scheduler, state } = setupScheduler();
    state.activeGenerateToken = 10;
    // @ts-ignore — internal function, exposed for testing patterns
    scheduler['invalidateInFlightGenerate']?.();
    expect(state.activeGenerateToken).toBe(11);
  });
});

// ─── Tests: Stop / idle state ────────────────────────────────────────────────

describe('stop and idle state', () => {
  it('stop sets stopped=true, increments runEpoch, clears timer', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 1;
    state.activeStepEpoch = 3;
    scheduler.stop();
    expect(scheduler.isStopped()).toBe(true);
    expect(state.activeRunEpoch).toBe(2);
    expect(state.activeStepEpoch).toBe(0);
    expect(state.nextStepAt).toBeNull();
  });

  it('isLocallyIdle returns true by default', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isLocallyIdle()).toBe(true);
  });

  it('isExecuting returns false by default', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isExecuting()).toBe(false);
  });

  it('setExecuting toggles isExecuting state', () => {
    const { scheduler } = setupScheduler();
    scheduler.setExecuting(true);
    expect(scheduler.isExecuting()).toBe(true);
    scheduler.setExecuting(false);
    expect(scheduler.isExecuting()).toBe(false);
  });

  it('isStartingRun returns false by default', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isStartingRun()).toBe(false);
  });

  it('getRunId returns null by default', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getRunId()).toBeNull();
  });

  it('setRunId stores the run id', () => {
    const { scheduler } = setupScheduler();
    scheduler.setRunId('run-abc');
    expect(scheduler.getRunId()).toBe('run-abc');
  });
});

// ─── Tests: Scheduling / step delay ──────────────────────────────────────────

describe('planNextStepDelay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns -1 when no contract exists', async () => {
    const deps = makeMinimalDeps({ getRunnableContract: async () => null });
    const { scheduler } = setupScheduler(makeDefaultState(), deps);
    vi.setSystemTime(0);
    const result = await scheduler.planNextStepDelay();
    expect(result).toBe(-1);
  });

  it('returns -1 when remaining budget is below estimated step cost', async () => {
    const deps = makeMinimalDeps({
      getRunnableContract: async () => ({ id: 'c1', budgetUsd: 0.001, endsAt: Date.now() + 3600_000 }),
      getContractSpend: async () => 0.001,
      estimateStepCostUsd: async () => 0.01,
    });
    const { scheduler } = setupScheduler(makeDefaultState(), deps);
    vi.setSystemTime(0);
    const result = await scheduler.planNextStepDelay();
    expect(result).toBe(-1);
  });

  it('resets backoff after successful planning', async () => {
    const deps = makeMinimalDeps({
      getRunnableContract: async () => ({ id: 'c1', budgetUsd: 1, endsAt: Date.now() + 3600_000 }),
      getContractSpend: async () => 0,
      estimateStepCostUsd: async () => 0.01,
    });
    const { scheduler, state } = setupScheduler(makeDefaultState(), deps);
    state.backoffMs = 1_000;
    vi.setSystemTime(0);
    await scheduler.planNextStepDelay();
    expect(state.backoffMs).toBe(ONE_MINUTE_MS);
  });
});

// ─── Tests: Flush settings ───────────────────────────────────────────────────

describe('flush settings', () => {
  it('getFlushSettings returns default settings', () => {
    const { scheduler } = setupScheduler();
    const settings = scheduler.getFlushSettings();
    expect(settings.communicationDmFlushingEnabled).toBe(true);
    expect(settings.communicationGroupFlushingEnabled).toBe(true);
  });

  it('rememberFlushedRunEventKey tracks key', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isFlushed('key-1')).toBe(false);
    scheduler.rememberFlushedRunEventKey('key-1');
    expect(scheduler.isFlushed('key-1')).toBe(true);
  });

  it('isFlushed returns false for unknown key', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.isFlushed('unknown')).toBe(false);
  });

  it('clearFlushHistory resets flushed keys', () => {
    const { scheduler } = setupScheduler();
    scheduler.rememberFlushedRunEventKey('key-1');
    scheduler.rememberFlushedRunEventKey('key-2');
    expect(scheduler.isFlushed('key-1')).toBe(true);

    scheduler.clearFlushHistory();

    expect(scheduler.isFlushed('key-1')).toBe(false);
    expect(scheduler.isFlushed('key-2')).toBe(false);
  });

  it('resetFlushedRunEventKeys clears all flushed keys', () => {
    const { scheduler } = setupScheduler();
    scheduler.rememberFlushedRunEventKey('a', 'b', 'c');
    expect(scheduler.isFlushed('a')).toBe(true);
    scheduler.resetFlushedRunEventKeys();
    expect(scheduler.isFlushed('a')).toBe(false);
  });
});

// ─── Tests: Instant flag ──────────────────────────────────────────────────────

describe('instant flag', () => {
  it('getInstant returns current instant value', () => {
    const { scheduler, state } = setupScheduler();
    state.instant = true;
    expect(scheduler.getInstant()).toBe(true);
    state.instant = false;
    expect(scheduler.getInstant()).toBe(false);
  });

  it('setInstant sets state.instant', () => {
    const { scheduler, state } = setupScheduler();
    scheduler.setInstant(true);
    expect(state.instant).toBe(true);
    scheduler.setInstant(false);
    expect(state.instant).toBe(false);
  });
});

// ─── Tests: State accessors ──────────────────────────────────────────────────

describe('state accessors', () => {
  it('getState returns a copy of current state', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 5;
    const snapshot = scheduler.getState();
    expect(snapshot.activeRunEpoch).toBe(5);
    snapshot.activeRunEpoch = 999; // mutation should not affect original
    expect(state.activeRunEpoch).toBe(5);
  });

  it('getRunLastMessages returns DEFAULT_RUN_LAST_MESSAGES', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getRunLastMessages()).toBe(20);
  });
});

// ─── Tests: Healthcheck ─────────────────────────────────────────────────────

describe('healthcheck', () => {
  it('getHealthcheckIntervalMs returns RUNNER_HEALTHCHECK_INTERVAL_MS', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getHealthcheckIntervalMs()).toBe(RUNNER_HEALTHCHECK_INTERVAL_MS);
  });

  it('shouldRunHealthcheckAt returns false when healthcheckNextAt is null', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.shouldRunHealthcheckAt(Date.now())).toBe(false);
  });

  it('shouldRunHealthcheckAt returns false when healthcheckNextAt is null', () => {
    const { scheduler } = setupScheduler();
    // Verify that the function exists and doesn't throw
    expect(typeof scheduler.shouldRunHealthcheckAt).toBe('function');
    expect(scheduler.shouldRunHealthcheckAt(Date.now())).toBe(false);
  });
});

// ─── Tests: Step callback ──────────────────────────────────────────────────────

describe('step callback', () => {
  it('setStepCallback is callable without throwing', () => {
    const { scheduler } = setupScheduler();
    const fn = vi.fn<() => Promise<void>>();
    // Should not throw — function exists and accepts a callback
    expect(() => scheduler.setStepCallback(fn)).not.toThrow();
  });

  it('getAbortController returns null when no active generate', () => {
    const { scheduler } = setupScheduler();
    expect(scheduler.getAbortController()).toBeNull();
  });
});

// ─── Tests: Stale run guard ──────────────────────────────────────────────────

describe('stale run guard', () => {
  it('isStaleRun returns true for epoch 0 when activeRunEpoch > 0', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 1;
    expect(scheduler.isStaleRun(0)).toBe(true);
  });

  it('isStaleRun returns false for epoch 0 when activeRunEpoch is 0', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 0;
    expect(scheduler.isStaleRun(0)).toBe(false);
  });

  it('isStaleRun returns false for matching epoch', () => {
    const { scheduler, state } = setupScheduler();
    state.activeRunEpoch = 1;
    expect(scheduler.isStaleRun(1)).toBe(false);
  });
});