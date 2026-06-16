import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';
import { toToolOutput } from '../notifications/wake-content';
import type { ScheduleLifecycle } from '../lifecycle/lifecycle';

/**
 * Top-level isActiveSchedule predicate.
 *
 * Extracted as a named export so callers (e.g., __isActiveSchedule-db-coverage.test.ts)
 * can import and test it directly. Returns true for both boolean true
 * and DB-integer 1 (Drizzle stores booleans as 0|1).
 */
export function isActiveSchedule(
  s: { isActive: boolean | number | 0 | 1 },
): boolean {
  return s.isActive === true || s.isActive === 1;
}

/**
 * schedules/manager/queries.ts
 *
 * Read-only operations for the agent schedule manager.
 * Extracted from manager.ts (#5737) — query concern only.
 *
 * Public surface: getAgentSchedule, loadAll, isActiveSchedule, listSchedules, listTasks
 */
type StoredSchedule = {
  scheduleId: string;
  agentId: string;
  kind: 'agent' | 'heartbeat';
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  isActive: boolean;
  creatorId?: string;
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
};

type ScheduleStore = {
  getAgentSchedule(agentId: string, scheduleId: string): Promise<StoredSchedule | null>;
  listAgentSchedules(agentId: string): Promise<StoredSchedule[]>;
  listCreatedAgentSchedules(
    creatorAgentId: string,
    targetAgentId?: string,
  ): Promise<StoredSchedule[]>;
};

export type CreateManagerQueriesInput = {
  store: ScheduleStore;
  getLifecycle: () => ScheduleLifecycle | null;
};

export type ManagerQueries = {
  getAgentSchedule(agentId: string, scheduleId: string): Promise<StoredSchedule | null>;
  loadAll(): Promise<void>;
  isActiveSchedule(s: { isActive: boolean | number | 0 | 1 }): boolean;
  listSchedules(agentId: string): Promise<ReturnType<typeof toToolOutput>[]>;
  listTasks(
    creatorAgentId: string,
    targetAgentId?: string,
  ): Promise<Array<ReturnType<typeof toToolOutput> & { createdBy: string; targetAgentId: string; taskId: string }>>;
};

export function createManagerQueries(input: CreateManagerQueriesInput): ManagerQueries {
  const { store, getLifecycle } = input;

  async function getAgentSchedule(agentId: string, scheduleId: string) {
    try {
      return await store.getAgentSchedule(agentId, scheduleId);
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'getAgentSchedule failed',
        context: { agentId, scheduleId, error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function loadAll() {
    const lifecycle = getLifecycle();
    if (!lifecycle) return;
    await lifecycle.loadAll();
  }

  function checkIsActive(s: { isActive: boolean | number | 0 | 1 }) {
    return isActiveSchedule(s);
  }

  async function listSchedules(agentId: string) {
    try {
      const schedules = await store.listAgentSchedules(agentId);
      return schedules.map(toToolOutput);
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'listSchedules failed',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function listTasks(creatorAgentId: string, targetAgentId?: string) {
    try {
      const schedules = await store.listCreatedAgentSchedules(creatorAgentId, targetAgentId);
      return schedules.map((schedule) => ({
        ...toToolOutput(schedule),
        createdBy: creatorAgentId,
        targetAgentId: schedule.agentId,
        taskId: schedule.scheduleId,
      }));
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'listTasks failed',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  return {
    getAgentSchedule,
    loadAll,
    isActiveSchedule: checkIsActive,
    listSchedules,
    listTasks,
  };
}
