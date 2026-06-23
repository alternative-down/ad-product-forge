/**
 * Tests for createManagerMutations — P1 file 1 of 4 in #5789 (largest at 497 LoC).
 *
 * Phase 1 scope: focused on the 3 most critical mutation operations
 * (createSchedule, updateOwnedSchedule, deleteSchedule) covering happy paths
 * and key error/rollback paths. The remaining 6 functions (createHeartbeatSchedule,
 * updateSchedule, createScheduleForAgent, editCron, deleteCron, removeAgent)
 * will be covered in a follow-up PR (Q1 Phase 2) per the natural segmentation
 * pattern codified Day 17.
 *
 * L#NN-13 13a: real source-level tests on createManagerMutations, store +
 * lifecycle are mocked at the import boundary (not internal function substitution).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManagerMutations } from './mutations';
import type { CreateManagerMutationsInput } from './mutations';
import type { ScheduleLifecycle } from '../lifecycle/lifecycle';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockForgeDebug = vi.hoisted(() => vi.fn());
vi.mock('@forge-runtime/core', () => ({ forgeDebug: mockForgeDebug ,
    errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
    withToolErrorLogging: vi.fn(async (params) => {
      try {
        return { valid: true, data: await params.fn() };
      } catch (error) {
        // Mirror the real impl: use errorMsg-style formatting
        const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
        return { valid: false, error: msg, hint: params.hint || '' };
      }
    }),
  }));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const futureDate = new Date('2030-01-01T00:00:00Z');
const pastDate = new Date('2020-01-01T00:00:00Z');

const baseSchedule = {
  id: 'sched-1', agentId: 'agent-1',
  scheduleType: 'date' as const,
  cronExpression: null,
  scheduledDate: futureDate.getTime(),
  wakeWhenRunning: false,
  isActive: 1,
  createdAt: 1000,
  updatedAt: 1000,
  lastTriggeredAt: null,
};

const baseLifecycle = {
  register: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn().mockResolvedValue(undefined),
  cancelAll: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  isRunning: vi.fn().mockReturnValue(false),
};

function makeStore(overrides: Partial<CreateManagerMutationsInput['store']> = {}) {
  return {
    createSchedule: vi.fn().mockResolvedValue(baseSchedule),
    getAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
    getScheduleById: vi.fn().mockResolvedValue(baseSchedule),
    listAgentSchedules: vi.fn().mockResolvedValue([]),
    updateAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
    deleteAgentSchedule: vi.fn().mockResolvedValue(true),
    setNextTriggerAt: vi.fn().mockResolvedValue(undefined),
    deleteHeartbeatSchedule: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeInput(overrides: Partial<CreateManagerMutationsInput> = {}): CreateManagerMutationsInput {
  return {
    store: makeStore() as unknown as CreateManagerMutationsInput['store'],
    getLifecycle: () => baseLifecycle as unknown as ScheduleLifecycle,
    isActiveSchedule: () => true,
    input: {},
    ...overrides,
  };
}

const validScheduleInput = {
  name: 'Test Schedule',
  content: 'Wake up',
  scheduleType: 'date' as const,
  scheduledDate: futureDate.toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  baseLifecycle.register.mockResolvedValue(undefined);
  baseLifecycle.cancel.mockResolvedValue(undefined);
});

// ─── createSchedule ───────────────────────────────────────────────────────────

describe('createSchedule', () => {
  it('parses input, validates shape, asserts future date, saves schedule, and registers with lifecycle', async () => {
    const store = makeStore();
    const lifecycle = baseLifecycle;
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
      getLifecycle: () => lifecycle as unknown as ScheduleLifecycle,
    });
    const mutations = createManagerMutations(input);

    const result = await mutations.createSchedule('agent-1', validScheduleInput);

    expect(store.createSchedule).toHaveBeenCalledTimes(1);
    expect(lifecycle.register).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: baseSchedule.id, agentId: 'agent-1' }),
    );
    expect(result).toEqual(expect.objectContaining({ scheduleId: baseSchedule.id }));
  });


  it('throws when scheduledDate is in the past for date schedules', async () => {
    const store = makeStore();
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
    });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.createSchedule('agent-1', {
        ...validScheduleInput,
        scheduledDate: pastDate.toISOString(),
      }),
    ).rejects.toThrow();
    expect(store.createSchedule).not.toHaveBeenCalled();
  });
});

// ─── updateOwnedSchedule ──────────────────────────────────────────────────────

describe('updateOwnedSchedule', () => {
  it('updates the schedule and re-registers with lifecycle when active', async () => {
    const updated = { ...baseSchedule, scheduleType: 'date' as const };
    // getAgentSchedule returns toScheduleRecord(row) — schedule-record style
    const scheduleRecordStyle = { ...updated, scheduleId: updated.id };
    const store = makeStore({
      getAgentSchedule: vi.fn().mockResolvedValue(scheduleRecordStyle),
      updateAgentSchedule: vi.fn().mockResolvedValue(updated),
    });
    const lifecycle = baseLifecycle;
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
      getLifecycle: () => lifecycle as unknown as ScheduleLifecycle,
    });
    const mutations = createManagerMutations(input);

    const result = await mutations.updateOwnedSchedule('agent-1', 'sched-1', {
      scheduleType: 'date',
    });

    expect(store.updateAgentSchedule).toHaveBeenCalledTimes(1);
    expect(lifecycle.cancel).toHaveBeenCalledWith('sched-1');
    expect(lifecycle.register).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 'sched-1' }),
    );
    expect(result).toEqual(expect.objectContaining({ scheduleId: 'sched-1' }));
  });

  it('throws "Schedule not found" when existing is null', async () => {
    const store = makeStore({
      getAgentSchedule: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
    });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.updateOwnedSchedule('agent-1', 'missing', { scheduleType: 'date' }),
    ).rejects.toThrow(/Schedule not found: missing/);
    expect(store.updateAgentSchedule).not.toHaveBeenCalled();
  });

  it('throws "Schedule not found" when update returns null', async () => {
    const store = makeStore({
      getAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
      updateAgentSchedule: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
    });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.updateOwnedSchedule('agent-1', 'sched-1', { scheduleType: 'date' }),
    ).rejects.toThrow(/Schedule not found: sched-1/);
  });

  it('rolls back DB and re-registers old schedule when lifecycle registration fails', async () => {
    const existing = { ...baseSchedule, id: 'sched-1' };
    const updated = { ...baseSchedule, id: 'sched-1' };
    const restored = { ...baseSchedule, id: 'sched-1' };
    const store = makeStore({
      getAgentSchedule: vi
        .fn()
        .mockResolvedValueOnce(existing) // initial fetch
        .mockResolvedValueOnce(existing) // for buildScheduleRollbackInput
        .mockResolvedValueOnce(restored), // for re-register after rollback
      updateAgentSchedule: vi
        .fn()
        .mockResolvedValueOnce(updated) // initial update succeeds
        .mockResolvedValueOnce(restored), // rollback succeeds
    });
    const lifecycle = {
      ...baseLifecycle,
      register: vi
        .fn()
        .mockRejectedValueOnce(new Error('lifecycle register failed')) // first register fails
        .mockResolvedValueOnce(undefined), // re-register after rollback
    };
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
      getLifecycle: () => lifecycle as unknown as ScheduleLifecycle,
    });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.updateOwnedSchedule('agent-1', 'sched-1', { scheduleType: 'date' }),
    ).rejects.toThrow(/lifecycle register failed/);

    expect(store.updateAgentSchedule).toHaveBeenCalledTimes(2); // initial + rollback
    expect(lifecycle.cancel).toHaveBeenCalledWith('sched-1');
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: expect.stringMatching(/scheduler registration failed/),
      }),
    );
  });

  it('sets nextTriggerAt to null when updated schedule is not active', async () => {
    const updated = { ...baseSchedule, isActive: 0 };
    const store = makeStore({
      getAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
      updateAgentSchedule: vi.fn().mockResolvedValue(updated),
    });
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
      isActiveSchedule: () => false,
    });
    const mutations = createManagerMutations(input);

    await mutations.updateOwnedSchedule('agent-1', 'sched-1', { scheduleType: 'date' });

    expect(store.setNextTriggerAt).toHaveBeenCalledWith('sched-1', null);
  });

  it('throws "not found after update" when reloaded is null', async () => {
    const store = makeStore({
      getAgentSchedule: vi
        .fn()
        .mockResolvedValueOnce(baseSchedule) // initial fetch
        .mockResolvedValueOnce(null), // reload after update returns null
      updateAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
    });
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
    });
    const mutations = createManagerMutations(input);

    await expect(
      mutations.updateOwnedSchedule('agent-1', 'sched-1', { scheduleType: 'date' }),
    ).rejects.toThrow(/Schedule not found after update/);
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: expect.stringMatching(/not found after update/),
      }),
    );
  });
});

// ─── deleteSchedule ───────────────────────────────────────────────────────────

describe('deleteSchedule', () => {
  it('cancels lifecycle and deletes schedule, returning success', async () => {
    const store = makeStore();
    const lifecycle = baseLifecycle;
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
      getLifecycle: () => lifecycle as unknown as ScheduleLifecycle,
    });
    const mutations = createManagerMutations(input);

    const result = await mutations.deleteSchedule('agent-1', 'sched-1');

    expect(lifecycle.cancel).toHaveBeenCalledWith('sched-1');
    expect(store.deleteAgentSchedule).toHaveBeenCalledWith('agent-1', 'sched-1');
    expect(result).toEqual({ success: true });
  });

  it('throws and logs error when delete returns false', async () => {
    const store = makeStore({
      deleteAgentSchedule: vi.fn().mockResolvedValue(false),
    });
    const input = makeInput({
      store: store as unknown as CreateManagerMutationsInput['store'],
    });
    const mutations = createManagerMutations(input);

    await expect(mutations.deleteSchedule('agent-1', 'sched-1')).rejects.toThrow(
      /Schedule not found or not authorized/,
    );
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
    );
  });
});
