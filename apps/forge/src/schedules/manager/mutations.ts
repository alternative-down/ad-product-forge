import { forgeDebug } from '@forge-runtime/core';
import { withDbErrorLogging } from '../../database/error-logging';
import { z } from 'zod';

import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  toToolOutput,
} from '../notifications/wake-content';
import {
  normalizeScheduleUpdate,
  buildScheduleUpdateInput,
  buildScheduleRollbackInput,
} from './normalize';
import { requireScheduleEditor, requireScheduleDeleter } from './auth';
import {
  createScheduleSchema,
  createScheduleForAgentSchema,
  updateScheduleSchema,
} from '../tools/schemas';
import { createHeartbeatSchedule as makeHeartbeatSchedule } from '../lifecycle/heartbeat';
import { toScheduleRecord } from './store';
import type { ScheduleLifecycle } from '../lifecycle/lifecycle';

/**
 * schedules/manager/mutations.ts
 *
 * Mutating operations (create/update/delete) for the agent schedule manager.
 * Extracted from manager.ts (#5737) — mutation concern only.
 *
 * Public surface: createHeartbeatSchedule, createSchedule, updateSchedule, updateOwnedSchedule,
 *                 deleteSchedule, createScheduleForAgent, editCron, deleteCron, removeAgent
 */

// Use the production store type to avoid redefining shapes
type Store = ReturnType<typeof import('./store').createAgentScheduleStore>;
type ScheduleStore = Pick<
  Store,
  | 'createSchedule'
  | 'getAgentSchedule'
  | 'getScheduleById'
  | 'listAgentSchedules'
  | 'updateAgentSchedule'
  | 'deleteAgentSchedule'
  | 'setNextTriggerAt'
  | 'deleteHeartbeatSchedule'
>;

export type CreateManagerMutationsInput = {
  store: ScheduleStore;
  getLifecycle: () => ScheduleLifecycle | null;
  isActiveSchedule: (s: { isActive: boolean | number | 0 | 1 }) => boolean;
  input: {
    getAgentExecutionState?(agentId: string): Promise<'idle' | 'running' | 'absent'>;
  };
};

export type ManagerMutations = {
  createHeartbeatSchedule(agentId: string): Promise<{ scheduleId: string }>;
  createSchedule(
    agentId: string,
    rawInput: z.input<typeof createScheduleSchema>,
  ): Promise<ReturnType<typeof toToolOutput>>;
  updateSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ): Promise<ReturnType<typeof toToolOutput>>;
  updateOwnedSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ): Promise<ReturnType<typeof toToolOutput>>;
  deleteSchedule(agentId: string, scheduleId: string): Promise<{ success: boolean }>;
  createScheduleForAgent(
    creatorAgentId: string,
    rawInput: z.input<typeof createScheduleForAgentSchema>,
  ): Promise<{ targetAgentId: string; createdBy: string } & ReturnType<typeof toToolOutput>>;
  editCron(
    editorAgentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ): Promise<ReturnType<typeof toToolOutput>>;
  deleteCron(
    editorAgentId: string,
    scheduleId: string,
  ): Promise<{ success: boolean }>;
  removeAgent(agentId: string): Promise<void>;
};

