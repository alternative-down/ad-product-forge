/**
 * Type guard + literal union for schedule scheduling kinds.
 *
 * The DB column agent_schedules.schedule_type is typed as text (Drizzle
 * inference widens to string). All write paths in this module originate from
 * either the zod discriminated union (createScheduleSchema) which already
 * narrows to 'cron' | 'date', or a previous value produced by this same
 * module. Therefore the DB invariant is 'cron' | 'date', and we encode that
 * here as a literal union + runtime guard.
 */
export type ScheduleType = 'cron' | 'date';

export function isScheduleType(s: string): s is ScheduleType {
  return s === 'cron' || s === 'date';
}

export type NormalizedScheduleUpdate = {
  scheduleType: ScheduleType;
  cronExpression: string | null | undefined;
  scheduledDate: number | null;
  wakeWhenRunning: boolean;
  shouldRequireFutureDate: boolean;
  parsedScheduledDate: number | undefined;
};

/** Shape of the parsed update input that contributes non-normalized fields. */
export type ScheduleUpdateInputParts = {
  scheduleType?: ScheduleType | null;
  name?: string | null;
  description?: string | null;
  timezone?: string | null;
  content?: string | null;
  isActive?: boolean;
  /** Only valid for cron schedules */
  wakeWhenRunning?: boolean;
};

/** Shape of the existing schedule record used as base/defaults. */
export type ExistingScheduleFields = {
  name: string;
  description: string | null | undefined;
  scheduleType: ScheduleType;
  cronExpression: string | null | undefined;
  scheduledDate: number | null | undefined;
  timezone: string | null | undefined;
  content: string | null | undefined;
  wakeWhenRunning: boolean;
  isActive: boolean;
  scheduleId?: string;
  agentId?: string;
  creatorId?: string | null | undefined;
  kind?: string;
  createdAt?: number;
  updatedAt?: number;
  lastTriggeredAt?: number | null | undefined;
  nextTriggerAt?: number | null | undefined;
  nextTriggerAt$set?: number | null | undefined;
};


export function normalizeScheduleUpdate(
  parsed: {
    scheduleType?: ScheduleType;
    cronExpression?: string | null;
    scheduledDate?: string | null;
    isActive?: boolean;
    wakeWhenRunning?: boolean;
  },
  existing: {
    scheduleType: ScheduleType;
    cronExpression: string | null | undefined;
    scheduledDate: number | null | undefined;
    wakeWhenRunning: boolean;
  },
  parseScheduleDate: (input: string) => number,
): NormalizedScheduleUpdate {
  const scheduleType = parsed.scheduleType ?? existing.scheduleType;
  const cronExpression =
    parsed.cronExpression === undefined
      ? existing.cronExpression
      : (parsed.cronExpression ?? undefined);
  const scheduledDateRaw =
    parsed.scheduledDate === undefined
      ? existing.scheduledDate
      : parsed.scheduledDate === null
        ? undefined
        : parseScheduleDate(parsed.scheduledDate);

  const shouldRequireFutureDate =
    scheduleType === 'date' &&
    (parsed.scheduledDate !== undefined ||
      parsed.scheduleType !== undefined ||
      parsed.isActive === true);

  return {
    scheduleType,
    cronExpression: scheduleType === 'cron' ? (cronExpression ?? null) : null,
    scheduledDate: scheduleType === 'date' ? ((scheduledDateRaw as number) ?? null) : null,
    wakeWhenRunning:
      scheduleType === 'cron'
        ? (parsed.wakeWhenRunning ?? existing.wakeWhenRunning)
        : true,
    shouldRequireFutureDate,
    parsedScheduledDate: scheduledDateRaw as number,
  };
}

/**
 * Builds the store update payload from parsed input + normalized values.
 * Extracted from updateSchedule and updateOwnedSchedule which previously
 * duplicated this logic inline.
 */
export function buildScheduleUpdateInput(
  parsed: ScheduleUpdateInputParts,
  normalized: {
    scheduleType: ScheduleType;
    cronExpression: string | null;
    scheduledDate: number | null;
    wakeWhenRunning: boolean;
  },
): {
  name: string | null;
  description: string | null | undefined;
  scheduleType: ScheduleType;
  cronExpression: string | null | undefined;
  scheduledDate: number | null;
  timezone: string | null | undefined;
  content: string | null | undefined;
  wakeWhenRunning: boolean;
  isActive: boolean | undefined;
} {
  return {
    name: parsed.name ?? null,
    description: parsed.description ?? null,
    scheduleType: normalized.scheduleType,
    cronExpression: normalized.cronExpression,
    scheduledDate: normalized.scheduledDate,
    timezone: parsed.timezone ?? null,
    content: parsed.content ?? null,
    wakeWhenRunning: normalized.wakeWhenRunning,
    isActive: parsed.isActive,
  };
}

/**
 * Builds the rollback payload from the existing schedule state.
 * Used by error-recovery paths in updateSchedule and updateOwnedSchedule.
 */
export function buildScheduleRollbackInput(existing: ExistingScheduleFields): {
  name: string;
  description: string | null | undefined;
  scheduleType: ScheduleType;
  cronExpression: string | null;
  scheduledDate: number | null;
  timezone: string | null | undefined;
  content: string | null | undefined;
  wakeWhenRunning: boolean;
  isActive: boolean;
} {
  return {
    name: existing.name,
    description: existing.description ?? null,
    scheduleType: existing.scheduleType,
    cronExpression: existing.cronExpression ?? null,
    scheduledDate: existing.scheduledDate ?? null,
    timezone: existing.timezone,
    content: existing.content ?? null,
    wakeWhenRunning: existing.wakeWhenRunning,
    isActive: existing.isActive,
  };
}
