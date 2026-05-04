import type { z } from 'zod';

export type NormalizedScheduleUpdate = {
  scheduleType: string;
  cronExpression: string | null;
  scheduledDate: number | null;
  wakeWhenRunning: boolean;
  shouldRequireFutureDate: boolean;
  parsedScheduledDate: number | undefined;
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
    scheduledDate: scheduleType === 'date' ? (scheduledDateRaw ?? null) : null,
    wakeWhenRunning: scheduleType === 'cron' ? (parsed.wakeWhenRunning ?? existing.wakeWhenRunning) : true,
    shouldRequireFutureDate,
    parsedScheduledDate: scheduledDateRaw,
  };
}