export function createManagerMutations(input: CreateManagerMutationsInput): ManagerMutations {
  const { store, getLifecycle, isActiveSchedule } = input;

  async function createHeartbeatSchedule(agentId: string) {
    const record = await makeHeartbeatSchedule({
      agentId,
      store: store,
    });
    await withDbErrorLogging({
      scope: 'schedules-manager',
      op: 'createHeartbeatSchedule',
      verb: 'write',
      context: {
        agentId,
        scheduleId: (record).scheduleId,
      },
      fn: () => getLifecycle()!.register(toScheduleRecord(record)),
    });
    return {
      scheduleId: (record).scheduleId,
    };
  }

  async function createSchedule(agentId: string, rawInput: z.input<typeof createScheduleSchema>) {
    const parsed = createScheduleSchema.parse(rawInput);
    const scheduledDate =
      parsed.scheduledDate !== undefined ? parseScheduleDate(parsed.scheduledDate) : undefined;
    validateScheduleShape({
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
    });
    assertFutureScheduledDate(parsed.scheduleType, scheduledDate);
    const record = await store.createSchedule({
      agentId,
      kind: 'agent',
      name: parsed.name,
      description: parsed.description,
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: parsed.scheduleType === 'cron' ? parsed.wakeWhenRunning !== false : true,
    });
    try {
      await withDbErrorLogging({
        scope: 'schedules-manager',
        op: 'createSchedule',
        verb: 'write',
        context: { agentId, scheduleId: record.id },
        fn: () => getLifecycle()!.register(toScheduleRecord(record)),
      });
    } catch (error) {
      await store.deleteAgentSchedule(agentId, record.id);
      throw error;
    }

    return toToolOutput(toScheduleRecord(record));
  }

  async function updateSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getAgentSchedule(agentId, scheduleId);

    if (existing === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule schedule not found',
        context: { agentId, scheduleId },
      });
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(
      parsed,
      existing,
      parseScheduleDate,
    );
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({
      scheduleType: scheduleType,
      cronExpression: cronExpression ?? undefined,
      scheduledDate: scheduledDate ?? undefined,
    });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    // #5943: buildScheduleRollbackInput/buildScheduleUpdateInput return shapes
    // are structurally assignable to UpdateAgentScheduleInput (all fields optional
    // on the target type, all fields provided by the helper). The previous
    // `as UpdateAgentScheduleInput` casts were unnecessary. Drop them.
    const rollbackInput = buildScheduleRollbackInput(existing);
    const updated = await store.updateAgentSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, {
        scheduleType: normalized.scheduleType,
        cronExpression: normalized.cronExpression ?? null,
        scheduledDate: normalized.scheduledDate,
        wakeWhenRunning: normalized.wakeWhenRunning,
      }),
    );

    if (updated === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle()!.cancel(scheduleId);

    try {
      if (isActiveSchedule(updated) === true) {
        await withDbErrorLogging({
          scope: 'schedules-manager',
          op: 'updateSchedule',
          verb: 'write',
          context: { agentId, scheduleId },
          fn: () => getLifecycle()!.register(toScheduleRecord(updated)),
        });
      } else {
        await withDbErrorLogging({
          scope: 'schedules-manager',
          op: 'updateSchedule',
          verb: 'write',
          context: { agentId, scheduleId },
          fn: () => store.setNextTriggerAt(scheduleId, null),
        });
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);

      getLifecycle()!.cancel(scheduleId);

      if (
        isActiveSchedule(existing) === true &&
        restored !== null &&
        isActiveSchedule(restored) === true
      ) {
        await getLifecycle()!.register(toScheduleRecord(restored));
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (reloaded === null) {
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function updateOwnedSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getAgentSchedule(agentId, scheduleId);

    if (existing === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(
      parsed,
      existing,
      parseScheduleDate,
    );
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({
      scheduleType: scheduleType,
      cronExpression: cronExpression ?? undefined,
      scheduledDate: scheduledDate ?? undefined,
    });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    const rollbackInput = buildScheduleRollbackInput(existing);
    const updated = await store.updateAgentSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, {
        scheduleType: normalized.scheduleType,
        cronExpression: normalized.cronExpression ?? null,
        scheduledDate: normalized.scheduledDate,
        wakeWhenRunning: normalized.wakeWhenRunning,
      }),
    );

    if (updated === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle()!.cancel(scheduleId);

    try {
      if (isActiveSchedule(updated) === true) {
        await withDbErrorLogging({
          scope: 'schedules-manager',
          op: 'updateOwnedSchedule',
          verb: 'write',
          context: { agentId, scheduleId },
          fn: () => getLifecycle()!.register(toScheduleRecord(updated)),
        });
      } else {
        await withDbErrorLogging({
          scope: 'schedules-manager',
          op: 'updateOwnedSchedule',
          verb: 'write',
          context: { agentId, scheduleId },
          fn: () => store.setNextTriggerAt(scheduleId, null),
        });
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);

      getLifecycle()!.cancel(scheduleId);

      if (
        isActiveSchedule(existing) === true &&
        restored !== null &&
        isActiveSchedule(restored) === true
      ) {
        await getLifecycle()!.register(toScheduleRecord(restored));
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (reloaded === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateOwnedSchedule: not found after update',
        context: { scheduleId },
      });
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function deleteSchedule(agentId: string, scheduleId: string) {
    getLifecycle()!.cancel(scheduleId);
    const deleted = await withDbErrorLogging({
      scope: 'schedules-manager',
      op: 'deleteSchedule',
      verb: 'write',
      context: { agentId, scheduleId },
      fn: () => store.deleteAgentSchedule(agentId, scheduleId),
    });
    if (!deleted) {
      throw new Error(`Schedule not found or not authorized: ${scheduleId}`);
    }
    return { success: true };
  }

  async function createScheduleForAgent(
    creatorAgentId: string,
    rawInput: z.input<typeof createScheduleForAgentSchema>,
  ) {
    const parsed = createScheduleForAgentSchema.parse(rawInput);
    const scheduledDate =
      parsed.scheduledDate !== undefined ? parseScheduleDate(parsed.scheduledDate) : undefined;
    validateScheduleShape({
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
    });
    assertFutureScheduledDate(parsed.scheduleType, scheduledDate);

    const record = await store.createSchedule({
      agentId: parsed.targetAgentId,
      kind: 'agent',
      name: parsed.name,
      description: parsed.description,
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: parsed.scheduleType === 'cron' ? parsed.wakeWhenRunning !== false : true,
      creatorId: creatorAgentId,
    });
    const scheduleRecord = await store.getAgentSchedule(parsed.targetAgentId, record.id);

    if (scheduleRecord === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createScheduleForAgent failed to load schedule',
        context: { agentId: parsed.targetAgentId, recordId: record.id },
      });
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await withDbErrorLogging({
        scope: 'schedules-manager',
        op: 'createScheduleForAgent',
        verb: 'write',
        context: { agentId: parsed.targetAgentId, scheduleId: record.id },
        fn: () => getLifecycle()!.register(scheduleRecord),
      });
    } catch (error) {
      await store.deleteAgentSchedule(parsed.targetAgentId, record.id);
      throw error;
    }

    return {
      targetAgentId: parsed.targetAgentId,
      createdBy: creatorAgentId,
      ...toToolOutput(scheduleRecord),
    };
  }

  async function editCron(
    editorAgentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const schedule = await store.getScheduleById(scheduleId);

    if (schedule === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    requireScheduleEditor(schedule, editorAgentId);

    return await updateSchedule((schedule).agentId, scheduleId, rawInput);
  }

  async function deleteCron(editorAgentId: string, scheduleId: string) {
    const schedule = await withDbErrorLogging({
      scope: 'schedules-manager',
      op: 'deleteCron',
      verb: 'read',
      context: { editorAgentId, scheduleId },
      fn: () => store.getScheduleById(scheduleId),
    });

    if (schedule === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    requireScheduleDeleter(schedule, editorAgentId);

    getLifecycle()!.cancel(scheduleId);
    return {
      success: await withDbErrorLogging({
        scope: 'schedules-manager',
        op: 'deleteCron',
        verb: 'write',
        context: { editorAgentId, scheduleId },
        fn: () => store.deleteAgentSchedule((schedule).agentId, scheduleId),
      }),
    };
  }

  async function removeAgent(agentId: string) {
    const schedules = await store.listAgentSchedules(agentId);

    for (const scheduleRecord of schedules) {
      getLifecycle()!.cancel((scheduleRecord).scheduleId);
      await withDbErrorLogging({
        scope: 'schedules-manager',
        op: 'removeAgent',
        verb: 'write',
        context: { agentId, scheduleId: (scheduleRecord).scheduleId },
        fn: () => store.deleteAgentSchedule(agentId, (scheduleRecord).scheduleId),
      });
    }

    await withDbErrorLogging({
      scope: 'schedules-manager',
      op: 'removeAgent',
      verb: 'write',
      context: { agentId },
      fn: () => store.deleteHeartbeatSchedule(agentId),
    });
  }

  return {
    createHeartbeatSchedule,
    createSchedule,
    updateSchedule,
    updateOwnedSchedule,
    deleteSchedule,
    createScheduleForAgent,
    editCron,
    deleteCron,
    removeAgent,
  };
}
