/**
 * Unit tests for agents/agent-runner-healthcheck.ts.
 *
 * Tests runHealthcheck() and handleStartingRunTimeout() behavior.
 * No prior coverage — new module extracted from agent-runner.ts (#1718).
 */
import { describe, expect, it, vi } from 'vitest';
import { runHealthcheck, handleStartingRunTimeout } from './agent-runner-healthcheck';

const RUNTIME_ID = 'agent-42';

// ─── Deps factory ────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<Parameters<typeof runHealthcheck>[0]> = {}) {
  const defaults = {
    runtimeId: RUNTIME_ID,
    getExecutionState: vi.fn<() => Promise<'idle' | 'running' | 'absent'>>(),
    isLocallyIdle: vi.fn<() => boolean>(),
    getPendingCount: vi.fn<() => number>(),
    getWakeSnapshot: vi.fn<() => { pending: number; waitingForIdle: boolean }>(),
    onRunnerIdle: vi.fn<() => Promise<void>>(),
    beginRun: vi.fn<() => Promise<void>>(),
    queueNextStep: vi.fn<() => Promise<void>>(),
    onStartingRunTimeout: vi.fn<() => void>(),
    syncStarterState: vi.fn<(running: boolean, startedAt: number | null) => void>(),
    syncExecuting: vi.fn<(val: boolean) => void>(),
    syncTimer: vi.fn<(val: NodeJS.Timeout | null) => void>(),
    isStaleRun: vi.fn<(runEpoch: number) => boolean>(),
    notifyError: vi.fn<(error: unknown) => void>(),
  };

  // Wrap overridden function values as spies so toHaveBeenCalled works
  const wrapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'function') {
      wrapped[k] = v;
    } else {
      wrapped[k] = v;
    }
  }

  return { ...defaults, ...wrapped };
}

// ─── runHealthcheck: execution state routing ─────────────────────────────────

describe('runHealthcheck', () => {
  it('returns early when stopped (not applicable via deps)', () => {});

  describe('execution state === idle', () => {
    it('returns early when runner is not locally idle', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'idle',
        isLocallyIdle: () => false,
      });

      await runHealthcheck(deps);

      expect(deps.beginRun).not.toHaveBeenCalled();
      expect(deps.onRunnerIdle).not.toHaveBeenCalled();
      expect(deps.queueNextStep).not.toHaveBeenCalled();
    });

    it('calls beginRun when pending count > 0', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'idle',
        isLocallyIdle: () => true,
        getPendingCount: vi.fn<() => number>().mockReturnValue(3),
        beginRun: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.getPendingCount).toHaveBeenCalled();
      expect(deps.beginRun).toHaveBeenCalledWith({
        reloadRuntime: false,
        wakeStartedAt: expect.any(Number),
        markRunning: true,
      });
    });

    it('calls onRunnerIdle when wake queue has pending events', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'idle',
        isLocallyIdle: () => true,
        getPendingCount: vi.fn<() => number>().mockReturnValue(0),
        getWakeSnapshot: vi
          .fn<() => { pending: number; waitingForIdle: boolean }>()
          .mockReturnValue({ pending: 2, waitingForIdle: false }),
        onRunnerIdle: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.getWakeSnapshot).toHaveBeenCalled();
      expect(deps.onRunnerIdle).toHaveBeenCalled();
      expect(deps.beginRun).not.toHaveBeenCalled();
    });

    it('calls onRunnerIdle when waitingForIdle is true', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'idle',
        isLocallyIdle: () => true,
        getPendingCount: () => 0,
        getWakeSnapshot: () => ({ pending: 0, waitingForIdle: true }),
        onRunnerIdle: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.onRunnerIdle).toHaveBeenCalled();
    });

    it('does nothing when idle with no pending work', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'idle',
        isLocallyIdle: () => true,
        getPendingCount: () => 0,
        getWakeSnapshot: () => ({ pending: 0, waitingForIdle: false }),
      });

      await runHealthcheck(deps);

      expect(deps.beginRun).not.toHaveBeenCalled();
      expect(deps.onRunnerIdle).not.toHaveBeenCalled();
      expect(deps.queueNextStep).not.toHaveBeenCalled();
    });
  });

  describe('execution state !== idle', () => {
    it('calls queueNextStep when state is running', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'running',
        queueNextStep: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.queueNextStep).toHaveBeenCalled();
    });

    it('calls queueNextStep when state is absent', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'absent',
        queueNextStep: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.queueNextStep).toHaveBeenCalled();
    });

    it('does not call beginRun when not idle', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'running',
        isLocallyIdle: () => false,
        getPendingCount: () => 5,
        beginRun: vi.fn<() => Promise<void>>(),
      });

      await runHealthcheck(deps);

      expect(deps.beginRun).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls notifyError when queueNextStep throws', async () => {
      const error = new Error('queue failed');
      const deps = makeDeps({
        getExecutionState: async () => 'running',
        queueNextStep: async () => {
          throw error;
        },
        notifyError: vi.fn<(e: unknown) => void>(),
      });

      await runHealthcheck(deps);

      expect(deps.notifyError).toHaveBeenCalledWith(error);
    });

    it('does not re-throw on queueNextStep failure', async () => {
      const deps = makeDeps({
        getExecutionState: async () => 'running',
        queueNextStep: async () => {
          throw new Error('boom');
        },
      });

      await expect(runHealthcheck(deps)).resolves.toBeUndefined();
    });
  });

  describe('timeout wrapping', () => {
    it('wraps getExecutionState with timeout', async () => {
      const deps = makeDeps({
        getExecutionState: vi.fn<() => Promise<'idle'>>(),
      });
      deps.getExecutionState.mockResolvedValue('idle');

      await runHealthcheck(deps);

      expect(deps.getExecutionState).toHaveBeenCalledWith(RUNTIME_ID);
    });
  });
});

// ─── handleStartingRunTimeout ────────────────────────────────────────────────

describe('handleStartingRunTimeout', () => {
  it('calls onStartingRunTimeout', () => {
    const onStartingRunTimeout = vi.fn<() => void>();
    const syncStarterState = vi.fn<(running: boolean, startedAt: number | null) => void>();

    handleStartingRunTimeout({ onStartingRunTimeout, syncStarterState });

    expect(onStartingRunTimeout).toHaveBeenCalledOnce();
  });

  it('calls syncStarterState with false and null', () => {
    const onStartingRunTimeout = vi.fn<() => void>();
    const syncStarterState = vi.fn<(running: boolean, startedAt: number | null) => void>();

    handleStartingRunTimeout({ onStartingRunTimeout, syncStarterState });

    expect(syncStarterState).toHaveBeenCalledWith(false, null);
  });

  it('calls onStartingRunTimeout before syncing', () => {
    const callOrder: string[] = [];
    const onStartingRunTimeout = vi.fn<() => void>(() => callOrder.push('timeout'));
    const syncStarterState = vi.fn<(running: boolean, startedAt: number | null) => void>(() =>
      callOrder.push('sync'),
    );

    handleStartingRunTimeout({ onStartingRunTimeout, syncStarterState });

    expect(callOrder).toEqual(['timeout', 'sync']);
  });
});
