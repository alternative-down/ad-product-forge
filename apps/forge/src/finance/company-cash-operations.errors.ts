/**
 * Typed Error classes for company-cash-operations.ts.
 *
 * Replaces raw `throw new Error(...)` at L107, L111, L134, L137 of
 * apps/forge/src/finance/company-cash-operations.ts with discriminated
 * typed errors. Discriminator pattern: 2 classes with `readonly` context
 * fields instead of 4 distinct classes. Saves boilerplate, keeps tests
 * simple, downstream consumers can use `err instanceof XError` plus
 * `err.action` / `err.entryId` for fine-grained handling.
 *
 * Pattern L #6502 batch 7 (D51 cycle 24+).
 */

export class CompanyCashEntryNotFoundError extends Error {
  readonly code = 'COMPANY_CASH_ENTRY_NOT_FOUND';
  readonly entryId: string;

  constructor(entryId: string) {
    super(`Company cash entry not found: ${entryId}`);
    this.name = 'CompanyCashEntryNotFoundError';
    this.entryId = entryId;
  }
}

export class CompanyCashEntryNotPlannedError extends Error {
  readonly code = 'COMPANY_CASH_ENTRY_NOT_PLANNED';
  readonly entryId: string;
  readonly action: 'canceled' | 'posted';

  constructor(entryId: string, action: 'canceled' | 'posted') {
    const verb = action === 'canceled' ? 'canceled' : 'posted';
    super(`Only planned company cash entries can be ${verb}: ${entryId}`);
    this.name = 'CompanyCashEntryNotPlannedError';
    this.entryId = entryId;
    this.action = action;
  }
}
