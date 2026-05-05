import { createId } from '../utils/id';
import { and, asc, desc, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/index';
import { agentSchedules } from '../database/schema';

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

type UpdateAgentScheduleInput = {
  name?: string;
  description?: string | null;
  scheduleType?: ScheduleType;
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone?: string;
  content?: string;
  wakeWhenRunning?: boolean;
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
      wakeWhenRunning: input.wakeWhenRunning === false ? 0 : 1,
      isActive: 1,
      lastTriggeredAt: null,
      nextTriggerAt: null,
      creatorId: input.creatorId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(agentSchedules).values(record);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'createSchedule DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
    return record;
  }

  async function listAgentSchedules(agentId: string) {
    try {
      const rows = await db.query.agentSchedules.findMany({
        where: eq(agentSchedules.agentId, agentId),
        orderBy: [asc(agentSchedules.createdAt)],
      });

      return rows.filter((row) => row.kind === 'agent').map(toScheduleSummary);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'listAgentSchedules DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }
  }

  async function listActiveSchedules() {
    try {
      const rows = await db.query.agentSchedules.findMany({
        where: eq(agentSchedules.isActive, 1),
        orderBy: [asc(agentSchedules.createdAt)],
      });
      return rows.map(toScheduleRecord);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'listActiveSchedules DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }
  }

  async function listCreatedAgentSchedules(creatorId: string, targetAgentId?: string) {
    try {
      const rows = await db.query.agentSchedules.findMany({
        where: targetAgentId
          ? and(eq(agentSchedules.creatorId, creatorId), eq(agentSchedules.agentId, targetAgentId))
          : eq(agentSchedules.creatorId, creatorId),
        orderBy: [desc(agentSchedules.createdAt)],
      });

      return rows.filter((row) => row.kind === 'agent').map(toScheduleSummary);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'listCreatedAgentSchedules DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }
  }

  async function getAgentSchedule(agentId: string, scheduleId: string) {
    try {
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
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'getAgentSchedule DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  async function getOwnedSchedule(agentId: string, scheduleId: string) {
    try {
      const row = await db.query.agentSchedules.findFirst({
        where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
      });

      if (!row || row.kind !== 'agent') {
        return null;
      }

      return toScheduleRecord(row);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'getOwnedSchedule DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  async function getScheduleByKind(agentId: string, kind: ScheduleKind) {
    try {
      const row = await db.query.agentSchedules.findFirst({
        where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.kind, kind)),
      });

      if (!row) return null;
      return toScheduleRecord(row);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'getScheduleByKind DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  // Get schedule by ID (for cross-agent authorization)
  async function getScheduleById(scheduleId: string) {
    try {
      const row = await db.query.agentSchedules.findFirst({
        where: eq(agentSchedules.id, scheduleId),
      });

      if (!row || row.kind !== 'agent') {
        return null;
      }

      return toScheduleRecord(row);
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'getScheduleById DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  // Shared update logic — avoids duplicating the field-mapping block between
  // updateAgentSchedule and updateOwnedSchedule.
  async function _applyUpdate(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ): Promise<boolean> {
    const existing = await db.query.agentSchedules.findFirst({
      where: and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)),
    });

    if (!existing || existing.kind !== 'agent') {
      return false;
    }

    try {
      await db
        .update(agentSchedules)
        .set({
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
            input.wakeWhenRunning === undefined ? existing.wakeWhenRunning : input.wakeWhenRunning ? 1 : 0,
          isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
          updatedAt: Date.now(),
        })
        .where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)));
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: '_applyUpdate DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
    return true;
  }

  async function updateAgentSchedule(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ) {
    const updated = await _applyUpdate(agentId, scheduleId, input);
    return updated ? getAgentSchedule(agentId, scheduleId) : null;
  }

  async function updateOwnedSchedule(
    agentId: string,
    scheduleId: string,
    input: UpdateAgentScheduleInput,
  ) {
    const updated = await _applyUpdate(agentId, scheduleId, input);
    return updated ? getOwnedSchedule(agentId, scheduleId) : null;
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

    try {
      await db.delete(agentSchedules).where(and(eq(agentSchedules.agentId, agentId), eq(agentSchedules.id, scheduleId)));
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'deleteAgentSchedule DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
    return true;
  }

  async function deactivateSchedule(scheduleId: string) {
    try {
      await db
        .update(agentSchedules)
        .set({ isActive: 0, nextTriggerAt: null, updatedAt: Date.now() })
        .where(eq(agentSchedules.id, scheduleId));
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'deactivateSchedule DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
  }

  async function setNextTriggerAt(scheduleId: string, nextTriggerAt: number | null) {
    try {
      await db
        .update(agentSchedules)
        .set({ nextTriggerAt, updatedAt: Date.now() })
        .where(eq(agentSchedules.id, scheduleId));
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'setNextTriggerAt DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
  }

  async function markTriggered(input: { scheduleId: string; lastTriggeredAt: number; nextTriggerAt: number | null; isActive: boolean }) {
    try {
      await db
        .update(agentSchedules)
        .set({
          lastTriggeredAt: input.lastTriggeredAt,
          nextTriggerAt: input.nextTriggerAt,
          isActive: input.isActive ? 1 : 0,
        })
        .where(eq(agentSchedules.id, input.scheduleId));
    } catch (err) {
      forgeDebug({
        scope: 'schedules-store',
        level: 'error',
        message: 'markTriggered DB write failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
  }

  type StoredSchedule = Awaited<ReturnType<typeof listActiveSchedules>>[number];

  // --- helpers ---
  function toScheduleRecord(row: typeof agentSchedules.$inferSelect): StoredSchedule {
    return {
      scheduleId: row.id,
      agentId: row.agentId,
      kind: row.kind as ScheduleKind,
      name: row.name,
      description: row.description,
      scheduleType: row.scheduleType as ScheduleType,
      cronExpression: row.cronExpression ?? undefined,
      scheduledDate: row.scheduledDate ?? undefined,
      timezone: row.timezone,
      content: row.content,
      wakeWhenRunning: row.wakeWhenRunning === 1,
      isActive: row.isActive === 1,
      lastTriggeredAt: row.lastTriggeredAt ?? undefined,
      nextTriggerAt: row.nextTriggerAt ?? undefined,
      nextTriggerAt$set: row.nextTriggerAt,
      creatorId: row.creatorId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function toScheduleSummary(row: typeof agentSchedules.$inferSelect) {
    return {
      scheduleId: row.id,
      agentId: row.agentId,
      kind: row.kind as ScheduleKind,
      name: row.name,
      description: row.description,
      scheduleType: row.scheduleType as ScheduleType,
      cronExpression: row.cronExpression ?? undefined,
      scheduledDate: row.scheduledDate ?? undefined,
      timezone: row.timezone,
      content: row.content,
      wakeWhenRunning: row.wakeWhenRunning === 1,
      isActive: row.isActive === 1,
      creatorId: row.creatorId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    createSchedule,
    listAgentSchedules,
    listActiveSchedules,
    listCreatedAgentSchedules,
    getAgentSchedule,
    getOwnedSchedule,
    getScheduleByKind,
    getScheduleById,
    updateAgentSchedule,
    updateOwnedSchedule,
    deleteAgentSchedule,
    deactivateSchedule,
    setNextTriggerAt,
    markTriggered,
  };
}