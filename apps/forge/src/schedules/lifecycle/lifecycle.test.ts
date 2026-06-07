import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted so they exist before the module-under-test is imported) ──

const mockScheduleJob = vi.hoisted(() => vi.fn());
const mockGracefulShutdown = vi.hoisted(() => vi.fn());
const mockForgeDebug = vi.hoisted(() => vi.fn());

// Per-test fixture: a Job returned by mockScheduleJob.
function makeMockJob() {
  return {
    cancel: vi.fn(),
    nextInvocation: vi.fn().mockReturnValue(new Date('2026-01-01T01:00:00Z')),
  };
}

vi.mock('node-schedule', () => ({
  scheduleJob: mockScheduleJob,
  gracefulShutdown: mockGracefulShutdown,
  Job: Object,
  RecurrenceSpecDateRange: Object,
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  isForgeDebugEnabled: vi.fn().mockReturnValue(false),
}));

// Mock the schedule store. Tests can configure mockStore.listActiveSchedules,
// mockStore.deactivateSchedule, mockStore.setNextTriggerAt per scenario.
const mockStore = vi.hoisted(() => ({
  listActiveSchedules: vi.fn(),
  deactivateSchedule: vi.fn(),
  setNextTriggerAt: vi.fn(),
}));

vi.mock('../manager/store', () => ({
  createAgentScheduleStore: () => mockStore,
}));

import type {
  ScheduleLifecycle,
  ScheduleLifecycleDeps,
  ScheduleLifecycleRecord,
  DateScheduleRecord,
  CronScheduleRecord,
} from './lifecycle';
import { createScheduleLifecycle } from './lifecycle';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ScheduleLifecycleRecord> = {}): ScheduleLifecycleRecord {
  const base = {
    scheduleId: 'sch_test1',
    isActive: true,
    kind: 'agent' as const,
    agentId: 'ag_test1',
    name: 'Test Schedule',
  };
  if (overrides.scheduleType === 'date') {
    return {
      ...base,
      ...overrides,
      scheduleType: 'date',
      scheduledDate: overrides.scheduledDate ?? Date.now() + 60_000,
    } as DateScheduleRecord;
  }
  if (overrides.scheduleType === 'cron') {
    return {
      ...base,
      ...overrides,
      scheduleType: 'cron',
      cronExpression: overrides.cronExpression ?? '0 9 * * *',
      timezone: overrides.timezone ?? 'UTC',
    } as CronScheduleRecord;
  }
  // Default branch: overrides.scheduleType is not 'date' (could be 'cron' or undefined).
  // The cast to Partial<CronScheduleRecord> widens the union for field access.
  const cronOverrides = overrides as Partial<CronScheduleRecord>;
  return {
    ...base,
    ...cronOverrides,
    scheduleType: 'cron',
    cronExpression: cronOverrides.cronExpression ?? '0 9 * * *',
    timezone: cronOverrides.timezone ?? 'UTC',
  } as CronScheduleRecord;
}

