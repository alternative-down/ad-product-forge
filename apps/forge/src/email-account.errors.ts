/**
 * Typed Error subclasses for the email-account module (Pattern L, D52 #6502 batch 32).
 *
 * Replaces 2 raw `throw new Error(...)` calls in email-account.ts with 2 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 */

export class EmailProviderDisposedError extends Error {
  readonly code = 'EMAIL_PROVIDER_DISPOSED' as const;
  constructor() {
    super('Email provider is disposed');
    this.name = 'EmailProviderDisposedError';
  }
}

export class EmailSendMissingTargetKeyError extends Error {
  readonly code = 'EMAIL_SEND_MISSING_TARGET_KEY' as const;
  constructor() {
    super('[email] Cannot send without a targetKey');
    this.name = 'EmailSendMissingTargetKeyError';
  }
}
