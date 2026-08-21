/**
 * Typed Error subclasses for the communication/filter-helpers module (Pattern L, D52 #6502 batch 36).
 */
export class CommunicationInvalidFilterValueError extends Error {
  readonly code = 'COMMUNICATION_INVALID_FILTER_VALUE' as const;
  readonly fieldName: string;
  readonly value: string;
  constructor(fieldName: string, value: string) {
    super(`Invalid ${fieldName}: ${value}`);
    this.name = 'CommunicationInvalidFilterValueError';
    this.fieldName = fieldName;
    this.value = value;
  }
}
