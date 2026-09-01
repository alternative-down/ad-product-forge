import { describe, expect, it } from 'vitest';
import { InvalidPayableDueAtError } from './write.errors';

describe('InvalidPayableDueAtError', () => {
  it('preserves verbatim message', () => {
    const err = new InvalidPayableDueAtError();
    expect(err).toBeInstanceOf(InvalidPayableDueAtError);
    expect(err.name).toBe('InvalidPayableDueAtError');
    expect(err.code).toBe('INVALID_PAYABLE_DUE_AT');
    expect(err.message).toBe('Invalid payable dueAt');
  });
});
