/**
 * schedule-lifecycle.ts
 *
 * Extracted from manager.ts (#2345) — lifecycle concern only.
 * Manages the node-schedule `jobs: Map<string, Job>` registry.
 * Pure lifecycle: scheduleJob / cancel / list — no business logic.
 */
import {
  gracefulShutdown,
  scheduleJob,
  cancelJob as cancelScheduledJob, // eslint-disable-line @typescript-eslint/no-unused-vars
  type Job,
  type RecurrenceSpecDateRange,
} from 'node-schedule';
import type { Database } from '../database/schema';
import { createAgentScheduleStore } from './store';
import { forgeDebug } from '@forge-runtime/core';

/** Minimal shape of a schedule record as used by lifecycle operations. */
export type ScheduleLifecycleRecord = {
  scheduleId: string;
  scheduleType: 'cron' | 'date';
  scheduledDate?: number;
  cronExpression?: string;
  timezone?: string;
  isActive: boolean;
  kind: 'agent' | 'heartbeat';
  agentId: string;
  description?: string;
  name: string;
  content?: string;
  wakeWhenRunning?: boolean;
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
   * Cancels any pre-existing job for the same id first, then schedules the new one.
   * Calls deps.onFire when a job fires.
   * Calls store.deactivateSchedule for past-date one-shot schedules.
   */
  register(record: ScheduleLifecycleRecord): Promise<void>;
}

function buildCronSpec(record: ScheduleLifecycleRecord): RecurrenceSpecDateRange {
  return { rule: record.cronExpression!, tz: record.timezone };
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

  async function loadAll(): Promise<void> {
    const schedules = await store.listActiveSchedules();
    for (const record of schedules) {
      try {
        cancelJob(record.scheduleId);
        await register(record);
      } catch (err) {
        forgeDebug({
          scope: 'schedules',
          level: 'warn',
          message: 'loadAll: skipped schedule due to registration failure',
          context: {
            scheduleId: record.scheduleId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        // Continue loading remaining schedules
      }
    }
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
        context: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  async function register(record: ScheduleLifecycleRecord): Promise<void> {
    if (!record.isActive) return;

    // Cancel any pre-existing job to prevent duplicate firings from concurrent
    // updateSchedule + loadAll races.
    cancelJob(record.scheduleId);

    if (record.scheduleType === 'date') {
      if ((record.scheduledDate ?? '') === '') {
        throw new Error(`Date schedule ${record.scheduleId} is missing scheduledDate`);
      }
      const scheduledDate = new Date(record.scheduledDate!);
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
        forgeDebug({
          scope: 'schedules',
          level: 'warn',
          message: 'register: failed to schedule date job',
          context: {
            scheduleId: record.scheduleId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
      return;
    }

    if ((record.cronExpression ?? '') === '') {
      throw new Error(`Cron schedule ${record.scheduleId} is missing cronExpression`);
    }

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
      forgeDebug({
        scope: 'schedules',
        level: 'warn',
        message: 'register: failed to schedule cron job',
        context: {
          scheduleId: record.scheduleId,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  return { loadAll, cancel: cancelJob, stop, register };
}
