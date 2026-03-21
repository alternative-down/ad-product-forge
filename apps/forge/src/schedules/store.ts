import { createId } from '@paralleldrive/cuid2';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import { agentSchedules } from '../database/schema.js';

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
};

type UpdateAgentScheduleInput = {
  name?: string;
  description?: string | null;
  scheduleType?: ScheduleType;
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone?: string;
  content?: string;
  isActive?: boolean;
};

export function createAgentScheduleStore(db: Database) {
  async function createSchedule(input: CreateAgentScheduleInput) {
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
      isActive: 1,
      lastTriggeredAt: null,
      nextTriggerAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentSchedules).values(record);
    return record;
  }

  async function listAgentSchedules(agentId: string) {
    const rows = await db.query.agentSchedules.findMany({
      where: eq(agentSchedules.agentId, agentId),
      orderBy: [asc(agentSchedules.createdAt)],
    });

    return rows.filter((row) => row.kind === 'agent').map(toScheduleSummary);
  }

  async function listActiveSchedules() {
    const rows = await db.query.agentSchedules.findMany({
      where: eq(agentSchedules.isActive, 1),
      orderBy: [asc(agentSchedules.createdAt)],
    });

    return rows.map(toScheduleRecord);
  }

  async function getAgentSchedule(agentId: string, scheduleId: string) {
    const row = await db.query.agentSchedules.findFirst({
      where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
    });

    if (!row) {
      return null;
    }

    if (row.kind !== 'agent') {
      return null;
    }

    return toScheduleRecord(row);
  }

  async function getScheduleByKind(agentId: string, kind: ScheduleKind) {
    const row = await db.query.agentSchedules.findFirst({
      where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.kind, kind)),
    });

    if (!row) {
      return null;
    }

    return toScheduleRecord(row);
  }

  async function updateAgentSchedule(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ) {
    const existing = await db.query.agentSchedules.findFirst({
      where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
    });

    if (!existing) {
      return null;
    }

    if (existing.kind !== 'agent') {
      return null;
    }

    const updated = {
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      scheduleType: input.scheduleType ?? (existing.scheduleType as ScheduleType),
      cronExpression:
        input.cronExpression === undefined ? existing.cronExpression : input.cronExpression,
      scheduledDate:
        input.scheduledDate === undefined ? existing.scheduledDate : input.scheduledDate,
      timezone: input.timezone ?? existing.timezone,
      content: input.content ?? existing.content,
      isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
      updatedAt: Date.now(),
    };

    await db
      .update(agentSchedules)
      .set(updated)
      .where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)));

    return getAgentSchedule(agentId, scheduleId);
  }

  async function deleteAgentSchedule(agentId: string, scheduleId: string) {
    const existing = await db.query.agentSchedules.findFirst({
      where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
    });

    if (!existing) {
      return false;
    }

    if (existing.kind !== 'agent') {
      return false;
    }

    await db
      .delete(agentSchedules)
      .where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)));
    return true;
  }

  async function deactivateSchedule(scheduleId: string) {
    await db
      .update(agentSchedules)
      .set({
        isActive: 0,
        nextTriggerAt: null,
        updatedAt: Date.now(),
      })
      .where(eq(agentSchedules.id, scheduleId));
  }

  async function setNextTriggerAt(scheduleId: string, nextTriggerAt: number | null) {
    await db
      .update(agentSchedules)
      .set({
        nextTriggerAt,
        updatedAt: Date.now(),
      })
      .where(eq(agentSchedules.id, scheduleId));
  }

  async function markTriggered(input: {
    scheduleId: string;
    lastTriggeredAt: number;
    nextTriggerAt: number | null;
    isActive: boolean;
  }) {
    await db
      .update(agentSchedules)
      .set({
        lastTriggeredAt: input.lastTriggeredAt,
        nextTriggerAt: input.nextTriggerAt,
        isActive: input.isActive ? 1 : 0,
        updatedAt: Date.now(),
      })
      .where(eq(agentSchedules.id, input.scheduleId));
  }

  return {
    createSchedule,
    listAgentSchedules,
    listActiveSchedules,
    getAgentSchedule,
    getScheduleByKind,
    updateAgentSchedule,
    deleteAgentSchedule,
    deactivateSchedule,
    setNextTriggerAt,
    markTriggered,
  };
}

function toScheduleRecord(row: typeof agentSchedules.$inferSelect) {
  return {
    kind: row.kind as ScheduleKind,
    scheduleId: row.id,
    agentId: row.agentId,
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: row.scheduleType as ScheduleType,
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone,
    content: row.content,
    isActive: row.isActive === 1,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toScheduleSummary(row: typeof agentSchedules.$inferSelect) {
  return {
    kind: row.kind as ScheduleKind,
    scheduleId: row.id,
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: row.scheduleType as ScheduleType,
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone,
    content: row.content,
    isActive: row.isActive === 1,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
  };
}
