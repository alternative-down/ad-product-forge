/**
 * schedule-lifecycle.ts
 *
 * Extracted from manager.ts (#2345) — lifecycle concern only.
 * Manages the node-schedule `jobs: Map<string, Job>` registry.
 * Pure lifecycle: scheduleJob / cancel / list — no business logic.
 */
import { errorMsg } from '../../agents/error-formatting';
import {
  gracefulShutdown,
  scheduleJob,
  type Job,
  type RecurrenceSpecDateRange,
} from 'node-schedule';
import type { Database } from '../../database/client';
import { createAgentScheduleStore } from '../manager/store';
import { forgeDebug } from '@forge-runtime/core';

/** Common fields shared by every schedule record. */
type ScheduleLifecycleBase = {
  scheduleId: string;
  isActive: boolean;
  kind: 'agent' | 'heartbeat';
  agentId: string;
  name: string;
  description?: string;
  content?: string;
  wakeWhenRunning?: boolean;
};

/** A one-shot schedule that fires once at a specific Date. */
export type DateScheduleRecord = ScheduleLifecycleBase & {
  scheduleType: 'date';
  /** Unix-ms timestamp at which the job should fire. */
  scheduledDate: number;
};

/** A recurring schedule expressed as a cron expression with optional IANA timezone. */
export type CronScheduleRecord = ScheduleLifecycleBase & {
  scheduleType: 'cron';
  /** Standard 5-field cron expression. */
  cronExpression: string;
  /** IANA timezone identifier. Omitted means server-local. */
  timezone?: string;
};

/**
 * Discriminated union of all schedule shapes the lifecycle layer understands.
 * TypeScript narrows on `scheduleType`, so helpers can rely on the variant's
 * required fields (e.g. `DateScheduleRecord.scheduledDate` is `number`, not
 * `number | undefined`) without runtime defensive checks.
 */
export type ScheduleLifecycleRecord = DateScheduleRecord | CronScheduleRecord;

/**
 * Structural input type for register(). Wide enough to accept the DB row
 * (AgentSchedule + scheduleId alias) and the StoredSchedule shape from
 * toScheduleBase. Coerces 0|1 integer booleans to real booleans via
 * toLifecycleRecord().
 */
export type ScheduleLifecycleInput = {
  scheduleId: string;
  /** Narrowed by toLifecycleRecord at runtime; invalid values throw. */
  scheduleType: string;
  agentId: string;
  name: string;
  isActive: boolean | number;
  kind?: 'agent' | 'heartbeat' | string;
  description?: string | null;
  content?: string;
  wakeWhenRunning?: boolean | number;
  cronExpression?: string | null;
  timezone?: string;
  scheduledDate?: number | null;
};

export type ScheduleLifecycleDeps = {
  db: Database;
  /** Fires when a scheduled job executes (callback set by the business-logic layer). */
  onFire(record: ScheduleLifecycleRecord, fireDate: Date): Promise<void>;
};

/** The shape returned by createScheduleLifecycle(). */
export interface ScheduleLifecycle {
  /** Load all active schedules from the store and register them with node-schedule. */
  loadAll(): Promise<void>;
  /** Cancel and remove a registered job. Idempotent. */
  cancel(scheduleId: string): void;
  /** Cancel all jobs and shut down node-schedule gracefully. */
  stop(): Promise<void>;
  /**
   * Register (or re-register) a schedule with node-schedule.
   * Accepts any object that has a scheduleId, narrowed scheduleType, and the
   * fields the lifecycle needs. The DB row shape (AgentSchedule + scheduleId
   * alias) and the StoredSchedule shape (toScheduleBase output) both satisfy
   * this structural type. The conversion to the discriminated union is done
   * internally so callers don't need the `as unknown as ScheduleLifecycleRecord`
   * double cast.
   * Cancels any pre-existing job for the same id first, then schedules the new one.
   * Calls deps.onFire when a job fires.
   * Calls store.deactivateSchedule for past-date one-shot schedules.
   */
  register(record: ScheduleLifecycleInput): Promise<void>;
}

function buildCronSpec(record: CronScheduleRecord): RecurrenceSpecDateRange {
  return { rule: record.cronExpression, tz: record.timezone };
}

/**
 * Creates the lifecycle layer for schedule management.
 * Separated from business logic (notifications, agent dispatch) so that
 * each concern can be tested and understood independently.
 */
