/**
 * Unit tests for agents/agent-runner-scheduler-steps.ts.
 *
 * Tests the step orchestration functions:
 * - beginRun: starts a new run and queues first step
 * - queueNextStep: schedules the next step if conditions are met
 *
 * Extracted from agent-runner-scheduler.ts (#2257 phase 5).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSchedulerSteps, BeginRunInput } from './agent-runner-scheduler-steps';
import type { FlushManager } from './agent-runner-flush-manager';

function makeDeps() {
  let _runEpoch = 1;
  const state = {
    instant: false,
    backoffMs: 0,
    nextStepAt: null as number | null,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
  };

  return {
    runtimeId: 'agent-1',
    getRunnableContract: vi.fn().mockResolvedValue({ id: 'contract-1' }),
    onAgentIdle: vi.fn(),
    isStaleRun: vi.fn().mockReturnValue(false),
    startNewRunEpoch: () => {
      _runEpoch++;
      state.activeRunEpoch = _runEpoch;
      state.activeStepEpoch = 0;
      return _runEpoch;
    },
    scheduleNextStep: vi.fn(),
    planNextStepDelay: vi.fn().mockResolvedValue(0),
    resetBackoff: vi.fn(),
    advanceStepEpoch: vi.fn(),
    getActiveRunEpoch: () => state.activeRunEpoch,
    setInstant: vi.fn(),
    flushManager: {
      resetFlushedRunEventKeys: vi.fn(),
      refreshRunFlushSettings: vi.fn().mockResolvedValue(undefined),
      rememberFlushedRunEventKey: vi.fn(),
      isFlushed: vi.fn(() => false),
      clearFlushHistory: vi.fn(),
      getFlushSettings: () => ({ communicationDmFlushingEnabled: true, communicationGroupFlushingEnabled: true }),
      getRunLastMessages: () => 20,
    } as FlushManager,
    getExecuting: () => false,
    isTimerActive: () => false,
    isStopped: () => false,
    getStartingRun: () => ({ running: false, startedAt: null as number | null }),
    setStartingRun: vi.fn(),
  };
}

function makeInput() {
  return {
    reloadRuntime: false,
    wakeStartedAt: Date.now(),
    markRunning: true,
    onReloadRuntime: vi.fn(),
    setExecutionState: vi.fn().mockResolvedValue(undefined),
    onAgentRunning: vi.fn(),
    onRunnerIdle: vi.fn(),
    getPendingCount: () => 0,
  };
}

describe('createSchedulerSteps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('beginRun', () => {
    it('returns early when stopped', async () => {
      const deps = makeDeps();
      deps.isStopped = () => true;
      const steps = createSchedulerSteps(deps);
      await steps.beginRun(1, makeInput());
      expect(deps.scheduleNextStep).not.toHaveBeenCalled();
    });

    it('sets starting run flag on entry', async () => {
      const deps = makeDeps();
      const steps = createSchedulerSteps(deps);
      await steps.beginRun(1, makeInput());
      expect(deps.setStartingRun).toHaveBeenCalledWith(true, expect.any(Number));
    });

    it('resets backoff on entry', async () => {
      const deps = makeDeps();
      const steps = createSchedulerSteps(deps);
      await steps.beginRun(1, makeInput());
      expect(deps.resetBackoff).toHaveBeenCalled();
    });
  });

  describe('queueNextStep', () => {
    it('returns early when timer is already active', async () => {
      const deps = makeDeps();
      deps.isTimerActive = () => true;
      const steps = createSchedulerSteps(deps);
      await steps.queueNextStep();
      expect(deps.scheduleNextStep).not.toHaveBeenCalled();
    });

    it('returns early when stale', async () => {
      const deps = makeDeps();
      (deps.isStaleRun as any) = () => true;
      const steps = createSchedulerSteps(deps);
      await steps.queueNextStep();
      expect(deps.scheduleNextStep).not.toHaveBeenCalled();
    });
  });
});
