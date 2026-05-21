/**
 * Unit tests for executeStep (agent-runner-execute.ts).
 *
 * Tests are grouped by execution phase:
 *   Phase 0 — early exit guards (stopped / executing / stale)
 *   Phase 1 — execution state lookup
 *   Phase 2 — contract loading
 *   Phase 3 — generation call
 *   Phase 4 — result interpretation
 *   Error path — backoff scheduling
 *
 * Each test constructs its own mocks inline. No shared vi.mock() at
 * module level to avoid vitest hoisting issues.
 */
import { expect, it, vi } from 'vitest';
import { executeStep } from './agent-runner-execute';

// ─── Mock helpers ────────────────────────────────────────────────────────────────

function mockStore(
  overrides: Partial<{
    getExecutionState: ReturnType<typeof vi.fn>;
    getRunnableContract: ReturnType<typeof vi.fn>;
    setExecutionState: ReturnType<typeof vi.fn>;
    setExecutionAbsent: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    getExecutionState: vi.fn().mockResolvedValue('idle'),
    getRunnableContract: vi.fn().mockResolvedValue(null),
    setExecutionState: vi.fn().mockResolvedValue(undefined),
    setExecutionAbsent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockScheduler(
  overrides: Partial<{
    resetBackoff: ReturnType<typeof vi.fn>;
    scheduleNextStep: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    resetBackoff: vi.fn(),
    scheduleNextStep: vi.fn(),
    ...overrides,
  };
}

function mockMessageManager(pendingCount = 0) {
  return {
    getPendingCount: vi.fn().mockReturnValue(pendingCount),
  };
}

function mockEpochState() {
  return { activeRunEpoch: 0, activeStepEpoch: 0, activeGenerateToken: 0, activeRunId: null };
}

function mockBackoffState() {
  return { backoffMs: 60_000, instant: false, nextStepAt: null };
}

function mockProgressState() {
  return {
    lastStepStartedAt: null,
    lastStepStage: null,
    lastGenerateProgress: null,
  };
}

function mockLoopState() {
  return { lastLoopSignature: null, repeatedLoopCount: 0 };
}

function makeDeps(
  overrides: {
    stopped?: boolean;
    executingRef?: { value: boolean };
    isStaleRun?: (runEpoch: number) => boolean;
    runtimeId?: string;
    contractId?: string;
    runEpoch?: number;
    store?: ReturnType<typeof mockStore>;
    messageManager?: ReturnType<typeof mockMessageManager>;
    scheduler?: ReturnType<typeof mockScheduler>;
    transitionToIdle?: ReturnType<typeof vi.fn>;
    queueNextStep?: ReturnType<typeof vi.fn>;
    onRunnerIdle?: ReturnType<typeof vi.fn>;
    generateWithTimeoutRetries?: ReturnType<typeof vi.fn>;
    markGenerateProgress?: ReturnType<typeof vi.fn>;
    setLoopSignature?: ReturnType<typeof vi.fn>;
    loopSignature?: string;
    loadAgentContextInstructions?: ReturnType<typeof vi.fn>;
    currentRuntime?: unknown;
    db?: unknown;
    pendingLongTermMemoryRecallSystemText?: string | null;
    flushPendingRunMessages?: ReturnType<typeof vi.fn>;
    usage?: unknown;
    notifications?: unknown;
    homeMetricSnapshots?: unknown;
    runLastMessages?: number;
    currentGenerateAbortController?: AbortController | null;
    setCurrentGenerateAbortController?: ReturnType<typeof vi.fn>;
    loopDetector?: unknown;
    forgeDebug?: ReturnType<typeof vi.fn>;
    mastraId?: string;
    pricingModelKey?: string;
    modelProfileId?: string;
  } = {},
) {
  return {
    contractId: 'contract-1',
    runEpoch: 1,
    runtimeId: 'runtime-1',
    mastraId: 'mastra-1',
    pricingModelKey: 'flat-rate',
    modelProfileId: 'profile-1',
    stopped: false,
    executingRef: { value: false },
    isStaleRun: () => false,
    epochState: mockEpochState(),
    backoffState: mockBackoffState(),
    progressState: mockProgressState(),
    loopState: mockLoopState(),
    store: mockStore(),
    messageManager: mockMessageManager(),
    scheduler: mockScheduler(),
    loopDetector: {},
    onRunnerIdle: vi.fn().mockResolvedValue(undefined),
    transitionToIdle: vi.fn().mockResolvedValue(undefined),
    queueNextStep: vi.fn().mockResolvedValue(undefined),
    generateWithTimeoutRetries: vi.fn().mockResolvedValue({ text: '' }),
    markGenerateProgress: vi.fn(),
    setLoopSignature: vi.fn(),
    loopSignature: '',
    loadAgentContextInstructions: vi.fn().mockResolvedValue(null),
    currentRuntime: null as never,
    db: null as never,
    pendingLongTermMemoryRecallSystemText: null,
    flushPendingRunMessages: vi.fn().mockReturnValue(''),
    usage: null as never,
    notifications: null as never,
    homeMetricSnapshots: null as never,
    runLastMessages: 20,
    currentGenerateAbortController: null,
    setCurrentGenerateAbortController: vi.fn(),
    forgeDebug: vi.fn(),
    ...overrides,
  };
}

// ─── Phase 0 — early exit guards ─────────────────────────────────────────────

it('returns immediately when stopped', async () => {
  const deps = makeDeps({ stopped: true });
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

it('returns immediately when executing', async () => {
  const deps = makeDeps({ executingRef: { value: true } });
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

it('returns immediately when run is stale', async () => {
  const isStaleRun = vi.fn().mockReturnValue(false);
  const deps = makeDeps({ isStaleRun });
  isStaleRun.mockReturnValueOnce(true); // stale on first call (at guard)
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

// ─── Phase 1 — execution state lookup ─────────────────────────────────────────

it('returns immediately when execution state is idle', async () => {
  const store = mockStore({ getExecutionState: vi.fn().mockResolvedValue('idle') });
  const deps = makeDeps({ store });
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

it('sets execution state to running when absent', async () => {
  const store = mockStore({ getExecutionState: vi.fn().mockResolvedValue('absent') });
  const deps = makeDeps({ store });
  await executeStep(deps as any);
  expect(store.setExecutionState).toHaveBeenCalledWith('runtime-1', 'running');
});

it('returns immediately when run becomes stale after execution state check', async () => {
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
  });
  const isStaleRun = vi.fn().mockReturnValue(false);
  const deps = makeDeps({ store, isStaleRun });
  // not stale at guard, not stale at idle check, stale after setExecutionState
  isStaleRun.mockReturnValueOnce(false); // guard
  isStaleRun.mockReturnValueOnce(false); // idle check
  isStaleRun.mockReturnValueOnce(true); // after setExecutionState
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

// ─── Phase 2 — contract loading ───────────────────────────────────────────────

it('returns immediately when contract is null — calls transitionToIdle with deferWakeQueueDrain', async () => {
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(null),
  });
  const deps = makeDeps({ store });
  await executeStep(deps as any);
  expect(deps.transitionToIdle).toHaveBeenCalledWith(1, { deferWakeQueueDrain: true });
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

it('queues next step when loaded contract id differs from requested contractId', async () => {
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue({
      id: 'different-contract',
      budgetUsd: 10,
      endsAt: Date.now() + 86_400_000,
    }),
  });
  const deps = makeDeps({ store, contractId: 'expected-contract' });
  await executeStep(deps as any);
  expect(deps.queueNextStep).toHaveBeenCalledWith(1);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

it('returns immediately when run becomes stale after loading contract', async () => {
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi
      .fn()
      .mockResolvedValue({ id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 }),
  });
  let callCount = 0;
  const isStaleRun = vi.fn().mockImplementation(() => {
    callCount++;
    return callCount === 3; // stale on 3rd call (after contract loaded)
  });
  const deps = makeDeps({ store, isStaleRun });
  await executeStep(deps as any);
  expect(deps.generateWithTimeoutRetries).not.toHaveBeenCalled();
});

// ─── Phase 3 — generation ──────────────────────────────────────────────────────

it('calls generateWithTimeoutRetries with correct args when contract matches', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({ text: '' });
  const deps = makeDeps({ store, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(generateWithTimeoutRetries).toHaveBeenCalledTimes(1);
  const [, runEpoch, contractId, passedContract] = generateWithTimeoutRetries.mock.calls[0];
  expect(runEpoch).toBe(1);
  expect(contractId).toBe('contract-1');
  expect(passedContract).toBe(contract);
});

it('returns immediately when run becomes stale after generate call', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const isStaleRun = vi.fn().mockReturnValue(false);
  const deps = makeDeps({ store, isStaleRun });
  isStaleRun.mockReturnValueOnce(false); // guard
  isStaleRun.mockReturnValueOnce(false); // idle check
  isStaleRun.mockReturnValueOnce(false); // after setExecutionState
  isStaleRun.mockReturnValueOnce(false); // after loading contract
  isStaleRun.mockReturnValueOnce(true); // after generate call
  await executeStep(deps as any);
  expect(deps.transitionToIdle).not.toHaveBeenCalled();
  expect(deps.queueNextStep).not.toHaveBeenCalled();
});

// ─── Phase 4 — result interpretation ──────────────────────────────────────────

it('drains wake queue when stop requested with no pending messages', async () => {
  // Use unique fresh mocks for this test to isolate from other tests' mocks.
  // We pass the mock directly via a partial deps object so the spread works.
  const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
  const transitionToIdle = vi.fn().mockResolvedValue(undefined);
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const messageManager = mockMessageManager(0);
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({
    text: 'STOP_AND_IDLE',
  });
  const baseDeps = makeDeps({ store, messageManager, generateWithTimeoutRetries });
  const deps = {
    ...baseDeps,
    onRunnerIdle,
    transitionToIdle,
  };
  await executeStep(deps as any);
  expect(onRunnerIdle).toHaveBeenCalledTimes(1);
});

it('resets loop detector and clears backoff nextStepAt when stop requested', async () => {
  // loopDetector.reset() is called instead of directly mutating loopState.
  // Verify via the loopDetector mock behavior (it holds its own state).
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const loopState = { lastLoopSignature: 'sig', repeatedLoopCount: 5 };
  const loopDetector = {
    reset: vi.fn(),
    register: vi.fn(),
    isStuck: vi.fn().mockReturnValue(false),
    getSignatureCount: vi.fn().mockReturnValue(5),
    getCurrentSignature: vi.fn().mockReturnValue('sig'),
  };
  const backoffState = { backoffMs: 60_000, instant: false, nextStepAt: 123 };
  const messageManager = mockMessageManager(0);
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({
    text: 'STOP_AND_IDLE',
  });
  const deps = makeDeps({
    store,
    loopState,
    loopDetector,
    backoffState,
    messageManager,
    generateWithTimeoutRetries,
  } as Parameters<typeof makeDeps>[0]);
  await executeStep(deps as any);
  expect(loopDetector.reset).toHaveBeenCalledTimes(1);
  expect(backoffState.nextStepAt).toBeNull();
});

it('drains wake queue when stop requested but pending messages remain', async () => {
  // With STOP_AND_IDLE and pending messages, the agent stops generating but
  // stays available to process incoming messages. The wake queue is drained
  // (via onRunnerIdle) so new messages can wake the agent. No next step is
  // queued immediately — the agent awaits new incoming messages.
  const onRunnerIdle = vi.fn().mockResolvedValue(undefined);
  const transitionToIdle = vi.fn().mockResolvedValue(undefined);
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const messageManager = mockMessageManager(3);
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({
    text: 'STOP_AND_IDLE',
  });
  const baseDeps = makeDeps({ store, messageManager, generateWithTimeoutRetries });
  const deps = { ...baseDeps, onRunnerIdle, transitionToIdle };
  await executeStep(deps as any);
  // transitionToIdle is skipped — we are not fully going idle (pending messages exist)
  expect(transitionToIdle).not.toHaveBeenCalled();
  // onRunnerIdle IS called to drain the wake queue, re-enabling new message wake-ups
  expect(onRunnerIdle).toHaveBeenCalledTimes(1);
  // No backoff reset or next-step queue — the agent awaits incoming messages
  expect(baseDeps.scheduler.resetBackoff).not.toHaveBeenCalled();
  expect(baseDeps.queueNextStep).not.toHaveBeenCalled();
});

it('resets scheduler backoff on successful non-stop generation', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const scheduler = mockScheduler();
  const messageManager = mockMessageManager(0);
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({ text: 'hello world' });
  const deps = makeDeps({ store, scheduler, messageManager, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(scheduler.resetBackoff).toHaveBeenCalledTimes(1);
});

it('queues next step when pending messages exist after non-stop generation', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const messageManager = mockMessageManager(2);
  const generateWithTimeoutRetries = vi.fn().mockResolvedValue({ text: 'response text' });
  const deps = makeDeps({ store, messageManager, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(deps.queueNextStep).toHaveBeenCalledWith(1);
});

// ─── Error path ────────────────────────────────────────────────────────────────

it('does not schedule when run becomes stale during error', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
    setExecutionAbsent: vi.fn().mockResolvedValue(undefined),
  });
  const scheduler = mockScheduler();
  let callCount = 0;
  // isStaleRun called twice in catch block: first check → stale, skip rest
  const isStaleRun = vi.fn().mockImplementation(() => {
    callCount++;
    return callCount >= 2; // stale on 2nd call (first call in catch block)
  });
  const generateWithTimeoutRetries = vi.fn().mockRejectedValue(new Error('generation failed'));
  const deps = makeDeps({ store, scheduler, isStaleRun, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(scheduler.scheduleNextStep).not.toHaveBeenCalled();
});

it('schedules exponential backoff on generation error', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const scheduler = mockScheduler();
  const generateWithTimeoutRetries = vi.fn().mockRejectedValue(new Error('generation failed'));
  const deps = makeDeps({ store, scheduler, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(scheduler.scheduleNextStep).toHaveBeenCalled();
  const [delayMs] = scheduler.scheduleNextStep.mock.calls[0];
  expect(delayMs).toBeGreaterThan(0);
});

it('calls forgeDebug on error with correct context fields', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
  });
  const forgeDebug = vi.fn();
  const generateWithTimeoutRetries = vi.fn().mockRejectedValue(new Error('boom'));
  const deps = makeDeps({ store, forgeDebug, generateWithTimeoutRetries });
  await executeStep(deps as any);
  // Two calls: (1) 'executing step' debug before generate, (2) error debug in catch
  expect(forgeDebug).toHaveBeenCalledTimes(2);
  const errorCall = forgeDebug.mock.calls[1]; // [0] is the 'executing step' call
  expect(errorCall[0].scope).toBe('agent-runner');
  expect(errorCall[0].level).toBe('error');
  expect(errorCall[0].runtimeId).toBe('runtime-1');
  expect(errorCall[0].context.mastraId).toBe('mastra-1');
});

it('sets execution absent state on error', async () => {
  const contract = { id: 'contract-1', budgetUsd: 10, endsAt: Date.now() + 86_400_000 };
  const store = mockStore({
    getExecutionState: vi.fn().mockResolvedValue('running'),
    getRunnableContract: vi.fn().mockResolvedValue(contract),
    setExecutionAbsent: vi.fn().mockResolvedValue(undefined),
  });
  const generateWithTimeoutRetries = vi.fn().mockRejectedValue(new Error('boom'));
  const deps = makeDeps({ store, generateWithTimeoutRetries });
  await executeStep(deps as any);
  expect(store.setExecutionAbsent).toHaveBeenCalledWith('runtime-1', expect.objectContaining({}));
});
