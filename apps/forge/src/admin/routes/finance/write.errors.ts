/**
 * Typed Error subclasses for the admin/routes/finance/write module
 * (Pattern L, D52 #6502 batch 38).
 */
export class InvalidPayableDueAtError extends Error {
  readonly code = 'INVALID_PAYABLE_DUE_AT' as const;
  constructor() {
    super('Invalid payable dueAt');
    this.name = 'InvalidPayableDueAtError';
  }
}
