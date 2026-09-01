/**
 * Typed Error subclasses for the micro-erp/tools module (Pattern L, D52 #6502 batch 37).
 */
export class MicroErpUnknownCashMovementActionError extends Error {
  readonly code = 'MICRO_ERP_UNKNOWN_CASH_MOVEMENT_ACTION' as const;
  readonly action: string;
  constructor(action: string) {
    super(`Unknown cash movement action: ${action}`);
    this.name = 'MicroErpUnknownCashMovementActionError';
    this.action = action;
  }
}
