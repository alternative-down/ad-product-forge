import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HealthcheckDeps } from './agent-runner-healthcheck';

const RUNNER_AWAIT_TIMEOUT_MS = 30_000;

const makeDeps = (overrides: Partial<HealthcheckDeps> = {}): HealthcheckDeps => ({
  runtimeId: 'test-agent',
  getExecutionState: vi.fn().mockResolvedValue('idle'),
  isLocallyIdle: vi.fn().mockReturnValue(true),
  getPendingCount: vi.fn().mockReturnValue(0),
  getWakeSnapshot: vi.fn().mockReturnValue({ pending: 0, waitingForIdle: false }),
  onRunnerIdle: vi.fn().mockResolvedValue(undefined),
  beginRun: vi.fn().mockResolvedValue(undefined),
  queueNextStep: vi.fn().mockResolvedValue(undefined),
  onStartingRunTimeout: vi.fn(),
  syncStarterState: vi.fn(),
  syncExecuting: vi.fn(),
  syncTimer: vi.fn(),
  isStaleRun: vi.fn().mockReturnValue(false),
  notifyError: vi.fn(),
  ...overrides,
});

describe('runHealthcheck', () => {
  let runHealthcheck: (deps: HealthcheckDeps) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./agent-runner-healthcheck');
    runHealthcheck = mod.runHealthcheck;
  });

  it('queues next step when execution state is absent (non-idle path)', async () => {
    const deps = makeDeps({ getExecutionState: vi.fn().mockResolvedValue('absent') });
    await runHealthcheck(deps);
    // absent is not idle, so it falls through to queueNextStep
    expect(deps.queueNextStep).toHaveBeenCalledOnce();
    expect(deps.beginRun).not.toHaveBeenCalled();
  });

  it('queues next step when running (non-idle)', async () => {
    const deps = makeDeps({ getExecutionState: vi.fn().mockResolvedValue('running') });
    await runHealthcheck(deps);
    expect(deps.queueNextStep).toHaveBeenCalledOnce();
    expect(deps.beginRun).not.toHaveBeenCalled();
  });

  it('queues next step when running and queueNextStep throws — notifies error', async () => {
    const error = new Error('queue failed');
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('running'),
      queueNextStep: vi.fn().mockRejectedValue(error),
    });
    await runHealthcheck(deps);
    expect(deps.notifyError).toHaveBeenCalledWith(error);
  });

  it('begins run when idle, locally idle, and has pending count', async () => {
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      getPendingCount: vi.fn().mockReturnValue(1),
      isLocallyIdle: vi.fn().mockReturnValue(true),
    });
    await runHealthcheck(deps);
    expect(deps.beginRun).toHaveBeenCalledOnce();
    expect(deps.queueNextStep).not.toHaveBeenCalled();
  });

  it('returns early when idle but not locally idle', async () => {
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      getPendingCount: vi.fn().mockReturnValue(1),
      isLocallyIdle: vi.fn().mockReturnValue(false),
    });
    await runHealthcheck(deps);
    expect(deps.beginRun).not.toHaveBeenCalled();
    expect(deps.queueNextStep).not.toHaveBeenCalled();
  });

  it('calls onRunnerIdle when idle with pending wake events', async () => {
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      getPendingCount: vi.fn().mockReturnValue(0),
      isLocallyIdle: vi.fn().mockReturnValue(true),
      getWakeSnapshot: vi.fn().mockReturnValue({ pending: 2, waitingForIdle: false }),
    });
    await runHealthcheck(deps);
    expect(deps.onRunnerIdle).toHaveBeenCalledOnce();
  });

  it('calls onRunnerIdle when idle and waiting for idle', async () => {
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      getPendingCount: vi.fn().mockReturnValue(0),
      isLocallyIdle: vi.fn().mockReturnValue(true),
      getWakeSnapshot: vi.fn().mockReturnValue({ pending: 0, waitingForIdle: true }),
    });
    await runHealthcheck(deps);
    expect(deps.onRunnerIdle).toHaveBeenCalledOnce();
  });

  it('does not begin run or call onRunnerIdle when idle with no pending and no waitingForIdle', async () => {
    const deps = makeDeps({
      getExecutionState: vi.fn().mockResolvedValue('idle'),
      getPendingCount: vi.fn().mockReturnValue(0),
      isLocallyIdle: vi.fn().mockReturnValue(true),
      getWakeSnapshot: vi.fn().mockReturnValue({ pending: 0, waitingForIdle: false }),
    });
    await runHealthcheck(deps);
    expect(deps.beginRun).not.toHaveBeenCalled();
    expect(deps.onRunnerIdle).not.toHaveBeenCalled();
    expect(deps.queueNextStep).not.toHaveBeenCalled();
  });
});

describe('handleStartingRunTimeout', () => {
  let handleStartingRunTimeout: (deps: { onStartingRunTimeout(): void; syncStarterState(running: boolean, startedAt: number | null): void }) => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./agent-runner-healthcheck');
    handleStartingRunTimeout = mod.handleStartingRunTimeout;
  });

  it('calls onStartingRunTimeout and clears starter state', () => {
    const onTimeout = vi.fn();
    const syncStarterState = vi.fn();
    handleStartingRunTimeout({ onStartingRunTimeout: onTimeout, syncStarterState });
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(syncStarterState).toHaveBeenCalledWith(false, null);
  });
});
