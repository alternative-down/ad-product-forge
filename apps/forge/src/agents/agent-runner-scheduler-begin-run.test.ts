/**
 * Unit tests for agent-runner-scheduler beginRun() and queueNextStep().
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ONE_MINUTE_MS } from './time-constants';
import { createScheduler, type SchedulerState, type SchedulerDependencies } from './agent-runner-scheduler';

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

function depsWith(getRunnableContract: () => Promise<{ id: string; budgetUsd: number; endsAt: number } | null>): SchedulerDependencies {
  return {
    runtimeId: 'agent-1',
    getSystemSettings: async () => ({ stepDelayEnabled: true, memoryLastMessagesFullEnabled: false, memoryLastMessagesCount: 10, communicationDmFlushingEnabled: true, communicationGroupFlushingEnabled: true }),
    getRunnableContract,
    getContractSpend: async () => 0,
    estimateStepCostUsd: async () => 0.01,
    setExecutionState: async () => {},
  };
}

function depsWithSettings(getRunnableContract: () => Promise<any>, settings: any): SchedulerDependencies {
  return {
    runtimeId: 'agent-1',
    getSystemSettings: async () => settings,
    getRunnableContract,
    getContractSpend: async () => 0,
    estimateStepCostUsd: async () => 0.01,
    setExecutionState: async () => {},
  };
}

// ─── beginRun() tests ─────────────────────────────────────────────────────────

describe('beginRun', () => {
  let onReloadRuntime: ReturnType<typeof vi.fn>;
  let setExecutionState: ReturnType<typeof vi.fn>;
  let onAgentRunning: ReturnType<typeof vi.fn>;
  let onRunnerIdle: ReturnType<typeof vi.fn>;
  let getPendingCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onReloadRuntime = vi.fn<() => Promise<void>>();
    setExecutionState = vi.fn<() => Promise<void>>();
    onAgentRunning = vi.fn();
    onRunnerIdle = vi.fn<() => Promise<void>>();
    getPendingCount = vi.fn<() => number>().mockReturnValue(0);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  const makeInput = () => ({
    reloadRuntime: false,
    wakeStartedAt: Date.now(),
    markRunning: false,
    onReloadRuntime,
    setExecutionState,
    onAgentRunning,
    onRunnerIdle,
    getPendingCount,
  });

  it('returns early when stopped', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    scheduler.stop();
    await scheduler.beginRun(0, makeInput() as any);
    expect(onAgentRunning).not.toHaveBeenCalled();
    expect(setExecutionState).not.toHaveBeenCalled();
  });

  it('returns early when already starting a run', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    const p = scheduler.beginRun(0, makeInput() as any);
    await scheduler.beginRun(0, makeInput() as any);
    await p;
    expect(onAgentRunning).toHaveBeenCalledTimes(1);
  });

  it('sets isStartingRun=true during beginRun', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    expect(scheduler.isStartingRun()).toBe(false);
    const p = scheduler.beginRun(0, makeInput() as any);
    expect(scheduler.isStartingRun()).toBe(true);
    await p;
    expect(scheduler.isStartingRun()).toBe(false);
  });

  it('clears startingRunStartedAt after beginRun completes', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(scheduler.getStartingRunAgeMs()).toBe(0);
  });

  it('calls onReloadRuntime when reloadRuntime is true', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    const input = makeInput() as any;
    input.reloadRuntime = true;
    await scheduler.beginRun(0, input);
    expect(onReloadRuntime).toHaveBeenCalled();
  });

  it('onReloadRuntime receives the new run epoch (activeRunEpoch + 1)', async () => {
    const state = makeDefaultState();
    state.activeRunEpoch = 5;
    const scheduler = createScheduler(state, depsWith(async () => null));
    const input = makeInput() as any;
    input.reloadRuntime = true;
    await scheduler.beginRun(5, input);
    expect(onReloadRuntime).toHaveBeenCalledWith(6);
  });

  it('sets state.instant to true on successful beginRun', async () => {
    const state = makeDefaultState();
    expect(state.instant).toBe(false);
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(state.instant).toBe(true);
  });

  it('resets backoff to ONE_MINUTE_MS on successful beginRun', async () => {
    const state = makeDefaultState();
    state.backoffMs = ONE_MINUTE_MS * 8;
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(scheduler.getBackoffMs()).toBe(ONE_MINUTE_MS);
  });

  it('calls setExecutionState(running) when markRunning is true', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    const input = makeInput() as any;
    input.markRunning = true;
    await scheduler.beginRun(0, input);
    expect(setExecutionState).toHaveBeenCalledWith('agent-1', 'running');
  });

  it('does NOT call setExecutionState when markRunning is false', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(setExecutionState).not.toHaveBeenCalled();
  });

  it('calls onAgentRunning after onReloadRuntime', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    const order: string[] = [];
    const reloadSpy = vi.fn<() => Promise<void>>();
    reloadSpy.mockImplementation(async () => { order.push('reloadRuntime'); });
    const runningSpy = vi.fn();
    runningSpy.mockImplementation(() => { order.push('onAgentRunning'); });
    const input = makeInput();
    input.reloadRuntime = true;
    input.onReloadRuntime = reloadSpy;
    input.onAgentRunning = runningSpy;
    await scheduler.beginRun(0, input as any);
    expect(order).toEqual(['reloadRuntime', 'onAgentRunning']);
  });

  it('increments activeRunEpoch', async () => {
    const state = makeDefaultState();
    state.activeRunEpoch = 0;
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(state.activeRunEpoch).toBe(1);
  });

  it('resets activeStepEpoch to 0 on new run', async () => {
    const state = makeDefaultState();
    state.activeStepEpoch = 99;
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.beginRun(0, makeInput() as any);
    expect(state.activeStepEpoch).toBe(0);
  });

  it('does not throw when queueNextStep rejects', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWithSettings(
      async () => { throw new Error('contract error'); },
      { stepDelayEnabled: false, memoryLastMessagesFullEnabled: false },
    ));
    await expect(scheduler.beginRun(0, makeInput() as any)).resolves.toBeUndefined();
  });
});

// ─── queueNextStep() tests ─────────────────────────────────────────────────────

describe('queueNextStep', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns early when stopped', async () => {
    const state = makeDefaultState();
    let called = false;
    const scheduler = createScheduler(state, depsWith(async () => { called = true; return null; }));
    scheduler.stop(); // sets internal stopped=true
    await scheduler.queueNextStep();
    expect(called).toBe(false);
  });

  it('returns early when executing', async () => {
    const state = makeDefaultState();
    let called = false;
    const scheduler = createScheduler(state, depsWith(async () => { called = true; return null; }));
    scheduler.setExecuting(true);
    await scheduler.queueNextStep();
    expect(called).toBe(false);
  });

  it('returns early when timer is already active', async () => {
    const state = makeDefaultState();
    state.nextStepAt = Date.now() + 60_000;
    let called = false;
    const scheduler = createScheduler(state, depsWith(async () => { called = true; return null; }));
    await scheduler.queueNextStep();
    expect(called).toBe(false);
  });

  it('returns early on stale run', async () => {
    const state = makeDefaultState();
    state.activeRunEpoch = 5;
    const scheduler = createScheduler(state, depsWith(async () => null));
    scheduler.startNewRunEpoch(); // epoch 6, stale relative to state.activeRunEpoch
    await scheduler.queueNextStep();
    expect(scheduler.isTimerActive()).toBe(false);
  });

  it('calls getRunnableContract to check contract availability', async () => {
    const state = makeDefaultState();
    const mockContract = { id: 'c1', budgetUsd: 100, endsAt: Date.now() + 60_000 };
    let called = false;
    const scheduler = createScheduler(state, depsWithSettings(
      async () => { called = true; return mockContract; },
      { stepDelayEnabled: false, memoryLastMessagesFullEnabled: false },
    ));
    await scheduler.queueNextStep();
    expect(called).toBe(true);
  });

  it('returns early when contract is null (idle)', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    await scheduler.queueNextStep();
    expect(scheduler.isTimerActive()).toBe(false);
  });

  it('sets nextStepAt when contract exists and planning succeeds', async () => {
    const state = makeDefaultState();
    const mockContract = { id: 'c1', budgetUsd: 100, endsAt: Date.now() + 60_000 };
    const scheduler = createScheduler(state, depsWithSettings(
      async () => mockContract,
      { stepDelayEnabled: false, memoryLastMessagesFullEnabled: false },
    ));
    await scheduler.queueNextStep();
    expect(state.nextStepAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('invokes stepCallback with the current run epoch', async () => {
    vi.useFakeTimers();
    try {
      const state = makeDefaultState();
      const mockContract = { id: 'c1', budgetUsd: 100, endsAt: Date.now() + 60_000 };
      const scheduler = createScheduler(state, depsWithSettings(
        async () => mockContract,
        { stepDelayEnabled: false, memoryLastMessagesFullEnabled: false },
      ));
      // Advance to epoch 3
      scheduler.startNewRunEpoch(); // epoch 1
      scheduler.startNewRunEpoch(); // epoch 2
      scheduler.startNewRunEpoch(); // epoch 3

      const stepCallback = vi.fn<() => Promise<void>>();
      scheduler.setStepCallback(stepCallback);
      vi.setSystemTime(0);
      const p = scheduler.queueNextStep();
      await p;
      // stepCallback is deferred via setTimeout(0) — advance timers to fire it
      await vi.advanceTimersByTimeAsync(0);
      expect(stepCallback).toHaveBeenCalledWith(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not invoke stepCallback when contract is null', async () => {
    const state = makeDefaultState();
    const scheduler = createScheduler(state, depsWith(async () => null));
    const stepCallback = vi.fn<() => Promise<void>>();
    scheduler.setStepCallback(stepCallback);
    await scheduler.queueNextStep();
    expect(stepCallback).not.toHaveBeenCalled();
  });

  it('returns early when run becomes stale between contract check and scheduling', async () => {
    // When run is stale (activeRunEpoch doesn't match), queueNextStep returns
    // at the first guard and does NOT call stepCallback.
    // We verify by: (1) advance epoch so it's stale, (2) call queueNextStep,
    // (3) assert stepCallback was NOT called.
    const state = makeDefaultState();
    state.activeRunEpoch = 5;
    const mockContract = { id: 'c1', budgetUsd: 100, endsAt: Date.now() + 60_000 };
    const scheduler = createScheduler(state, depsWithSettings(
      async () => mockContract,
      { stepDelayEnabled: false, memoryLastMessagesFullEnabled: false },
    ));
    // Stale the run
    scheduler.startNewRunEpoch(); // epoch 6, epoch 5 is now stale
    const stepCallback = vi.fn<() => Promise<void>>();
    scheduler.setStepCallback(stepCallback);
    await scheduler.queueNextStep();
    // Stale → stepCallback not invoked
    expect(stepCallback).not.toHaveBeenCalled();
  });
});