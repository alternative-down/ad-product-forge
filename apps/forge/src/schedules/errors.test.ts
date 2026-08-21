/**
 * Tests for Pattern L typed Errors in schedules module (D52 #6628 batch 1).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields are exposed on the error for downstream consumers
 *
 * See apps/forge/src/schedules/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidScheduleKindError,
  ScheduleAuthorizationError,
  ScheduleCreationError,
  ScheduleNotFoundError,
  ScheduleShapeError,
  ScheduleValidationError,
} from './errors';

describe('schedules/errors — Pattern L typed Errors (D52 #6628 batch 1)', () => {
  describe('ScheduleNotFoundError', () => {
    it('preserves verbatim message without context', () => {
      const error = new ScheduleNotFoundError('sched-123');
      expect(error).toBeInstanceOf(ScheduleNotFoundError);
      expect(error.code).toBe('SCHEDULE_NOT_FOUND');
      expect(error.scheduleId).toBe('sched-123');
      expect(error.message).toBe('Schedule not found: sched-123');
    });

    it('appends "after update" context to message', () => {
      const error = new ScheduleNotFoundError('sched-456', 'after update');
      expect(error.scheduleId).toBe('sched-456');
      expect(error.message).toBe('Schedule not found after update: sched-456');
    });

    it('appends "or not authorized" context to message', () => {
      const error = new ScheduleNotFoundError('sched-789', 'or not authorized');
      expect(error.message).toBe('Schedule not found or not authorized: sched-789');
    });
  });

  describe('ScheduleAuthorizationError', () => {
    it('captures action=edit and preserves verbatim message', () => {
      const error = new ScheduleAuthorizationError('sched-1', 'edit');
      expect(error).toBeInstanceOf(ScheduleAuthorizationError);
      expect(error.code).toBe('SCHEDULE_AUTHORIZATION');
      expect(error.scheduleId).toBe('sched-1');
      expect(error.action).toBe('edit');
      expect(error.message).toBe('Not authorized to edit schedule: sched-1');
    });

    it('captures action=delete and preserves verbatim message', () => {
      const error = new ScheduleAuthorizationError('sched-2', 'delete');
      expect(error.action).toBe('delete');
      expect(error.message).toBe('Not authorized to delete schedule: sched-2');
    });
  });

  describe('ScheduleValidationError', () => {
    it('preserves scheduledDate field with detail', () => {
      const error = new ScheduleValidationError('scheduledDate', 'not-a-date');
      expect(error).toBeInstanceOf(ScheduleValidationError);
      expect(error.code).toBe('SCHEDULE_VALIDATION');
      expect(error.field).toBe('scheduledDate');
      expect(error.message).toBe('Invalid scheduledDate: not-a-date');
    });

    it('preserves cronExpression field message', () => {
      const error = new ScheduleValidationError('cronExpression');
      expect(error.field).toBe('cronExpression');
      expect(error.message).toBe(
        'cronExpression is required when scheduleType is cron',
      );
    });

    it('preserves scheduledDate required for date detail message', () => {
      const error = new ScheduleValidationError('scheduledDate', 'required for date');
      expect(error.message).toBe('scheduledDate is required when scheduleType is date');
    });

    it('preserves future field message', () => {
      const error = new ScheduleValidationError('future');
      expect(error.field).toBe('future');
      expect(error.message).toBe('scheduledDate must be in the future');
    });
  });

  describe('InvalidScheduleKindError', () => {
    it('captures received and reason=invalid kind', () => {
      const error = new InvalidScheduleKindError('weird-kind', 'invalid kind');
      expect(error).toBeInstanceOf(InvalidScheduleKindError);
      expect(error.code).toBe('INVALID_SCHEDULE_KIND');
      expect(error.received).toBe('weird-kind');
      expect(error.message).toBe('invalid schedule kind: "weird-kind"');
    });

    it('captures reason=invalid type', () => {
      const error = new InvalidScheduleKindError('weird-type', 'invalid type');
      expect(error.message).toBe('invalid scheduleType: "weird-type"');
    });

    it('captures reason=unknown type', () => {
      const error = new InvalidScheduleKindError('weird-type', 'unknown type');
      expect(error.message).toBe('Unknown scheduleType: "weird-type"');
    });
  });

  describe('ScheduleShapeError', () => {
    it('captures missing=cronExpression', () => {
      const error = new ScheduleShapeError('sched-1', 'cronExpression');
      expect(error).toBeInstanceOf(ScheduleShapeError);
      expect(error.code).toBe('SCHEDULE_SHAPE');
      expect(error.scheduleId).toBe('sched-1');
      expect(error.missing).toBe('cronExpression');
      expect(error.message).toBe(
        'invalid cron schedule: missing cronExpression for scheduleId=sched-1',
      );
    });

    it('captures missing=scheduledDate', () => {
      const error = new ScheduleShapeError('sched-2', 'scheduledDate');
      expect(error.missing).toBe('scheduledDate');
      expect(error.message).toBe(
        'invalid date schedule: missing scheduledDate for scheduleId=sched-2',
      );
    });
  });

  describe('ScheduleCreationError', () => {
    it('captures recordId and preserves verbatim message', () => {
      const error = new ScheduleCreationError('rec-99');
      expect(error).toBeInstanceOf(ScheduleCreationError);
      expect(error.code).toBe('SCHEDULE_CREATION');
      expect(error.recordId).toBe('rec-99');
      expect(error.message).toBe('Failed to load created schedule: rec-99');
    });
  });
});
