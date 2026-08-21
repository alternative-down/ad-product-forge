import { describe, expect, it } from 'vitest';
import { MicroErpUnknownCashMovementActionError } from './tools.errors';

describe('MicroErpUnknownCashMovementActionError', () => {
  it('preserves verbatim message', () => {
    const err = new MicroErpUnknownCashMovementActionError('invalid');
    expect(err).toBeInstanceOf(MicroErpUnknownCashMovementActionError);
    expect(err.name).toBe('MicroErpUnknownCashMovementActionError');
    expect(err.code).toBe('MICRO_ERP_UNKNOWN_CASH_MOVEMENT_ACTION');
    expect(err.action).toBe('invalid');
    expect(err.message).toBe('Unknown cash movement action: invalid');
  });
});
