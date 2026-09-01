import { describe, expect, it } from 'vitest';

import {
  CompanyCashEntryNotFoundError,
  CompanyCashEntryNotPlannedError,
} from './company-cash-operations.errors';

describe('CompanyCashEntryNotFoundError', () => {
  it('instanceof + name + code + message discrimination', () => {
    const err = new CompanyCashEntryNotFoundError('entry-123');
    expect(err).toBeInstanceOf(CompanyCashEntryNotFoundError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CompanyCashEntryNotFoundError');
    expect(err.code).toBe('COMPANY_CASH_ENTRY_NOT_FOUND');
    expect(err.entryId).toBe('entry-123');
    expect(err.message).toBe('Company cash entry not found: entry-123');
    expect(err.stack).toBeDefined();
  });

  it('preserves entryId field for downstream handling', () => {
    const err = new CompanyCashEntryNotFoundError('entry-abc');
    expect(err.entryId).toBe('entry-abc');
  });
});

describe('CompanyCashEntryNotPlannedError', () => {
  it('discriminates canceled vs posted via action field', () => {
    const canceledErr = new CompanyCashEntryNotPlannedError('entry-1', 'canceled');
    expect(canceledErr).toBeInstanceOf(CompanyCashEntryNotPlannedError);
    expect(canceledErr.name).toBe('CompanyCashEntryNotPlannedError');
    expect(canceledErr.code).toBe('COMPANY_CASH_ENTRY_NOT_PLANNED');
    expect(canceledErr.action).toBe('canceled');
    expect(canceledErr.entryId).toBe('entry-1');
    expect(canceledErr.message).toBe(
      'Only planned company cash entries can be canceled: entry-1',
    );
  });

  it('produces posted message format', () => {
    const postedErr = new CompanyCashEntryNotPlannedError('entry-2', 'posted');
    expect(postedErr.action).toBe('posted');
    expect(postedErr.message).toBe(
      'Only planned company cash entries can be posted: entry-2',
    );
  });
});
