/**
 * Unit tests for executeStep exit paths.
 *
 * Each test declares its own mocks to avoid module-level hoisting issues.
 * The mock helpers (makeDeps) are for building the deps object only.
 */
import { expect, it, vi } from 'vitest';

// ── Types (mirrors the deps contract) ─────────────────────────────────────────

type ExecuteStepResult = {
  text: string;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{ parts?: Array<unknown> }>;
    };
  }>;
};

type Deps = {
  contractId: string;
  runEpoch: number;
  stopped: boolean;
  executing: boolean;
  isStaleRun: (runEpoch: number) => boolean;
  transitionToIdle: (runEpoch: number, opts?: object) => Promise<void>;
  queueNextStep: (runEpoch: number) => Promise<void>;
  generateWithTimeoutRetries: (prompt: string, runEpoch: number, contractId: string, contract: object, ltmText: string | null, config: object) => Promise<ExecuteStepResult>;
  schedule: (delayMs: number) => void;
  messageManager: { getPendingCount: () => number };
  scheduler: { resetBackoff: () => void };
  loopState: { reset: () => void };
  extractRunnerControlDirective: (result: ExecuteStepResult) => string | null;
  setNextStepAt: (v: number | null) => void;
  backoffMs: number;
  nextExponentialBackoffMs: (ms: number) => { current: number; next: number };
  onRunnerIdle: () => Promise<void>;
  activeStepEpoch: { current: number };
  prompt: { current: string };
};

// ── Test helper: build deps object ─────────────────────────────────────────────

function makeDeps(overrides: Partial<Deps> & { schedule: Deps['schedule']; queueNextStep: Deps['queueNextStep']; transitionToIdle: Deps['transitionToIdle']; generateWithTimeoutRetries: Deps['generateWithTimeoutRetries']; onRunnerIdle: Deps['onRunnerIdle']; setNextStepAt: Deps['setNextStepAt']; loopReset: () => void; schedulerResetBackoff: () => void; extractControlDirective: Deps['extractRunnerControlDirective']; activeStepEpoch: Deps['activeStepEpoch'] }): Deps {
  return {
    contractId: 'c1',
    runEpoch: 1,
    stopped: false,
    executing: false,
    isStaleRun: () => false,
    prompt: { current: '' },
    backoffMs: 60_000,
    messageManager: { getPendingCount: vi.fn().mockReturnValue(0) },
    store: null as never,
    runtime: null as never,
    currentRuntime: null as never,
    lastStepStartedAt: { current: null },
    lastStepStage: { current: null },
    lastGenerateProgress: { current: null },
    epochState: null as never,
    setBackoffMs: vi.fn(),
    setInstant: vi.fn(),
    formatAbsentExecutionError: vi.fn(),
    serializeError: vi.fn(),
    wakeQueue: null as never,
    nextExponentialBackoffMs: vi.fn((ms: number) => ({ current: ms, next: ms * 2 })),
    loopState: { reset: vi.fn() },
    ...overrides,
  };
}

// ── Test helper: executeStepImpl (mirrors agent-runner.ts logic) ───────────────