function makeDeps(overrides: Partial<ScheduleLifecycleDeps> = {}): ScheduleLifecycleDeps {
  return {
    db: {} as ScheduleLifecycleDeps['db'],
    onFire: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setupScheduleJobMock() {
  // Each scheduleJob call returns a fresh mock job; capture the callback and spec
  // for the test to invoke manually.
  const callbacks = new Map<string, (fireDate: Date) => Promise<void>>();
  const specs = new Map<string, unknown>();
  mockScheduleJob.mockImplementation((id: string, spec: unknown, fn: (fireDate: Date) => Promise<void>) => {
    callbacks.set(id, fn);
    specs.set(id, spec);
    return makeMockJob();
  });
  return { callbacks, specs };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createScheduleLifecycle', () => {
  beforeEach(() => {
    mockScheduleJob.mockReset();
    mockGracefulShutdown.mockReset().mockResolvedValue(undefined);
    mockForgeDebug.mockReset();
    mockStore.listActiveSchedules.mockReset();
    mockStore.deactivateSchedule.mockReset().mockResolvedValue(undefined);
    mockStore.setNextTriggerAt.mockReset().mockResolvedValue(undefined);
  });

  // ── loadAll ────────────────────────────────────────────────────────────

  describe('loadAll()', () => {
    it('registers all active schedules returned by the store', async () => {
      const { callbacks } = setupScheduleJobMock();
      const records = [makeRecord({ scheduleId: 'sch_a' }), makeRecord({ scheduleId: 'sch_b' })];
      mockStore.listActiveSchedules.mockResolvedValue(records);

      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.loadAll();

      expect(mockStore.listActiveSchedules).toHaveBeenCalledTimes(1);
      expect(mockScheduleJob).toHaveBeenCalledTimes(2);
      expect(callbacks.has('sch_a')).toBe(true);
      expect(callbacks.has('sch_b')).toBe(true);
    });

    it('continues loading remaining schedules after one fails', async () => {
      const { callbacks } = setupScheduleJobMock();
      // First call throws, second succeeds.
      mockScheduleJob.mockImplementationOnce(() => {
        throw new Error('invalid cron');
      });
      const records = [
        makeRecord({ scheduleId: 'sch_bad' }),
        makeRecord({ scheduleId: 'sch_good' }),
      ];
      mockStore.listActiveSchedules.mockResolvedValue(records);

      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.loadAll();

      expect(mockScheduleJob).toHaveBeenCalledTimes(2);
      expect(callbacks.has('sch_good')).toBe(true);
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn', scope: 'schedules' }),
      );
    });

    it('does nothing when store returns empty list', async () => {
      mockStore.listActiveSchedules.mockResolvedValue([]);
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.loadAll();
      expect(mockScheduleJob).not.toHaveBeenCalled();
    });

    // Tripwire for #5595: loadAll must run schedules in parallel via
    // Promise.allSettled, not as a sequential for-await loop. With N
    // schedules, sequential would take N × delay. We assert both a
    // structural property (all started before any completed) and a soft
    // wall-clock budget (3 × 30ms would be ~90ms sequential; parallel is
    // ~30ms; we allow 80ms for CI jitter).
    it('loads schedules in parallel (regression: #5595)', async () => {
      // Use the standard helper so scheduleJob returns a real mock job
      // (otherwise registerCron's job.nextInvocation() would NPE).
      setupScheduleJobMock();
      const callOrder: string[] = [];
      mockStore.listActiveSchedules.mockResolvedValue([
        makeRecord({ scheduleId: 'sch_p1' }),
        makeRecord({ scheduleId: 'sch_p2' }),
        makeRecord({ scheduleId: 'sch_p3' }),
      ]);
      mockStore.setNextTriggerAt.mockImplementation(async (id: string) => {
        callOrder.push(`start:${id}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        callOrder.push(`end:${id}`);
        return undefined;
      });

      const lifecycle = createScheduleLifecycle(makeDeps());
      const t0 = Date.now();
      await lifecycle.loadAll();
      const elapsed = Date.now() - t0;

      // Structural: all 'start:*' must appear before any 'end:*'.
      // In sequential code, pattern would be: start:p1, end:p1, start:p2, end:p2, ...
      const startIdxs = callOrder
        .map((s, i) => (s.startsWith('start:') ? i : -1))
        .filter((i) => i >= 0);
      const firstEndIdx = callOrder.findIndex((s) => s.startsWith('end:'));
      const lastStartIdx = startIdxs[startIdxs.length - 1];
      expect(firstEndIdx).toBeGreaterThan(-1);          // at least one end recorded
      expect(startIdxs.length).toBe(3);                 // all 3 schedules started
      expect(lastStartIdx).toBeLessThan(firstEndIdx);   // and ALL started before ANY ended

      // Wall clock: parallel ~30ms; sequential ~90ms. 80ms budget for CI jitter.
      expect(elapsed).toBeLessThan(80);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('cancels a registered job and removes it from the map', async () => {
      setupScheduleJobMock();
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ scheduleId: 'sch_x' }));
      // Re-fetch the job we registered so we can assert cancel was called.
      const job = mockScheduleJob.mock.results[0]!.value as ReturnType<typeof makeMockJob>;

      lifecycle.cancel('sch_x');

      expect(job.cancel).toHaveBeenCalledTimes(1);
      // Calling cancel again is a no-op (idempotent).
      lifecycle.cancel('sch_x');
      expect(job.cancel).toHaveBeenCalledTimes(1);
    });

    it('is idempotent for unknown schedule id', () => {
      const lifecycle = createScheduleLifecycle(makeDeps());
      expect(() => lifecycle.cancel('nonexistent')).not.toThrow();
    });
  });

  // ── stop ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('cancels all jobs and calls gracefulShutdown', async () => {
      setupScheduleJobMock();
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ scheduleId: 'sch_1' }));
      await lifecycle.register(makeRecord({ scheduleId: 'sch_2' }));

      await lifecycle.stop();

      const job1 = mockScheduleJob.mock.results[0]!.value as ReturnType<typeof makeMockJob>;
      const job2 = mockScheduleJob.mock.results[1]!.value as ReturnType<typeof makeMockJob>;
      expect(job1.cancel).toHaveBeenCalledTimes(1);
      expect(job2.cancel).toHaveBeenCalledTimes(1);
      expect(mockGracefulShutdown).toHaveBeenCalledTimes(1);
    });

    it('swallows gracefulShutdown errors and logs a warn', async () => {
      setupScheduleJobMock();
      mockGracefulShutdown.mockRejectedValueOnce(new Error('shutdown failed'));
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.stop();
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn', message: expect.stringContaining('gracefulShutdown') }),
      );
    });

    it('works with zero registered jobs', async () => {
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.stop();
      expect(mockGracefulShutdown).toHaveBeenCalledTimes(1);
    });
  });

  // ── register: inactive / dedup ─────────────────────────────────────────

  describe('register()', () => {
    it('rejects records with isActive=false (no schedule, no DB write)', async () => {
      setupScheduleJobMock();
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ isActive: false }));
      expect(mockScheduleJob).not.toHaveBeenCalled();
      expect(mockStore.setNextTriggerAt).not.toHaveBeenCalled();
    });

    it('cancels a pre-existing job with the same id before re-registering', async () => {
      setupScheduleJobMock();
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ scheduleId: 'sch_dup' }));
      const firstJob = mockScheduleJob.mock.results[0]!.value as ReturnType<typeof makeMockJob>;

      await lifecycle.register(makeRecord({ scheduleId: 'sch_dup' }));

      expect(firstJob.cancel).toHaveBeenCalledTimes(1);
      expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    });
  });

  // NOTE: Tests for 'throws when scheduledDate is missing' and
  // 'throws when cronExpression is missing' were removed by the discriminated
  // union refactor (#5571 + #5572 + #5576 cluster). The narrowed
  // DateScheduleRecord/CronScheduleRecord types make it impossible to construct
  // a record with a missing variant field, so the runtime defensive check is
  // no longer reachable. The type system is the contract; manager.ts casts
  // through `as unknown as`, so upstream Zod validation is the safety net.
  // ── register: date type ────────────────────────────────────────────────

  describe('register() with date schedule', () => {
    it('deactivates a past-date schedule without scheduling', async () => {
      setupScheduleJobMock();
      const past = Date.now() - 60_000;
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ scheduleType: 'date', scheduledDate: past }));
      expect(mockScheduleJob).not.toHaveBeenCalled();
      expect(mockStore.deactivateSchedule).toHaveBeenCalledWith('sch_test1');
    });

    it('schedules a future-date job and sets nextTriggerAt', async () => {
      setupScheduleJobMock();
      const future = Date.now() + 60_000;
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(makeRecord({ scheduleType: 'date', scheduledDate: future }));
      expect(mockScheduleJob).toHaveBeenCalledTimes(1);
      expect(mockStore.setNextTriggerAt).toHaveBeenCalledWith('sch_test1', future);
    });

    it('cancels the job when it fires (one-shot semantics)', async () => {
      const { callbacks } = setupScheduleJobMock();
      const future = Date.now() + 60_000;
      const onFire = vi.fn().mockResolvedValue(undefined);
      const lifecycle = createScheduleLifecycle(makeDeps({ onFire }));
      await lifecycle.register(makeRecord({ scheduleType: 'date', scheduledDate: future }));

      const cb = callbacks.get('sch_test1')!;
      await cb(new Date(future));

      const job = mockScheduleJob.mock.results[0]!.value as ReturnType<typeof makeMockJob>;
      expect(job.cancel).toHaveBeenCalled();
      expect(onFire).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: 'sch_test1' }), expect.any(Date));
    });

    it('rethrows on scheduleJob failure', async () => {
      setupScheduleJobMock();
      mockScheduleJob.mockImplementationOnce(() => {
        throw new Error('date parse fail');
      });
      const future = Date.now() + 60_000;
      const lifecycle = createScheduleLifecycle(makeDeps());
      await expect(
        lifecycle.register(makeRecord({ scheduleType: 'date', scheduledDate: future })),
      ).rejects.toThrow('date parse fail');
    });
  });

  // ── register: cron type ────────────────────────────────────────────────

  describe('register() with cron schedule', () => {
    it('schedules a cron job with the correct spec and sets nextTriggerAt', async () => {
      const { specs } = setupScheduleJobMock();
      const lifecycle = createScheduleLifecycle(makeDeps());
      await lifecycle.register(
        makeRecord({ cronExpression: '*/5 * * * *', timezone: 'America/Sao_Paulo' }),
      );
      expect(mockScheduleJob).toHaveBeenCalledTimes(1);
      expect(specs.get('sch_test1')).toEqual({ rule: '*/5 * * * *', tz: 'America/Sao_Paulo' });
      expect(mockStore.setNextTriggerAt).toHaveBeenCalledTimes(1);
    });

    it('invokes onFire and updates nextTriggerAt when the cron job fires', async () => {
      const { callbacks } = setupScheduleJobMock();
      const onFire = vi.fn().mockResolvedValue(undefined);
      const lifecycle = createScheduleLifecycle(makeDeps({ onFire }));
      await lifecycle.register(makeRecord());

      const cb = callbacks.get('sch_test1')!;
      const fireDate = new Date('2026-01-01T09:00:00Z');
      await cb(fireDate);

      expect(onFire).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: 'sch_test1' }), fireDate);
      // setNextTriggerAt called twice: once on register, once on fire.
      expect(mockStore.setNextTriggerAt.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('rethrows on scheduleJob failure', async () => {
      setupScheduleJobMock();
      mockScheduleJob.mockImplementationOnce(() => {
        throw new Error('cron parse fail');
      });
      const lifecycle = createScheduleLifecycle(makeDeps());
      await expect(lifecycle.register(makeRecord())).rejects.toThrow('cron parse fail');
    });
  });

  // Tripwire for #5596: the switch's default branch is the exhaustiveness
  // fallback. It throws a descriptive error if a hypothetical future
  // scheduleType value bypasses the type system (e.g., a record constructed
  // at runtime with a variant not yet declared in the union). The TYPE-LEVEL
  // tripwire is the `const _exhaustive: never = record;` line in the
  // switch's default branch — it forces a TSC error if a new variant is
  // added without updating the dispatch. This test exercises the RUNTIME
  // fallback so the error message format is validated.
  describe('register() exhaustiveness fallback (#5596)', () => {
    it('throws a descriptive error for an unknown scheduleType', async () => {
      const lifecycle = createScheduleLifecycle(makeDeps());
      // Cast through unknown to simulate a future variant not yet in the union
      // (e.g., a hypothetical 'interval' scheduleType). The runtime
      // exhaustiveness check should catch it.
      const fakeRecord = {
        ...makeRecord(),
        scheduleType: 'interval' as const,
      } as unknown as ScheduleLifecycleRecord;
      await expect(lifecycle.register(fakeRecord)).rejects.toThrow(/Unknown scheduleType/);
    });
  });
});
