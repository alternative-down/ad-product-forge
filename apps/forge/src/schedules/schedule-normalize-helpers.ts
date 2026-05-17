
export type NormalizedScheduleUpdate = {
  scheduleType: string;
  cronExpression: string | null;
  scheduledDate: number | null;
  wakeWhenRunning: boolean;
  shouldRequireFutureDate: boolean;
  parsedScheduledDate: number | undefined;
};

/** Shape of the parsed update input that contributes non-normalized fields. */
export type ScheduleUpdateInputParts = {
  name?: string | null;
  description?: string | null;
  timezone?: string | null;
  content?: string | null;
  isActive?: boolean;
};

/** Shape of the existing schedule record used as base/defaults. */
export type ExistingScheduleFields = {
  name: string;
  description: string | null;
  scheduleType: string;
  cronExpression: string | null;
  scheduledDate: string | null;
  timezone: string | null;
  content: string | null;
  wakeWhenRunning: boolean;
  isActive: boolean;
};

export function normalizeScheduleUpdate(
  parsed: {
    scheduleType?: string;
    cronExpression?: string | null;
    scheduledDate?: string | null;
    isActive?: boolean;
  },
  existing: {
    scheduleType: string;
    cronExpression: string | null;
    scheduledDate: string | null;
    wakeWhenRunning: boolean;
  },
  parseScheduleDate: (input: string) => number,
): NormalizedScheduleUpdate {
  const scheduleType = parsed.scheduleType ?? existing.scheduleType;
  const cronExpression = parsed.cronExpression === undefined
    ? existing.cronExpression
    : parsed.cronExpression ?? undefined;
  const scheduledDateRaw = parsed.scheduledDate === undefined
    ? existing.scheduledDate
    : parsed.scheduledDate === null
      ? undefined
      : parseScheduleDate(parsed.scheduledDate);

  const shouldRequireFutureDate =
    scheduleType === 'date' &&
    (
      parsed.scheduledDate !== undefined ||
      parsed.scheduleType !== undefined ||
      parsed.isActive === true
    );

  return {
    scheduleType,
    cronExpression: scheduleType === 'cron' ? (cronExpression ?? null) : null,
    scheduledDate: scheduleType === 'date' ? (scheduledDateRaw as number ?? null) : null,
    wakeWhenRunning: scheduleType === 'cron' ? ((parsed as any).wakeWhenRunning ?? (existing as any).wakeWhenRunning) : true,
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
    scheduleType: string;
    cronExpression: string | null;
    scheduledDate: number | null;
    wakeWhenRunning: boolean;
  },
): {
  name: string | null;
  description: string | null;
  scheduleType: string;
  cronExpression: string | null;
  scheduledDate: number | null;
  timezone: string | null;
  content: string | null;
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
export function buildScheduleRollbackInput(
  existing: ExistingScheduleFields,
): {
  name: string;
  description: string | null;
  scheduleType: string;
  cronExpression: string | null;
  scheduledDate: string | null;
  timezone: string | null;
  content: string | null;
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