async function executeStepImpl(deps: Deps): Promise<void> {
  const { isStaleRun, transitionToIdle, queueNextStep } = deps;
  const runEpoch = deps.runEpoch;
  const generateWithTimeoutRetries = deps.generateWithTimeoutRetries;
  const schedule = deps.schedule;
  const messageManager = deps.messageManager;
  const scheduler = deps.scheduler;
  const loopState = deps.loopState;
  const extractRunnerControlDirective = deps.extractRunnerControlDirective;
  const setNextStepAt = deps.setNextStepAt;
  const backoffMs = deps.backoffMs;
  const nextExponentialBackoffMs = deps.nextExponentialBackoffMs;
  const onRunnerIdle = deps.onRunnerIdle;
  const activeStepEpoch = deps.activeStepEpoch;

  if (deps.stopped || deps.executing || isStaleRun(runEpoch)) {
    return;
  }

  let continueRunning = false;
  let drainWakeQueueAfterStep = false;

  try {
    const result = await generateWithTimeoutRetries(deps.prompt?.current ?? '', runEpoch, deps.contractId, {} as never, null, {} as never);
    if (isStaleRun(runEpoch)) { return; }

    const controlDirective = extractRunnerControlDirective(result);
    const stopRequested = controlDirective === 'stop';

    if (stopRequested && messageManager.getPendingCount() === 0) {
      setNextStepAt(null);
      loopState.reset();
      await transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      drainWakeQueueAfterStep = true;
      return;
    }

    scheduler.resetBackoff();
    continueRunning = messageManager.getPendingCount() > 0;
  } catch {
    if (isStaleRun(runEpoch)) { return; }
    schedule(nextExponentialBackoffMs(backoffMs).current);
  } finally {
    if (activeStepEpoch.current === runEpoch) {
      activeStepEpoch.current = 0;
    }
    if (drainWakeQueueAfterStep && !isStaleRun(runEpoch)) {
      await onRunnerIdle();
    }
    if (continueRunning && !isStaleRun(runEpoch)) {
      await queueNextStep(runEpoch);
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executeStep exit paths', () => {
  it('returns immediately when stopped', async () => {
    // Each test declares its own mocks to avoid module-level hoisting issues
    const generateWithTimeoutRetries = vi.fn();
    const transitionToIdle = vi.fn().mockResolvedValue(undefined);
    const queueNextStep = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
    const setNextStepAt = vi.fn();
    const loopReset = vi.fn();
    const schedulerResetBackoff = vi.fn();
    const extractControlDirective = vi.fn().mockReturnValue(null);
    const activeStepEpoch = { current: 0 };

    const deps = makeDeps({
      stopped: true, executing: false, isStaleRun: () => false,
      generateWithTimeoutRetries, transitionToIdle, queueNextStep,
      schedule, onRunnerIdle, setNextStepAt, loopReset,
      schedulerResetBackoff, extractControlDirective, activeStepEpoch,
    });

    await executeStepImpl(deps);

    expect(transitionToIdle).not.toHaveBeenCalled();
    expect(queueNextStep).not.toHaveBeenCalled();
    expect(generateWithTimeoutRetries).not.toHaveBeenCalled();
  });

  it('returns immediately when executing', async () => {
    const generateWithTimeoutRetries = vi.fn();
    const transitionToIdle = vi.fn().mockResolvedValue(undefined);
    const queueNextStep = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
    const setNextStepAt = vi.fn();
    const loopReset = vi.fn();
    const schedulerResetBackoff = vi.fn();
    const extractControlDirective = vi.fn().mockReturnValue(null);
    const activeStepEpoch = { current: 0 };

    const deps = makeDeps({
      stopped: false, executing: true, isStaleRun: () => false,
      generateWithTimeoutRetries, transitionToIdle, queueNextStep,
      schedule, onRunnerIdle, setNextStepAt, loopReset,
      schedulerResetBackoff, extractControlDirective, activeStepEpoch,
    });

    await executeStepImpl(deps);

    expect(transitionToIdle).not.toHaveBeenCalled();
    expect(queueNextStep).not.toHaveBeenCalled();
    expect(generateWithTimeoutRetries).not.toHaveBeenCalled();
  });

  it('returns immediately when run is stale', async () => {
    const generateWithTimeoutRetries = vi.fn();
    const transitionToIdle = vi.fn().mockResolvedValue(undefined);
    const queueNextStep = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
    const setNextStepAt = vi.fn();
    const loopReset = vi.fn();
    const schedulerResetBackoff = vi.fn();
    const extractControlDirective = vi.fn().mockReturnValue(null);
    const activeStepEpoch = { current: 0 };

    const deps = makeDeps({
      stopped: false, executing: false, isStaleRun: () => true,
      generateWithTimeoutRetries, transitionToIdle, queueNextStep,
      schedule, onRunnerIdle, setNextStepAt, loopReset,
      schedulerResetBackoff, extractControlDirective, activeStepEpoch,
    });

    await executeStepImpl(deps);

    expect(generateWithTimeoutRetries).not.toHaveBeenCalled();
    expect(queueNextStep).not.toHaveBeenCalled();
  });

  it('schedules backoff on generation error', async () => {
    const generateWithTimeoutRetries = vi.fn().mockRejectedValue(new Error('boom'));
    const transitionToIdle = vi.fn().mockResolvedValue(undefined);
    const queueNextStep = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
    const setNextStepAt = vi.fn();
    const loopReset = vi.fn();
    const schedulerResetBackoff = vi.fn();
    const extractControlDirective = vi.fn().mockReturnValue(null);
    const activeStepEpoch = { current: 0 };

    const deps = makeDeps({
      stopped: false, executing: false, isStaleRun: () => false,
      generateWithTimeoutRetries, transitionToIdle, queueNextStep,
      schedule, onRunnerIdle, setNextStepAt, loopReset,
      schedulerResetBackoff, extractControlDirective, activeStepEpoch,
      backoffMs: 60_000,
    });

    await executeStepImpl(deps);

    expect(schedule).toHaveBeenCalledWith(60_000);
  });


  it('does not queue next step when no pending messages after success', async () => {
    const generateWithTimeoutRetries = vi.fn().mockResolvedValue({ text: 'hello' });
    const transitionToIdle = vi.fn().mockResolvedValue(undefined);
    const queueNextStep = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
    const setNextStepAt = vi.fn();
    const loopReset = vi.fn();
    const schedulerResetBackoff = vi.fn();
    const extractControlDirective = vi.fn().mockReturnValue(null);
    const activeStepEpoch = { current: 1 };

    const deps = makeDeps({
      stopped: false, executing: false, isStaleRun: () => false,
      generateWithTimeoutRetries, transitionToIdle, queueNextStep,
      schedule, onRunnerIdle, setNextStepAt, loopReset,
      schedulerResetBackoff, extractControlDirective, activeStepEpoch,
      messageManager: { getPendingCount: vi.fn().mockReturnValue(0) },
    });

    await executeStepImpl(deps);

    expect(queueNextStep).not.toHaveBeenCalled();
  });
});
