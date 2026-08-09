import { createId } from '../../utils/id';
import { and, asc, desc, eq } from 'drizzle-orm';
import { withDbErrorLogging } from '../../database/error-logging';

import type { Database } from '../../database/client';
import type { AgentSchedule } from '../../database/schema';
import { agentSchedules } from '../../database/schema';

type ScheduleType = 'cron' | 'date';
type ScheduleKind = 'agent' | 'heartbeat';

type CreateAgentScheduleInput = {
  agentId: string;
  kind: ScheduleKind;
  name: string;
  description?: string | null;
  scheduleType: ScheduleType;
  cronExpression?: string;
  scheduledDate?: number;
  timezone: string;
  content: string;
  wakeWhenRunning?: boolean;
  creatorId?: string; // agent that created this schedule (for cross-agent auth)
};

export type UpdateAgentScheduleInput = {
  name?: string | null;
  description?: string | null;
  scheduleType?: ScheduleType;
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone?: string | null;
  content?: string | null;
  wakeWhenRunning?: boolean;
  isActive?: boolean;
};


// --- Module-level helpers (exported for manager.ts, Lead 8 #5739 Phase 2) ---

// --- helpers (now module-level) ---
export function toScheduleBase(row: AgentSchedule, extra?: { lastTriggeredAt?: number | null; nextTriggerAt?: number | null; nextTriggerAt$set?: number | null }) {
    const base = {
    scheduleId: row.id,
    agentId: row.agentId,
    kind: row.kind as ScheduleKind,
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: row.scheduleType as ScheduleType,
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone,
    content: row.content,
    wakeWhenRunning: row.wakeWhenRunning !== 0,
    isActive: row.isActive === 1,
    creatorId: row.creatorId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    };
    if (!extra) return base;
    return {
    ...base,
    ...(extra.lastTriggeredAt !== undefined ? { lastTriggeredAt: extra.lastTriggeredAt ?? undefined } : {}),
    ...(extra.nextTriggerAt !== undefined ? { nextTriggerAt: extra.nextTriggerAt ?? undefined } : {}),
    ...(extra.nextTriggerAt$set !== undefined ? { nextTriggerAt$set: extra.nextTriggerAt$set } : {}),
    };
  }

export function toScheduleRecord(row: AgentSchedule) {
    return toScheduleBase(row, {
    lastTriggeredAt: row.lastTriggeredAt,
    nextTriggerAt: row.nextTriggerAt,
    nextTriggerAt$set: row.nextTriggerAt,
    });
  }

export function toScheduleSummary(row: AgentSchedule) {
    return toScheduleBase(row);
  }

