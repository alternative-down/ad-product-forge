/**
 * Typed Error subclasses for the finance/payment-providers module (Pattern L, D51 #6502 batch 19).
 *
 * Replaces 3 raw `throw new Error(...)` calls in asaas.ts with 3 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/finance/payment-providers/asaas.ts collapse to 3 typed Error
 * classes. Message format is preserved verbatim for backward compatibility
 * with existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/finance/payment-receivables.errors.ts (D51
 * batch 14 — Varek), apps/forge/src/admin/routes/errors.ts (D51 batch 17 —
 * Aldric), apps/forge/src/coolify/errors.ts (D51 batch 18 — Aldric).
 */

export class AsaasWebhookMissingSignatureHeaderError extends Error {
  readonly code = 'ASAAS_WEBHOOK_MISSING_SIGNATURE_HEADER' as const;
  constructor() {
    super('Asaas webhook: missing x-asaas-signature header');
    this.name = 'AsaasWebhookMissingSignatureHeaderError';
  }
}

export class AsaasWebhookInvalidSignatureError extends Error {
  readonly code = 'ASAAS_WEBHOOK_INVALID_SIGNATURE' as const;
  constructor() {
    super('Asaas webhook: invalid signature');
    this.name = 'AsaasWebhookInvalidSignatureError';
  }
}

export class AsaasWebhookParsePayloadError extends Error {
  readonly code = 'ASAAS_WEBHOOK_PARSE_PAYLOAD' as const;
  readonly errorMessage: string;
  constructor(errorMessage: string) {
    super('Asaas webhook: failed to parse JSON payload');
    this.name = 'AsaasWebhookParsePayloadError';
    this.errorMessage = errorMessage;
  }
}
