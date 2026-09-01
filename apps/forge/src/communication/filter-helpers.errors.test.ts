import { describe, expect, it } from 'vitest';
import { CommunicationInvalidFilterValueError } from './filter-helpers.errors';

describe('CommunicationInvalidFilterValueError', () => {
  it('preserves verbatim message', () => {
    const err = new CommunicationInvalidFilterValueError('status', 'invalid');
    expect(err).toBeInstanceOf(CommunicationInvalidFilterValueError);
    expect(err.name).toBe('CommunicationInvalidFilterValueError');
    expect(err.code).toBe('COMMUNICATION_INVALID_FILTER_VALUE');
    expect(err.fieldName).toBe('status');
    expect(err.value).toBe('invalid');
    expect(err.message).toBe('Invalid status: invalid');
  });
});
