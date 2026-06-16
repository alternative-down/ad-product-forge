import { createAgentScheduleStore } from './store';
import { createScheduleLifecycle } from '../lifecycle/lifecycle';
import { createScheduleNotifications } from '../notifications/notifications';

import { createManagerQueries, type ManagerQueries } from './queries';
import { createManagerMutations, type ManagerMutations } from './mutations';
import {
  createManagerLifecycleOps,
  type ManagerLifecycleOps,
} from './lifecycle-ops';

export type AgentScheduleManager = ManagerQueries &
  ManagerMutations &
  Pick<ManagerLifecycleOps, 'stop'>;

/**
 * schedules/manager/manager.ts
 *
 * Top-level agent schedule manager. Composes three concern-specific sub-modules:
 *   - queries        (read-only): getAgentSchedule, loadAll, isActiveSchedule, listSchedules, listTasks
 *   - mutations      (write):     createHeartbeatSchedule, createSchedule, updateSchedule, updateOwnedSchedule,
 *                                 deleteSchedule, createScheduleForAgent, editCron, deleteCron, removeAgent
 *   - lifecycle-ops  (lifecycle): stop, __registerSchedule, triggerSchedule
 *
 * Refactored from a 635-line single factory function (#5737) for testability
 * and separation of concerns. Behavior is preserved bit-for-bit; see manager.test.ts
 * (24 tests) for coverage.
 */
export function createAgentScheduleManager(input: {
  db: import('../../database/client').Database;
  /** Injected lifecycle for testability. */
  lifecycle?: ReturnType<typeof createScheduleLifecycle>;
  getAgentPendingSummary?(agentId: string): Promise<{
    unreadNotificationCount: number;
    unreadConversationCount: number;
    unreadMessageCount: number;
  }>;
  getAgentExecutionState?(agentId: string): Promise<'idle' | 'running' | 'absent'>;
  notifyAgent(input: {
    agentId: string;
    scheduleId: string;
    scheduleKind: 'agent' | 'heartbeat';
    scheduleName: string;
    content: string;
    timestamp: number;
    idleOnly?: boolean;
  }): void;
}) {
  const store = createAgentScheduleStore(input.db);

  // The lifecycle is created lazily inside getLifecycle to break the
  // chicken-and-egg between lifecycle creation (needs onFire) and the
  // lifecycleOps sub-module (needs the lifecycle to call methods on).
  let lifecycle: ReturnType<typeof createScheduleLifecycle> | null = null;
  let lifecycleOps: ManagerLifecycleOps | null = null;

  const { triggerNotification } = createScheduleNotifications({
    db: input.db,
    notifyAgent: input.notifyAgent,
  });

  const getLifecycle = (): ReturnType<typeof createScheduleLifecycle> => {
    if (input.lifecycle) {
      if (!lifecycle) lifecycle = input.lifecycle;
      return lifecycle;
    }
    if (!lifecycle) {
      lifecycle = createScheduleLifecycle({
        db: input.db,
        onFire: async (record, fireDate) => {
          if (lifecycleOps) {
            await lifecycleOps.triggerSchedule(record as Parameters<typeof lifecycleOps.triggerSchedule>[0], fireDate, true);
          }
        },
      });
    }
    return lifecycle;
  };

  const queries = createManagerQueries({ store, getLifecycle });
  const mutations = createManagerMutations({
    store,
    getLifecycle,
    isActiveSchedule: queries.isActiveSchedule,
    input: { getAgentExecutionState: input.getAgentExecutionState },
  });
  const lifecycleOpsValue = createManagerLifecycleOps({
    store,
    getLifecycle,
    isActiveSchedule: queries.isActiveSchedule,
    triggerNotification,
    input: { getAgentExecutionState: input.getAgentExecutionState },
  });
  lifecycleOps = lifecycleOpsValue;

  return {
    ...queries,
    ...mutations,
    stop: lifecycleOpsValue.stop,
  };
}


// Re-export isActiveSchedule for direct import (used by __isActiveSchedule-db-coverage.test.ts).
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- direct consumer: __isActiveSchedule-db-coverage.test.ts
export { isActiveSchedule } from './queries';
