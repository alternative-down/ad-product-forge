/**
 * Tests for createManagerMutations — P2 (issue #5804): 6 remaining mutation ops.
 *
 * Follows PR #5803 (P1, 10 tests for createSchedule/updateOwnedSchedule/deleteSchedule).
 * P2 covers the remaining 6 of 9 mutation operations:
 * - createHeartbeatSchedule (L95-117)
 * - updateSchedule (L158-247) — cross-agent update, no auth check (caller does)
 * - createScheduleForAgent (L355-414) — cross-agent create
 * - editCron (L414-429) — delegates to updateSchedule after auth check
 * - deleteCron (L430-454) — auth + lifecycle cancel + delete
 * - removeAgent (L455-486) — cleanup all schedules + heartbeat
 *
 * L#NN-13 13a: real source-level tests on createManagerMutations, store +
 * lifecycle + auth are mocked at the import boundary.
 * L#NN-50: import.meta.dirname for test-file-own-dir patterns if needed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManagerMutations } from './mutations';
import type { CreateManagerMutationsInput } from './mutations';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const forgeDebug = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({
  forgeDebug,
}));

const requireScheduleEditor = vi.hoisted(() => vi.fn());
const requireScheduleDeleter = vi.hoisted(() => vi.fn());

vi.mock('./auth', () => ({
  requireScheduleEditor,
  requireScheduleDeleter,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const futureDate = '2030-01-01T00:00:00.000Z';
const pastDate = '2000-01-01T00:00:00.000Z';

const makeScheduleRecord = (overrides: Record<string, unknown> = {}) => ({
  scheduleId: 'sched-1',
  agentId: 'agent-1',
  kind: 'agent' as const,
  name: 'test-schedule',
  description: undefined,
  scheduleType: 'date' as const,
  cronExpression: undefined,
  scheduledDate: 1893456000000,
  timezone: 'UTC',
  content: 'test content',
  wakeWhenRunning: true,
  isActive: 1,
  creatorId: undefined,
  createdAt: 1000,
  updatedAt: 1000,
  lastTriggeredAt: null,
  ...overrides,
});

const makeStore = (overrides: Record<string, ReturnType<typeof vi.fn>> = {}) => ({
  createSchedule: vi.fn().mockResolvedValue(makeScheduleRecord({ id: 'sched-1' })),
  getAgentSchedule: vi.fn().mockResolvedValue(makeScheduleRecord()),
  updateAgentSchedule: vi.fn().mockResolvedValue(makeScheduleRecord()),
  deleteAgentSchedule: vi.fn().mockResolvedValue(true),
  setNextTriggerAt: vi.fn().mockResolvedValue(undefined),
  getScheduleById: vi.fn().mockResolvedValue(makeScheduleRecord()),
  listAgentSchedules: vi.fn().mockResolvedValue([]),
  makeHeartbeatSchedule: vi.fn().mockResolvedValue(makeScheduleRecord({ id: 'hb-1' })),
  deleteHeartbeatSchedule: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeLifecycle = () => ({
  register: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn().mockReturnValue(undefined),
  loadAll: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

const makeInput = (overrides: Partial<CreateManagerMutationsInput> = {}) => {
  const store = overrides.store ?? makeStore();
  const lifecycle = overrides.getLifecycle?.() ?? makeLifecycle();
  return {
    store,
    getLifecycle: () => lifecycle,
    isActiveSchedule: (s: { isActive: boolean | number | 0 | 1 }) =>
      overrides.isActiveSchedule ? overrides.isActiveSchedule(s) : s.isActive === true || s.isActive === 1,
    input: {},
    ...overrides,
  } as CreateManagerMutationsInput;
};

beforeEach(() => {
  forgeDebug.mockReset();
  requireScheduleEditor.mockReset();
  requireScheduleDeleter.mockReset();
});

// ─── createHeartbeatSchedule ──────────────────────────────────────────────────

describe('createHeartbeatSchedule', () => {
  it('creates heartbeat schedule via store.createSchedule, registers with lifecycle, returns scheduleId', async () => {
    const store = makeStore();
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    const result = await mutations.createHeartbeatSchedule('agent-1');

    // makeHeartbeatSchedule is imported from '../lifecycle/heartbeat' and internally calls store.createSchedule
    expect(store.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        kind: 'heartbeat',
      }),
    );
    expect(lifecycle.register).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scheduleId: expect.any(String) });
  });

  it('logs error and throws when lifecycle.register fails', async () => {
    const store = makeStore();
    const lifecycle = {
      ...makeLifecycle(),
      register: vi.fn().mockRejectedValue(new Error('lifecycle down')),
    };
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    await expect(mutations.createHeartbeatSchedule('agent-1')).rejects.toThrow('lifecycle down');
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createHeartbeatSchedule: registerSchedule failed',
      }),
    );
  });
});

// ─── updateSchedule (cross-agent) ─────────────────────────────────────────────

describe('updateSchedule', () => {
  const validInput = {
    scheduleType: 'date' as const,
    scheduledDate: futureDate,
    name: 'updated-name',
    content: 'updated-content',
  };

  it('updates and re-registers when active', async () => {
    const updatedRecord = makeScheduleRecord({ name: 'updated-name' });
    const store = makeStore({
      updateAgentSchedule: vi.fn().mockResolvedValue(updatedRecord),
    });
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    const result = await mutations.updateSchedule('agent-1', 'sched-1', validInput);

    expect(lifecycle.cancel).toHaveBeenCalledWith('sched-1');
    expect(lifecycle.register).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ scheduleId: 'sched-1' }));
  });

  it('throws when existing schedule is null', async () => {
    const store = makeStore({ getAgentSchedule: vi.fn().mockResolvedValue(null) });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.updateSchedule('agent-1', 'sched-1', validInput)).rejects.toThrow(
      'Schedule not found: sched-1',
    );
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule schedule not found',
      }),
    );
  });

  it('throws when update returns null', async () => {
    const store = makeStore({
      getAgentSchedule: vi.fn().mockResolvedValue(makeScheduleRecord()),
      updateAgentSchedule: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.updateSchedule('agent-1', 'sched-1', validInput)).rejects.toThrow(
      'Schedule not found: sched-1',
    );
  });

  it('rolls back DB and re-registers old schedule when lifecycle registration fails', async () => {
    const existing = makeScheduleRecord();
    const updated = makeScheduleRecord({ name: 'updated-name' });
    let registerCallCount = 0;
    const store = makeStore({
      getAgentSchedule: vi
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing),
      updateAgentSchedule: vi
        .fn()
        .mockResolvedValueOnce(updated)
        .mockResolvedValueOnce(existing), // rollback
    });
    const lifecycle = {
      register: vi.fn().mockImplementation(() => {
        registerCallCount++;
        if (registerCallCount === 1) {
          return Promise.reject(new Error('lifecycle down'));
        }
        return Promise.resolve();
      }),
      cancel: vi.fn(),
      loadAll: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const input = makeInput({
      store,
      getLifecycle: () => lifecycle,
      isActiveSchedule: () => true,
    });
    const mutations = createManagerMutations(input);

    await expect(mutations.updateSchedule('agent-1', 'sched-1', validInput)).rejects.toThrow(
      'lifecycle down',
    );
    expect(store.updateAgentSchedule).toHaveBeenCalledTimes(2); // original + rollback
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule: scheduler registration failed, DB rolled back',
      }),
    );
  });

  it('throws past-date error for date schedules in the past', async () => {
    const store = makeStore();
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.updateSchedule('agent-1', 'sched-1', {
        ...validInput,
        scheduledDate: pastDate,
      }),
    ).rejects.toThrow();
  });
});

// ─── createScheduleForAgent ───────────────────────────────────────────────────

describe('createScheduleForAgent', () => {
  const validInput = {
    targetAgentId: 'target-agent',
    scheduleType: 'date' as const,
    scheduledDate: futureDate,
    name: 'cross-agent-schedule',
    content: 'cross-agent-content',
  };

  it('creates schedule, registers lifecycle, returns targetAgentId + createdBy', async () => {
    const store = makeStore();
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    const result = await mutations.createScheduleForAgent('creator-1', validInput);

    expect(store.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'target-agent',
        creatorId: 'creator-1',
      }),
    );
    expect(lifecycle.register).toHaveBeenCalledTimes(1);
    expect(result.targetAgentId).toBe('target-agent');
    expect(result.createdBy).toBe('creator-1');
    expect(result.scheduleId).toBeDefined();
  });

  it('throws when reloaded schedule is null', async () => {
    const store = makeStore({
      createSchedule: vi.fn().mockResolvedValue(makeScheduleRecord({ id: 'sched-1' })),
      getAgentSchedule: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.createScheduleForAgent('creator-1', validInput)).rejects.toThrow(
      'Failed to load created schedule: sched-1',
    );
  });

  it('cleans up DB record when lifecycle register fails', async () => {
    const store = makeStore();
    const lifecycle = {
      ...makeLifecycle(),
      register: vi.fn().mockRejectedValue(new Error('lifecycle down')),
    };
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    await expect(mutations.createScheduleForAgent('creator-1', validInput)).rejects.toThrow(
      'lifecycle down',
    );
    expect(store.deleteAgentSchedule).toHaveBeenCalledWith('target-agent', 'sched-1');
  });
});

// ─── editCron ─────────────────────────────────────────────────────────────────

describe('editCron', () => {
  const validInput = {
    scheduleType: 'date' as const,
    scheduledDate: futureDate,
    name: 'edited-name',
    content: 'edited-content',
  };

  it('throws when schedule not found', async () => {
    const store = makeStore({ getScheduleById: vi.fn().mockResolvedValue(null) });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.editCron('editor-1', 'sched-1', validInput)).rejects.toThrow(
      'Schedule not found: sched-1',
    );
  });

  it('throws when requireScheduleEditor throws', async () => {
    requireScheduleEditor.mockImplementation(() => {
      throw new Error('Not authorized to edit schedule: sched-1');
    });
    const store = makeStore();
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.editCron('editor-1', 'sched-1', validInput)).rejects.toThrow(
      'Not authorized to edit schedule: sched-1',
    );
    expect(requireScheduleEditor).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 'sched-1' }),
      'editor-1',
    );
  });

  it('delegates to updateSchedule on auth success', async () => {
    const updatedRecord = makeScheduleRecord({ name: 'edited-name' });
    const store = makeStore({
      getScheduleById: vi.fn().mockResolvedValue(makeScheduleRecord({ agentId: 'owner-1' })),
      updateAgentSchedule: vi.fn().mockResolvedValue(updatedRecord),
    });
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    const result = await mutations.editCron('editor-1', 'sched-1', validInput);

    expect(requireScheduleEditor).toHaveBeenCalledTimes(1);
    expect(lifecycle.register).toHaveBeenCalledTimes(1);
    expect(result.scheduleId).toBe('sched-1');
  });
});

// ─── deleteCron ───────────────────────────────────────────────────────────────

describe('deleteCron', () => {
  it('returns success:true on auth + delete success', async () => {
    const store = makeStore({ deleteAgentSchedule: vi.fn().mockResolvedValue(true) });
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    const result = await mutations.deleteCron('editor-1', 'sched-1');

    expect(requireScheduleDeleter).toHaveBeenCalledTimes(1);
    expect(lifecycle.cancel).toHaveBeenCalledWith('sched-1');
    expect(store.deleteAgentSchedule).toHaveBeenCalledWith(expect.any(String), 'sched-1');
    expect(result).toEqual({ success: true });
  });

  it('throws when schedule not found', async () => {
    const store = makeStore({ getScheduleById: vi.fn().mockResolvedValue(null) });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.deleteCron('editor-1', 'sched-1')).rejects.toThrow(
      'Schedule not found: sched-1',
    );
  });

  it('throws and logs forgeDebug when requireScheduleDeleter throws', async () => {
    requireScheduleDeleter.mockImplementation(() => {
      throw new Error('Not authorized to delete schedule: sched-1');
    });
    const store = makeStore();
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.deleteCron('editor-1', 'sched-1')).rejects.toThrow(
      'Not authorized to delete schedule: sched-1',
    );
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: expect.stringContaining('deleteCron failed'),
      }),
    );
  });
});

// ─── removeAgent ──────────────────────────────────────────────────────────────

describe('removeAgent', () => {
  it('removes all schedules for agent and deletes heartbeat', async () => {
    const schedules = [
      makeScheduleRecord({ scheduleId: 'sched-1', agentId: 'agent-1' }),
      makeScheduleRecord({ scheduleId: 'sched-2', agentId: 'agent-1' }),
    ];
    const store = makeStore({ listAgentSchedules: vi.fn().mockResolvedValue(schedules) });
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    await mutations.removeAgent('agent-1');

    expect(lifecycle.cancel).toHaveBeenCalledTimes(2);
    expect(lifecycle.cancel).toHaveBeenNthCalledWith(1, 'sched-1');
    expect(lifecycle.cancel).toHaveBeenNthCalledWith(2, 'sched-2');
    expect(store.deleteAgentSchedule).toHaveBeenCalledTimes(2);
    expect(store.deleteHeartbeatSchedule).toHaveBeenCalledWith('agent-1');
  });

  it('handles empty schedule list (idempotent)', async () => {
    const store = makeStore({ listAgentSchedules: vi.fn().mockResolvedValue([]) });
    const lifecycle = makeLifecycle();
    const input = makeInput({ store, getLifecycle: () => lifecycle });
    const mutations = createManagerMutations(input);

    await mutations.removeAgent('agent-1');

    expect(lifecycle.cancel).not.toHaveBeenCalled();
    expect(store.deleteHeartbeatSchedule).toHaveBeenCalledWith('agent-1');
  });

  it('throws and logs when schedule delete fails', async () => {
    const schedules = [makeScheduleRecord({ scheduleId: 'sched-1', agentId: 'agent-1' })];
    const store = makeStore({
      listAgentSchedules: vi.fn().mockResolvedValue(schedules),
      deleteAgentSchedule: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.removeAgent('agent-1')).rejects.toThrow('db error');
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: expect.stringContaining('removeAgent: failed to delete schedule'),
      }),
    );
  });

  it('throws and logs when heartbeat delete fails', async () => {
    const store = makeStore({
      listAgentSchedules: vi.fn().mockResolvedValue([]),
      deleteHeartbeatSchedule: vi.fn().mockRejectedValue(new Error('hb error')),
    });
    const input = makeInput({ store });
    const mutations = createManagerMutations(input);

    await expect(mutations.removeAgent('agent-1')).rejects.toThrow('hb error');
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'schedules-manager',
        level: 'error',
        message: expect.stringContaining('removeAgent: failed to delete heartbeat'),
      }),
    );
  });
});