export function createScheduleLifecycle(deps: ScheduleLifecycleDeps): ScheduleLifecycle {
  const store = createAgentScheduleStore(deps.db);
  const jobs = new Map<string, Job>();

  // ── Helpers (private, exported for testability) ─────────────────────────────

  function cancelJob(scheduleId: string): void {
    const job = jobs.get(scheduleId);
    if (!job) return;
    job.cancel();
    jobs.delete(scheduleId);
  }

  function cancelIfNotActive(scheduleId: string, remainsActive: boolean): void {
    if (!remainsActive) cancelJob(scheduleId);
  }

  /** Shared error log for register failures. Keeps both variants consistent. */
  function logRegisterFailure(kind: 'date' | 'cron', scheduleId: string, err: unknown): void {
    forgeDebug({
      scope: 'schedules',
      level: 'warn',
      message: `register: failed to schedule ${kind} job`,
      context: { scheduleId, error: errorMsg(err) },
    });
  }

  /**
   * Register a one-shot date schedule. The narrowed `DateScheduleRecord` type
   * guarantees `scheduledDate` is a `number` — no defensive check needed.
   */
  async function registerDate(record: DateScheduleRecord): Promise<void> {
    const scheduledDate = new Date(record.scheduledDate);
    if (scheduledDate.getTime() <= Date.now()) {
      await store.deactivateSchedule(record.scheduleId);
      return;
    }
    try {
      const job = scheduleJob(record.scheduleId, scheduledDate, async (fireDate) => {
        cancelIfNotActive(record.scheduleId, false);
        await deps.onFire(record, fireDate);
      });
      jobs.set(record.scheduleId, job);
      await store.setNextTriggerAt(record.scheduleId, scheduledDate.getTime());
    } catch (err) {
      logRegisterFailure('date', record.scheduleId, err);
      throw err;
    }
  }

  /**
   * Register a recurring cron schedule. The narrowed `CronScheduleRecord` type
   * guarantees `cronExpression` is a `string` — no defensive check needed.
   */
  async function registerCron(record: CronScheduleRecord): Promise<void> {
    const spec: RecurrenceSpecDateRange = buildCronSpec(record);
    let job;
    try {
      job = scheduleJob(record.scheduleId, spec, async (fireDate) => {
        const nextInvocation = jobs.get(record.scheduleId)?.nextInvocation();
        cancelIfNotActive(record.scheduleId, true);
        await deps.onFire(record, fireDate);
        await store.setNextTriggerAt(record.scheduleId, nextInvocation?.getTime() ?? null);
      });
      jobs.set(record.scheduleId, job);
      await store.setNextTriggerAt(record.scheduleId, job.nextInvocation()?.getTime() ?? null);
    } catch (err) {
      logRegisterFailure('cron', record.scheduleId, err);
      throw err;
    }
  }

  async function loadAll(): Promise<void> {
    const schedules = await store.listActiveSchedules();
    // Parallel: Promise.allSettled preserves the "continue on failure" semantics
    // of the previous sequential loop. With ~50 active schedules, startup goes
    // from N×setup-time to ~setup-time total. See #5595.
    await Promise.allSettled(
      schedules.map(async (record) => {
        try {
          cancelJob(record.scheduleId);
          await register(record);
        } catch (err) {
          forgeDebug({
            scope: 'schedules',
            level: 'warn',
            message: 'loadAll: skipped schedule due to registration failure',
            context: { scheduleId: record.scheduleId, error: errorMsg(err) },
          });
          // Continue loading remaining schedules
        }
      }),
    );
  }

  async function stop(): Promise<void> {
    for (const [scheduleId, job] of jobs) {
      job.cancel();
      jobs.delete(scheduleId);
    }
    try {
      await gracefulShutdown();
    } catch (err) {
      forgeDebug({
        scope: 'schedules',
        level: 'warn',
        message: 'stop: gracefulShutdown failed',
        context: { error: errorMsg(err) },
      });
    }
  }

  /**
   * Convert the wide ScheduleLifecycleInput to the discriminated
   * ScheduleLifecycleRecord used internally. Coerces 0|1 integer booleans
   * to real booleans, and narrows the scheduleType to the literal union.
   * This is the only place where the input is "cast" to the lifecycle
   * record — call sites pass their shape directly and rely on this function
   * for the runtime invariant check.
   */
  function toLifecycleRecord(record: ScheduleLifecycleInput): ScheduleLifecycleRecord {
    const base = {
      scheduleId: record.scheduleId,
      isActive: record.isActive === 1 || record.isActive === true,
      kind: (record.kind === 'heartbeat' ? 'heartbeat' : 'agent') as
        | 'agent'
        | 'heartbeat',
      agentId: record.agentId,
      name: record.name,
      description: record.description ?? undefined,
      content: record.content ?? '',
      wakeWhenRunning:
        record.wakeWhenRunning === 1 || record.wakeWhenRunning === true,
    };
    if (record.scheduleType === 'cron') {
      return {
        ...base,
        scheduleType: 'cron' as const,
        cronExpression: record.cronExpression ?? '',
        timezone: record.timezone as string,
      };
    }
    if (record.scheduleType === 'date') {
      return {
        ...base,
        scheduleType: 'date',
        scheduledDate: record.scheduledDate ?? 0,
      };
    }
    // Runtime guard for DB rows whose schedule_type column is typed as
    // text (Drizzle widens to string). The DB invariant is the literal
    // union 'cron' | 'date'; anything else is rejected at the boundary
    // so register()'s discriminated-union dispatch always sees a
    // narrowed value. See #5608.
    throw new Error(`invalid scheduleType: ${JSON.stringify(record.scheduleType)}`);
  }

  /**
   * Dispatch entry point. The discriminated union narrows `lifecycleRecord` on
   * `scheduleType`, so each branch hands a fully-typed variant to its helper.
   * No runtime `?? ''` or `!` assertions needed — the type system enforces
   * field presence for the chosen variant.
   */
  async function register(record: ScheduleLifecycleInput): Promise<void> {
    const lifecycleRecord = toLifecycleRecord(record);
    if (!lifecycleRecord.isActive) return;

    // Cancel any pre-existing job to prevent duplicate firings from concurrent
    // updateSchedule + loadAll races.
    cancelJob(lifecycleRecord.scheduleId);

    // Exhaustiveness check: the discriminated union narrows `lifecycleRecord` per case,
    // and the `default` branch's `never` assignment makes the compiler fail
    // if a future variant is added without updating this dispatch. See #5596.
    switch (lifecycleRecord.scheduleType) {
      case 'date':
        await registerDate(lifecycleRecord);
        return;
      case 'cron':
        await registerCron(lifecycleRecord);
        return;
      default: {
        const _exhaustive: never = lifecycleRecord;
        throw new Error(`Unknown scheduleType: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return { loadAll, cancel: cancelJob, stop, register };
}
