/**
 * Typed Error subclasses for the finance/company-payables module (Pattern L, D52 #6502 batch 24).
 *
 * Replaces 2 raw `throw new Error(...)` calls in company-payables.ts with 2 typed
 * Error subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/finance/company-payables.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` tests in company-payables.test.ts:
 *   - L545 expects `'Recurring payable not found: nonexistent'`.
 *
 * Pattern reference: apps/forge/src/finance/company-cash-operations.errors.ts
 * (D51 batch 7 — Kaelen), apps/forge/src/finance/payment-receivables.errors.ts
 * (D51 batch 14 — Varek).
 */

export class RecurringPayableNotFoundError extends Error {
  readonly code = 'RECURRING_PAYABLE_NOT_FOUND' as const;
  readonly payableId: string;

  constructor(payableId: string) {
    super(`Recurring payable not found: ${payableId}`);
    this.name = 'RecurringPayableNotFoundError';
    this.payableId = payableId;
  }
}

export class UnknownRecurrencePeriodError extends Error {
  readonly code = 'UNKNOWN_RECURRENCE_PERIOD' as const;
  readonly value: string;

  constructor(value: string) {
    super(`Unknown recurrencePeriod: ${value}`);
    this.name = 'UnknownRecurrencePeriodError';
    this.value = value;
  }
}
