/**
 * Typed Error subclasses for the communication/internal-chat-service module (Pattern L, D50 #6502 batch 6).
 *
 * Replaces 6 raw `throw new Error(...)` calls in internal-chat-service.ts with 3 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/coolify/polling-helpers.errors.ts (D50 #6502 batch 5 by Kaelen),
 * apps/forge/src/capabilities/store.errors.ts (D50 #6502 batch 4 by Varek).
 *
 * Migration impact: 6 literal `throw new Error(...)` calls in
 * apps/forge/src/communication/internal-chat-service.ts collapse to 3 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class ReadsNotInitializedError extends Error {
  readonly code = 'READS_NOT_YET_INITIALIZED' as const;
  constructor() {
    super('reads not yet initialized');
    this.name = 'ReadsNotInitializedError';
  }
}

export class AccountNotFoundError extends Error {
  readonly code = 'ACCOUNT_NOT_FOUND' as const;
  readonly targetKey: string;
  constructor(targetKey: string) {
    super(`Account not found by targetKey: ${targetKey}`);
    this.name = 'AccountNotFoundError';
    this.targetKey = targetKey;
  }
}

export class AttachmentNotFoundError extends Error {
  readonly code = 'ATTACHMENT_NOT_FOUND' as const;
  readonly attachmentName: string;
  constructor(attachmentName: string) {
    super(`Attachment not found: ${attachmentName}`);
    this.name = 'AttachmentNotFoundError';
    this.attachmentName = attachmentName;
  }
}
