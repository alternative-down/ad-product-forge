import { describe, expect, it } from 'vitest';

import {
  RecurringPayableNotFoundError,
  UnknownRecurrencePeriodError,
} from './company-payables.errors';

describe('RecurringPayableNotFoundError', () => {
  it('preserves verbatim message with payable id', () => {
    const err = new RecurringPayableNotFoundError('pay-123');
    expect(err).toBeInstanceOf(RecurringPayableNotFoundError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RecurringPayableNotFoundError');
    expect(err.code).toBe('RECURRING_PAYABLE_NOT_FOUND');
    expect(err.payableId).toBe('pay-123');
    expect(err.message).toBe('Recurring payable not found: pay-123');
    expect(err.stack).toBeDefined();
  });

  it('handles uuid-style payable id', () => {
    const err = new RecurringPayableNotFoundError(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.message).toBe(
      'Recurring payable not found: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.payableId).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });
});

describe('UnknownRecurrencePeriodError', () => {
  it('preserves verbatim message format for exhaustive check', () => {
    const err = new UnknownRecurrencePeriodError('quarterly');
    expect(err).toBeInstanceOf(UnknownRecurrencePeriodError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnknownRecurrencePeriodError');
    expect(err.code).toBe('UNKNOWN_RECURRENCE_PERIOD');
    expect(err.value).toBe('quarterly');
    expect(err.message).toBe('Unknown recurrencePeriod: quarterly');
  });

  it('handles unexpected stringified type names', () => {
    const err = new UnknownRecurrencePeriodError('undefined');
    expect(err.value).toBe('undefined');
    expect(err.message).toBe('Unknown recurrencePeriod: undefined');
  });
});
