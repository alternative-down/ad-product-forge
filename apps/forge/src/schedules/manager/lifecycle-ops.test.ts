/**
 * Tests for createManagerLifecycleOps — issue #6523 coverage gap.
 *
 * Public surface (per lifecycle-ops.ts header):
 *   - stop()
 *   - __registerSchedule(record)
 *   - triggerSchedule(record, fireDate, remainsActive, nextTriggerAt?)
 *
 * Critical paths:
 *   - stop() halts ALL schedules for an agent
 *   - triggerSchedule() dispatches notifications + records trigger time
 *
 * Pattern source: mutations.test.ts (sibling file). Store + lifecycle
 * + triggerNotification + getAgentExecutionState are all mocked at the
 * import boundary.
 *
 * Note: lifecycle-ops.ts does NOT throw typed Error subclasses from #6522 —
 * it debug-logs and re-throws. Pattern L validation is in mutations.test.ts
 * and lifecycle.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createManagerLifecycleOps } from './lifecycle-ops';
import type {
  CreateManagerLifecycleOpsInput,
  ManagerLifecycleOps,
} from './lifecycle-ops';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockForgeDebug = vi.hoisted(() => vi.fn());
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  errorMsg: vi.fn((err: unknown) =>
    err instanceof Error ? err.message : String(err),
  ),
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const baseStoredSchedule = {
  scheduleId: 'sched-1',
  agentId: 'agent-1',
  kind: 'agent' as const,
  name: 'test-schedule',
  description: undefined as string | undefined,
  scheduleType: 'date' as const,
  cronExpression: undefined as string | undefined,
  scheduledDate: undefined as number | undefined,
  timezone: 'UTC',
  content: 'test content',
  wakeWhenRunning: false,
  isActive: true,
  creatorId: undefined as string | undefined,
  createdAt: 1000,
  updatedAt: 1000,
  lastTriggeredAt: undefined as number | undefined,
  nextTriggerAt: undefined as number | undefined,
};

const fireDate = new Date('2030-01-01T12:00:00Z');

function makeStore(overrides: Partial<CreateManagerLifecycleOpsInput['store']> = {}) {
  return {
    markTriggered: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLifecycle(overrides: Partial<{
  register: (record: unknown) => Promise<void>;
  stop: () => Promise<void>;
  loadAll: () => Promise<void>;
  cancel: (scheduleId: string) => void;
}> = {}) {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    loadAll: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    ...overrides,
  };
}

function makeOps(overrides: Partial<CreateManagerLifecycleOpsInput> = {}) {
  return createManagerLifecycleOps({
    store: makeStore(),
    getLifecycle: () => makeLifecycle(),
    isActiveSchedule: () => true,
    triggerNotification: vi.fn().mockResolvedValue(undefined),
    input: {},
    ...overrides,
  });
}

let ops: ManagerLifecycleOps;

beforeEach(() => {
  ops = makeOps();
});

// ─── stop() ──────────────────────────────────────────────────────────────────

describe('stop()', () => {
  it('calls lifecycle.stop() when lifecycle is present', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({ getLifecycle: () => lifecycle });
    await ops.stop();
    expect(lifecycle.stop).toHaveBeenCalledOnce();
  });

  it('no-ops when lifecycle is null (already stopped)', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({ getLifecycle: () => null });
    await ops.stop();
    expect(lifecycle.stop).not.toHaveBeenCalled();
  });
});

// ─── __registerSchedule() ────────────────────────────────────────────────────

describe('__registerSchedule()', () => {
  it('no-ops when record is null', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({ getLifecycle: () => lifecycle });
    await ops.__registerSchedule(null);
    expect(lifecycle.register).not.toHaveBeenCalled();
  });

  it('no-ops when record is inactive (isActiveSchedule returns false)', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({
      getLifecycle: () => lifecycle,
      isActiveSchedule: () => false,
    });
    await ops.__registerSchedule(baseStoredSchedule);
    expect(lifecycle.register).not.toHaveBeenCalled();
  });

  it('calls lifecycle.register() when record is active and lifecycle is present', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({ getLifecycle: () => lifecycle });
    await ops.__registerSchedule(baseStoredSchedule);
    expect(lifecycle.register).toHaveBeenCalledWith(baseStoredSchedule);
  });

  it('no-ops (with debug log) when record is active but lifecycle is null (#5945 fix)', async () => {
    const lifecycle = makeLifecycle();
    ops = makeOps({ getLifecycle: () => null });
    await ops.__registerSchedule(baseStoredSchedule);
    expect(lifecycle.register).not.toHaveBeenCalled();
    // #5945 regression guard: the lifecycle-null branch is a documented fallback
    // and must NOT be replaced with a `!` non-null assertion that bypasses the check.
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('lifecycle is null'),
      }),
    );
  });
});

// ─── triggerSchedule() ───────────────────────────────────────────────────────

describe('triggerSchedule()', () => {
  it('agent kind: triggers notification + marks triggered', async () => {
    const triggerNotification = vi.fn().mockResolvedValue(undefined);
    const store = makeStore();
    ops = makeOps({ store, triggerNotification });
    await ops.triggerSchedule(baseStoredSchedule, fireDate, true);
    expect(triggerNotification).toHaveBeenCalledOnce();
    expect(store.markTriggered).toHaveBeenCalledWith({
      scheduleId: 'sched-1',
      lastTriggeredAt: fireDate.getTime(),
      nextTriggerAt: null,
      isActive: true,
    });
  });

  it('heartbeat + agent running: skips notification, only marks triggered', async () => {
    const triggerNotification = vi.fn().mockResolvedValue(undefined);
    const store = makeStore();
    const getAgentExecutionState = vi.fn().mockResolvedValue('running');
    ops = makeOps({ store, triggerNotification, input: { getAgentExecutionState } });
    await ops.triggerSchedule(
      { ...baseStoredSchedule, kind: 'heartbeat' },
      fireDate,
      true,
    );
    expect(triggerNotification).not.toHaveBeenCalled();
    expect(store.markTriggered).toHaveBeenCalledOnce();
  });

  it('heartbeat + agent idle: triggers notification + marks triggered', async () => {
    const triggerNotification = vi.fn().mockResolvedValue(undefined);
    const store = makeStore();
    const getAgentExecutionState = vi.fn().mockResolvedValue('idle');
    ops = makeOps({ store, triggerNotification, input: { getAgentExecutionState } });
    await ops.triggerSchedule(
      { ...baseStoredSchedule, kind: 'heartbeat' },
      fireDate,
      false,
    );
    expect(getAgentExecutionState).toHaveBeenCalledWith('agent-1');
    expect(triggerNotification).toHaveBeenCalledOnce();
    expect(store.markTriggered).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('passes nextTriggerAt through to markTriggered', async () => {
    const store = makeStore();
    ops = makeOps({ store });
    const next = fireDate.getTime() + 86_400_000;
    await ops.triggerSchedule(baseStoredSchedule, fireDate, true, next);
    expect(store.markTriggered).toHaveBeenCalledWith(
      expect.objectContaining({ nextTriggerAt: next }),
    );
  });

  it('re-throws on triggerNotification failure (after debug log)', async () => {
    const notificationError = new Error('notification delivery failed');
    const triggerNotification = vi.fn().mockRejectedValue(notificationError);
    ops = makeOps({ triggerNotification });
    await expect(ops.triggerSchedule(baseStoredSchedule, fireDate, true)).rejects.toBe(
      notificationError,
    );
  });
});
