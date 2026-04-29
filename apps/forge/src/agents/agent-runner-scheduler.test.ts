import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler, type SchedulerState, type SchedulerDependencies } from './agent-runner-scheduler.js';

// ─── Constants (must match scheduler source) ─────────────────────────────────
const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 600_000;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeState(overrides: Partial<SchedulerState> = {}): SchedulerState {
  return {
    nextStepAt: null,
    backoffMs: ONE_MINUTE_MS,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SchedulerDependencies> = {}): SchedulerDependencies {
  return {
    runtimeId: 'runtime-1',
    getSystemSettings: vi.fn().mockResolvedValue({
      stepDelayEnabled: true,
      memoryLastMessagesFullEnabled: false,
      memoryLastMessagesCount: 20,
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    }),
    getRunnableContract: vi.fn().mockResolvedValue({
      id: 'contract-1',
      budgetUsd: 10,
      endsAt: Date.now() + 3_600_000,
    }),
    getContractSpend: vi.fn().mockResolvedValue(0),
    estimateStepCostUsd: vi.fn().mockResolvedValue(0.01),
    setExecutionState: vi.fn().mockResolvedValue(undefined),
    onAgentIdle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('timer management', () => {
    test('clearTimer clears the active timer and nulls nextStepAt', () => {
      const state = makeState({ nextStepAt: Date.now() + 5000 });
      const scheduler = createScheduler(state, makeDeps());
      scheduler.clearTimer();
      expect(state.nextStepAt).toBeNull();
      expect(scheduler.getTimer()).toBeNull();
    });

    test('setNextStepAt updates state.nextStepAt', () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      const ts = Date.now() + 10_000;
      scheduler.setNextStepAt(ts);
      expect(state.nextStepAt).toBe(ts);
    });

    test('isTimerActive returns false when no timer is set', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.isTimerActive()).toBe(false);
    });
  });

  describe('backoff', () => {
    test('nextBackoff doubles the backoff, capped at TEN_MINUTES_MS, returns old value', () => {
      const state = makeState({ backoffMs: ONE_MINUTE_MS });
      const scheduler = createScheduler(state, makeDeps());
      expect(scheduler.nextBackoff()).toBe(ONE_MINUTE_MS);
      expect(state.backoffMs).toBe(ONE_MINUTE_MS * 2);
      expect(scheduler.nextBackoff()).toBe(ONE_MINUTE_MS * 2);
      expect(state.backoffMs).toBe(ONE_MINUTE_MS * 4);
      scheduler.nextBackoff(); // 8x
      scheduler.nextBackoff(); // 16x, hits cap
      expect(scheduler.nextBackoff()).toBe(TEN_MINUTES_MS);
      expect(state.backoffMs).toBe(TEN_MINUTES_MS);
    });

    test('resetBackoff sets backoffMs back to ONE_MINUTE_MS', () => {
      const state = makeState({ backoffMs: 999_999 });
      const scheduler = createScheduler(state, makeDeps());
      scheduler.resetBackoff();
      expect(state.backoffMs).toBe(ONE_MINUTE_MS);
    });
  });

  describe('setInstant', () => {
    test('setInstant sets state.instant', () => {
      const state = makeState({ instant: false });
      const scheduler = createScheduler(state, makeDeps());
      scheduler.setInstant(true);
      expect(state.instant).toBe(true);
    });
  });

  describe('calculateDelayMs', () => {
    test('returns 0 when estimatedStepUsd is null', () => {
      const scheduler = createScheduler(makeState(), makeDeps({ estimateStepCostUsd: () => Promise.resolve(null) }));
      expect(scheduler.calculateDelayMs(Date.now() + 1_000_000, 5, null)).toBe(0);
    });

    test('returns 0 when estimatedStepUsd is <= 0', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.calculateDelayMs(Date.now() + 1_000_000, 5, 0)).toBe(0);
    });

    test('returns 0 when remainingTimeMs <= 0', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.calculateDelayMs(Date.now() - 1, 5, 0.01)).toBe(0);
    });

    test('returns 0 when stepsPossible <= 0 (budget exhausted)', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.calculateDelayMs(Date.now() + 1_000_000, 0, 0.01)).toBe(0);
    });

    test('returns remainingTimeMs / stepsPossible when budget and time remain', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      // 60 min remaining, $6 budget, $0.01/step = 600 steps → 6000ms per step
      const endsAt = Date.now() + 3_600_000;
      const delay = scheduler.calculateDelayMs(endsAt, 6, 0.01);
      expect(delay).toBe(3_600_000 / 600);
    });
  });

  describe('planNextStepDelay', () => {
    test('returns -1 when no contract is runnable', async () => {
      const scheduler = createScheduler(makeState(), makeDeps({ getRunnableContract: () => Promise.resolve(null) }));
      await vi.advanceTimersByTimeAsync(0);
      const result = await scheduler.planNextStepDelay();
      expect(result).toBe(-1);
    });

    test('returns -1 when budget is exhausted', async () => {
      const scheduler = createScheduler(makeState(), makeDeps({
        getContractSpend: () => Promise.resolve(9.99), // $10 budget, $9.99 spent
        estimateStepCostUsd: () => Promise.resolve(0.02), // next step costs $0.02
      }));
      await vi.advanceTimersByTimeAsync(0);
      const result = await scheduler.planNextStepDelay();
      expect(result).toBe(-1);
    });

    test('returns 0 when state.instant is true', async () => {
      const state = makeState({ instant: true });
      const scheduler = createScheduler(state, makeDeps());
      await vi.advanceTimersByTimeAsync(0);
      const result = await scheduler.planNextStepDelay();
      expect(result).toBe(0);
    });

    test('returns 0 when stepDelayEnabled is false', async () => {
      const scheduler = createScheduler(makeState(), makeDeps({
        getSystemSettings: () => Promise.resolve({
          stepDelayEnabled: false,
          memoryLastMessagesFullEnabled: false,
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: true,
        }),
      }));
      await vi.advanceTimersByTimeAsync(0);
      const result = await scheduler.planNextStepDelay();
      expect(result).toBe(0);
    });
  });

  describe('run epoch', () => {
    test('startNewRunEpoch increments activeRunEpoch and resets activeStepEpoch', () => {
      const state = makeState({ activeRunEpoch: 5, activeStepEpoch: 3 });
      const scheduler = createScheduler(state, makeDeps());
      const epoch = scheduler.startNewRunEpoch();
      expect(epoch).toBe(6);
      expect(state.activeRunEpoch).toBe(6);
      expect(state.activeStepEpoch).toBe(0);
    });

    test('isStaleRun returns true when stopped', () => {
      const state = makeState({ activeRunEpoch: 1 });
      const scheduler = createScheduler(state, makeDeps());
      scheduler.stop();
      expect(scheduler.isStaleRun(1)).toBe(true);
    });

    test('isStaleRun returns true when runEpoch !== activeRunEpoch', () => {
      const state = makeState({ activeRunEpoch: 5 });
      const scheduler = createScheduler(state, makeDeps());
      expect(scheduler.isStaleRun(1)).toBe(true);
      expect(scheduler.isStaleRun(5)).toBe(false);
    });

    test('startGenerateAttempt increments token and stores abort controller', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      const controller = new AbortController();
      const token = scheduler.startGenerateAttempt(controller);
      expect(token).toBe(1);
      expect(scheduler.getGenerateToken()).toBe(1);
      expect(scheduler.getAbortController()).toBe(controller);
    });

    test('finishGenerateAttempt clears abort controller only when token matches', () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      scheduler.startGenerateAttempt(controller1); // token 1
      scheduler.startGenerateAttempt(controller2); // token 2
      scheduler.finishGenerateAttempt(1, controller1); // stale token
      expect(scheduler.getAbortController()).toBe(controller2);
      scheduler.finishGenerateAttempt(2, controller2); // active token
      expect(scheduler.getAbortController()).toBeNull();
    });
  });

  describe('lifecycle: stop', () => {
    test('stop sets stopped flag and clears timer', () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      scheduler.setNextStepAt(Date.now() + 10_000);
      scheduler.stop();
      expect(scheduler.isStopped()).toBe(true);
      expect(state.nextStepAt).toBeNull();
      expect(scheduler.getTimer()).toBeNull();
    });

    test('stop invalidates in-flight generate and increments epoch', () => {
      const state = makeState({ activeRunEpoch: 5, activeGenerateToken: 3 });
      const scheduler = createScheduler(state, makeDeps());
      const controller = new AbortController();
      scheduler.startGenerateAttempt(controller);
      const abortSpy = vi.spyOn(controller, 'abort');
      scheduler.stop();
      expect(abortSpy).toHaveBeenCalled();
      expect(state.activeGenerateToken).toBe(5);
    });

    test('getState returns a snapshot of current state', () => {
      const state = makeState({ backoffMs: 123_456 });
      const scheduler = createScheduler(state, makeDeps());
      const snap = scheduler.getState();
      expect(snap.backoffMs).toBe(123_456);
    });
  });

  describe('lifecycle: start', () => {
    test('start does nothing when scheduler is stopped', async () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      scheduler.stop();
      await scheduler.start(
        () => Promise.resolve('running'),
        async () => {},
      );
      expect(scheduler.isStopped()).toBe(true);
    });

    test('start calls onAgentIdle when execution state is idle', async () => {
      const deps = makeDeps({
        getSystemSettings: async () => ({
          stepDelayEnabled: true,
          memoryLastMessagesFullEnabled: false,
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: true,
        }),
        getRunnableContract: () => Promise.resolve(null),
      });
      const scheduler = createScheduler(makeState(), deps);
      await scheduler.start(
        () => Promise.resolve('idle'),
        async () => {},
      );
      await vi.advanceTimersByTimeAsync(RUNNER_AWAIT_TIMEOUT_MS + 1000);
      expect(deps.onAgentIdle).toHaveBeenCalled();
    });

    test('start calls beginRunFn when execution state is absent', async () => {
      const beginRunMock = vi.fn().mockResolvedValue(undefined);
      const scheduler = createScheduler(makeState(), makeDeps());
      await scheduler.start(
        () => Promise.resolve('absent'),
        beginRunMock,
      );
      await vi.advanceTimersByTimeAsync(RUNNER_AWAIT_TIMEOUT_MS + 1000);
      expect(beginRunMock).toHaveBeenCalledWith(
        expect.objectContaining({ reloadRuntime: false, markRunning: true }),
      );
    });
  });

  describe('flush settings', () => {
    test('resetFlushedRunEventKeys clears the set', () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      scheduler.rememberFlushedRunEventKey('key-1');
      scheduler.rememberFlushedRunEventKey('key-2');
      scheduler.resetFlushedRunEventKeys();
      expect(scheduler.isFlushed('key-1')).toBe(false);
      expect(scheduler.isFlushed('key-2')).toBe(false);
    });

    test('rememberFlushedRunEventKey adds key and maintains insertion order', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.rememberFlushedRunEventKey('a');
      scheduler.rememberFlushedRunEventKey('b');
      scheduler.rememberFlushedRunEventKey('c');
      expect(scheduler.isFlushed('a')).toBe(true);
      expect(scheduler.isFlushed('b')).toBe(true);
      expect(scheduler.isFlushed('c')).toBe(true);
    });

    test('clearFlushHistory removes all keys but keeps set', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.rememberFlushedRunEventKey('x');
      scheduler.clearFlushHistory();
      expect(scheduler.isFlushed('x')).toBe(false);
    });

    test('getFlushSettings returns current flush settings', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.getFlushSettings()).toEqual({
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      });
    });
  });

  describe('state accessors', () => {
    test('isLocallyIdle returns true when not starting, not executing, no timer', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.isLocallyIdle()).toBe(true);
    });

    test('setExecuting / isExecuting work', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.isExecuting()).toBe(false);
      scheduler.setExecuting(true);
      expect(scheduler.isExecuting()).toBe(true);
      expect(scheduler.isLocallyIdle()).toBe(false);
    });

    test('advanceStepEpoch increments activeStepEpoch', () => {
      const state = makeState({ activeStepEpoch: 0 });
      const scheduler = createScheduler(state, makeDeps());
      scheduler.advanceStepEpoch();
      scheduler.advanceStepEpoch();
      expect(state.activeStepEpoch).toBe(2);
      expect(scheduler.getActiveStepEpoch()).toBe(2);
    });

    test('setStepCallback accepts a callback without throwing', async () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      const stepMock = vi.fn().mockResolvedValue(undefined);
      expect(() => scheduler.setStepCallback(stepMock)).not.toThrow();
    });

    test('getRunId returns null initially', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.getRunId()).toBeNull();
    });

    test('setRunId / getRunId work', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.setRunId('run-abc');
      expect(scheduler.getRunId()).toBe('run-abc');
    });

    test('getRunLastMessages returns DEFAULT_RUN_LAST_MESSAGES (20)', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.getRunLastMessages()).toBe(20);
    });

    test('getRunLastMessages returns FULL_MEMORY_LOAD when memoryLastMessagesFullEnabled', async () => {
      const scheduler = createScheduler(makeState(), makeDeps({
        getSystemSettings: async () => ({
          stepDelayEnabled: true,
          memoryLastMessagesFullEnabled: true,
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: true,
        }),
      }));
      await scheduler.refreshRunFlushSettings();
      expect(scheduler.getRunLastMessages()).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('healthcheck', () => {
    test('startHealthcheck sets a timer', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.startHealthcheck();
      expect(scheduler.getHealthcheckTimer()).not.toBeNull();
    });

    test('startHealthcheck is idempotent', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.startHealthcheck();
      const first = scheduler.getHealthcheckTimer();
      scheduler.startHealthcheck();
      expect(scheduler.getHealthcheckTimer()).toBe(first);
    });

    test('clearHealthcheck clears the healthcheck timer', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.startHealthcheck();
      scheduler.clearHealthcheck();
      expect(scheduler.getHealthcheckTimer()).toBeNull();
    });

    test('getStartingRunAgeMs returns 0 when not starting run', () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      expect(scheduler.getStartingRunAgeMs()).toBe(0);
    });
  });

  describe('beginRun', () => {
    function makeBeginRunInput(overrides = {}) {
      return {
        reloadRuntime: false,
        wakeStartedAt: Date.now(),
        markRunning: false,
        onReloadRuntime: async (runEpoch) => {},
        setExecutionState: async () => {},
        onAgentRunning: () => {},
        onRunnerIdle: async () => {},
        getPendingCount: () => 0,
        ...overrides,
      };
    }

    test('beginRun sets instant=true and calls onAgentRunning', async () => {
      const state = makeState();
      const scheduler = createScheduler(state, makeDeps());
      const onAgentRunning = vi.fn();
      // beginRun(runEpoch, input) — two positional args
      await scheduler.beginRun(1, makeBeginRunInput({ onAgentRunning }));
      expect(state.instant).toBe(true);
      expect(onAgentRunning).toHaveBeenCalled();
    });

    test('beginRun returns early if stopped', async () => {
      const scheduler = createScheduler(makeState(), makeDeps());
      scheduler.stop();
      const onAgentRunning = vi.fn();
      await scheduler.beginRun(1, makeBeginRunInput({ onAgentRunning }));
      expect(onAgentRunning).not.toHaveBeenCalled();
    });

    test('beginRun increments run epoch', async () => {
      const state = makeState({ activeRunEpoch: 0 });
      const scheduler = createScheduler(state, makeDeps());
      await scheduler.beginRun(1, makeBeginRunInput());
      expect(state.activeRunEpoch).toBe(1);
    });
  });
});
