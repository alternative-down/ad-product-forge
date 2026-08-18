/**
 * Typed Error subclasses for the schedules module (Pattern L, D49).
 *
 * Replaces 21 raw `throw new Error(...)` calls with typed Error subclasses
 * so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6522.
 *
 * Pattern reference: apps/forge/src/capabilities/role-errors.ts (Pattern I,
 * D45), apps/forge/src/communication/internal-chat-errors.ts (Pattern L).
 *
 * Migration impact: 9 literal "Schedule not found: ${scheduleId}"
 * duplicates in mutations.ts collapse to a single typed Error class
 * (DRY win). Message format is preserved for backward compatibility with
 * existing tests (`rejects.toThrow(/Schedule not found: .../)`).
 */

/**
 * Thrown by mutations.ts when a schedule row is not found, was deleted
 * concurrently, or fails an authorization pre-check.
 *
 * Replaces 9 literal `throw new Error(\`Schedule not found...\`)` sites
 * in apps/forge/src/schedules/manager/mutations.ts. Consumers should use
 * `err instanceof ScheduleNotFoundError` instead of string-matching.
 */
export class ScheduleNotFoundError extends Error {
  readonly code = 'SCHEDULE_NOT_FOUND' as const;
  readonly scheduleId: string;

  constructor(
    scheduleId: string,
    context?: 'after update' | 'or not authorized',
  ) {
    const suffix = context ? ` ${context}` : '';
    super(`Schedule not found${suffix}: ${scheduleId}`);
    this.name = 'ScheduleNotFoundError';
    this.scheduleId = scheduleId;
  }
}

/**
 * Thrown by auth.ts when the current principal is not authorized to
 * edit or delete a schedule. Replaces 2 raw `throw new Error(...)` sites.
 */
export class ScheduleAuthorizationError extends Error {
  readonly code = 'SCHEDULE_AUTHORIZATION' as const;
  readonly scheduleId: string;
  readonly action: 'edit' | 'delete';

  constructor(scheduleId: string, action: 'edit' | 'delete') {
    super(`Not authorized to ${action} schedule: ${scheduleId}`);
    this.name = 'ScheduleAuthorizationError';
    this.scheduleId = scheduleId;
    this.action = action;
  }
}

/**
 * Thrown by wake-content.ts when a schedule input fails validation.
 * Replaces 4 raw `throw new Error(...)` sites:
 *   - parseScheduleDate: 'Invalid scheduledDate: ${value}'
 *   - validateScheduleShape (cron): 'cronExpression is required when scheduleType is cron'
 *   - validateScheduleShape (date): 'scheduledDate is required when scheduleType is date'
 *   - assertFutureScheduledDate: 'scheduledDate must be in the future'
 *
 * The `field` discriminator + optional `detail` covers all 4 message shapes
 * without losing the structured property semantics. Consumers should branch
 * on `field` (or use `err instanceof ScheduleValidationError`).
 */
export class ScheduleValidationError extends Error {
  readonly code = 'SCHEDULE_VALIDATION' as const;
  readonly field: 'scheduledDate' | 'cronExpression' | 'future';

  constructor(
    field: 'scheduledDate' | 'cronExpression' | 'future',
    detail?: string,
  ) {
    let message: string;
    if (field === 'future') {
      message = 'scheduledDate must be in the future';
    } else if (field === 'cronExpression') {
      message = 'cronExpression is required when scheduleType is cron';
    } else if (detail === 'required for date') {
      message = 'scheduledDate is required when scheduleType is date';
    } else {
      message = `Invalid scheduledDate: ${detail ?? ''}`;
    }
    super(message);
    this.name = 'ScheduleValidationError';
    this.field = field;
  }
}

/**
 * Thrown by lifecycle.ts when a schedule row contains an invalid kind,
 * scheduleType, or unknown enum value. Replaces 5 raw `throw new Error(...)`
 * sites.
 */
export class InvalidScheduleKindError extends Error {
  readonly code = 'INVALID_SCHEDULE_KIND' as const;
  readonly received: unknown;

  constructor(received: unknown, reason: 'invalid kind' | 'invalid type' | 'unknown type') {
    const msg = reason === 'invalid type' ? `invalid scheduleType: ${JSON.stringify(received)}` : reason === 'unknown type' ? `Unknown scheduleType: ${JSON.stringify(received)}` : `invalid schedule kind: ${JSON.stringify(received)}`;
    super(msg);
    this.name = 'InvalidScheduleKindError';
    this.received = received;
  }
}


/**
 * Thrown by lifecycle.ts when a schedule row has a scheduleType but is
 * missing the corresponding payload (cronExpression for cron, scheduledDate
 * for date). Replaces 2 raw `throw new Error(...)` sites.
 */
export class ScheduleShapeError extends Error {
  readonly code = 'SCHEDULE_SHAPE' as const;
  readonly scheduleId: string;
  readonly missing: 'cronExpression' | 'scheduledDate';

  constructor(scheduleId: string, missing: 'cronExpression' | 'scheduledDate') {
    const kind = missing === 'cronExpression' ? 'cron' : 'date';
    super(`invalid ${kind} schedule: missing ${missing} for scheduleId=${scheduleId}`);
    this.name = 'ScheduleShapeError';
    this.scheduleId = scheduleId;
    this.missing = missing;
  }
}

/**
 * Thrown by mutations.ts after a createSchedule operation succeeds at
 * insert but the immediate reload returns null (race condition or
 * corrupted DB). Replaces 1 raw `throw new Error(...)` site.
 */
export class ScheduleCreationError extends Error {
  readonly code = 'SCHEDULE_CREATION' as const;
  readonly recordId: string;

  constructor(recordId: string) {
    super(`Failed to load created schedule: ${recordId}`);
    this.name = 'ScheduleCreationError';
    this.recordId = recordId;
  }
}