export function createAgentScheduleStore(db: Database) {
  async function createSchedule(input: CreateAgentScheduleInput): Promise<AgentSchedule &{ scheduleId: string }> {
    const now = Date.now();
    const record = {
      id: createId(),
      agentId: input.agentId,
      kind: input.kind,
      name: input.name,
      description: input.description ?? null,
      scheduleType: input.scheduleType,
      cronExpression: input.cronExpression ?? null,
      scheduledDate: input.scheduledDate ?? null,
      timezone: input.timezone,
      content: input.content,
      wakeWhenRunning: input.wakeWhenRunning === false ? 0 : 1,
      isActive: 1,
      lastTriggeredAt: null,
      nextTriggerAt: null,
      creatorId: input.creatorId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'createSchedule',
      verb: 'write',
      context: { agentId: input.agentId },
      fn: () => db.insert(agentSchedules).values(record),
    });

    // Expose scheduleId as an alias for id — callers (including schedule-lifecycle)
    // expect a .scheduleId field on records returned from createSchedule.
    (record as Record<string, unknown>).scheduleId = record.id;
    return record as AgentSchedule &{ scheduleId: string };
  }

  async function listAgentSchedules(agentId: string) {
    return await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'listAgentSchedules',
      verb: 'read',
      context: { agentId },
      fn: async () => {
        const rows = await db.query.agentSchedules.findMany({
          where: eq(agentSchedules.agentId, agentId),
          orderBy: [asc(agentSchedules.createdAt)],
        });
        return rows.filter((row) => row.kind === 'agent').map(toScheduleSummary);
      },
    });
  }

  async function listActiveSchedules(): Promise<any[]> {
    return await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'listActiveSchedules',
      verb: 'read',
      context: {},
      fn: async () => {
        const rows = await db.query.agentSchedules.findMany({
          where: eq(agentSchedules.isActive, 1),
          orderBy: [asc(agentSchedules.createdAt)],
        });
        return rows.map(toScheduleRecord);
      },
    });
  }

  async function listCreatedAgentSchedules(creatorId: string, targetAgentId?: string) {
    return await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'listCreatedAgentSchedules',
      verb: 'read',
      context: { creatorId, targetAgentId },
      fn: async () => {
        const rows = await db.query.agentSchedules.findMany({
          where:
            targetAgentId !== undefined
              ? and(
                  eq(agentSchedules.creatorId, creatorId),
                  eq(agentSchedules.agentId, targetAgentId),
                )
              : eq(agentSchedules.creatorId, creatorId),
          orderBy: [desc(agentSchedules.createdAt)],
        });
        return rows.filter((row) => row.kind === 'agent').map(toScheduleSummary);
      },
    });
  }

  async function getAgentSchedule(agentId: string, scheduleId: string) {
    return await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'getAgentSchedule',
      verb: 'read',
      context: { agentId, scheduleId },
      fn: async () => {
        const row = await db.query.agentSchedules.findFirst({
          where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
        });

        if (row === null || row === undefined) {
          return null;
        }

        if (row.kind !== 'agent') {
          return null;
        }

        return toScheduleRecord(row);
      },
    });
  }

  async function getScheduleByKind(agentId: string, kind: ScheduleKind) {
    return await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'getScheduleByKind',
      verb: 'read',
      context: { agentId, kind },
      fn: async () => {
        const row = await db.query.agentSchedules.findFirst({
          where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.kind, kind)),
        });

        if (row === null || row === undefined) return null;
        return toScheduleRecord(row);
      },
    });
  }

  // Get schedule by ID (for cross-agent authorization)
  async function getScheduleById(scheduleId: string) {
    const row = await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'getScheduleById',
      verb: 'read',
      context: { scheduleId },
      fn: () => db.query.agentSchedules.findFirst({
        where: eq(agentSchedules.id, scheduleId),
      }),
    });

    if (row === null || row === undefined || row.kind !== 'agent') {
      return null;
    }

    return toScheduleRecord(row);
  }

  // Shared update logic — field-mapping block for updateAgentSchedule.
  async function _applyUpdate(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ): Promise<(AgentSchedule & { scheduleId: string }) | null> {
    const existing = await withDbErrorLogging({
      scope: 'schedules-store',
      op: '_applyUpdate',
      verb: 'read',
      context: { agentId, scheduleId },
      fn: () => db.query.agentSchedules.findFirst({
        where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
      }),
    });

    if (!existing || existing.kind !== 'agent') {
      return null;
    }

    await withDbErrorLogging({
      scope: 'schedules-store',
      op: '_applyUpdate',
      verb: 'write',
      context: { agentId, scheduleId },
      fn: () => db.update(agentSchedules).set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        scheduleType: input.scheduleType ?? (existing.scheduleType as ScheduleType),
        cronExpression: input.cronExpression === undefined ? existing.cronExpression : input.cronExpression,
        scheduledDate: input.scheduledDate === undefined ? existing.scheduledDate : input.scheduledDate,
        timezone: input.timezone ?? existing.timezone,
        content: input.content ?? existing.content,
        wakeWhenRunning: input.wakeWhenRunning === undefined ? existing.wakeWhenRunning : input.wakeWhenRunning ? 1 : 0,
        isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
        updatedAt: Date.now(),
      }).where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId))),
    });

    return {
      ...existing,
      scheduleId,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      scheduleType: input.scheduleType ?? (existing.scheduleType as ScheduleType),
      cronExpression:
        input.cronExpression === undefined ? existing.cronExpression : input.cronExpression,
      scheduledDate:
        input.scheduledDate === undefined ? existing.scheduledDate : input.scheduledDate,
      timezone: input.timezone ?? existing.timezone,
      content: input.content ?? existing.content,
      wakeWhenRunning:
        input.wakeWhenRunning === undefined
          ? existing.wakeWhenRunning
          : input.wakeWhenRunning
            ? 1
            : 0,
      isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
      updatedAt: Date.now(),
    };
  }

  async function updateAgentSchedule(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ) {
    return await _applyUpdate(agentId, scheduleId, input);
  }

  async function deleteAgentSchedule(agentId: string, scheduleId: string) {
    const existing = await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'deleteAgentSchedule',
      verb: 'read',
      context: { agentId, scheduleId },
      fn: () => db.query.agentSchedules.findFirst({
        where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
      }),
    });

    if (!existing) {
      return false;
    }

    if (existing.kind !== 'agent') {
      return false;
    }

    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'deleteAgentSchedule',
      verb: 'write',
      context: { agentId, scheduleId },
      fn: () => db.delete(agentSchedules).where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId))),
    });
    return true;
  }

  async function deactivateSchedule(scheduleId: string) {
    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'deactivateSchedule',
      verb: 'write',
      context: { scheduleId },
      fn: () => db.update(agentSchedules).set({ isActive: 0, nextTriggerAt: null, updatedAt: Date.now() }).where(eq(agentSchedules.id, scheduleId)),
    });
  }
  async function deleteHeartbeatSchedule(agentId: string) {
    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'deleteHeartbeatSchedule',
      verb: 'write',
      context: { agentId },
      fn: () => db.delete(agentSchedules).where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.kind, 'heartbeat'))),
    });
  }

  async function setNextTriggerAt(scheduleId: string, nextTriggerAt: number | null) {
    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'setNextTriggerAt',
      verb: 'write',
      context: { scheduleId },
      fn: () => db.update(agentSchedules).set({ nextTriggerAt, updatedAt: Date.now() }).where(eq(agentSchedules.id, scheduleId)),
    });
  }

  async function markTriggered(input: {
    scheduleId: string;
    lastTriggeredAt: number;
    nextTriggerAt: number | null;
    isActive: boolean;
  }) {
    await withDbErrorLogging({
      scope: 'schedules-store',
      op: 'markTriggered',
      verb: 'write',
      context: { scheduleId: input.scheduleId },
      fn: () => db.update(agentSchedules).set({
        lastTriggeredAt: input.lastTriggeredAt,
        nextTriggerAt: input.nextTriggerAt,
        isActive: input.isActive ? 1 : 0,
      }).where(eq(agentSchedules.id, input.scheduleId)),
    });
  }

  // StoredSchedule type removed to break circular reference


  return {
    createSchedule,
    listAgentSchedules,
    listActiveSchedules,
    listCreatedAgentSchedules,
    getAgentSchedule,
    getScheduleByKind,
    getScheduleById,
    updateAgentSchedule,
    deleteAgentSchedule,
    deactivateSchedule,
    deleteHeartbeatSchedule,
    setNextTriggerAt,
    markTriggered,
  };
}
