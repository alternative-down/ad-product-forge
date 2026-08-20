/**
 * Typed Error subclasses for the encryption/crypto module (Pattern L, D51 #6502 batch 13).
 *
 * Replaces 3 raw `throw new Error(...)` calls in crypto.ts with 3 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/encryption/crypto.ts collapse to 3 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.toThrow(<substring>)` tests in crypto.test.ts.
 *
 * Pattern reference: apps/forge/src/coolify/polling-helpers.errors.ts (D50 batch 4),
 * apps/forge/src/coolify/manager.errors.ts (D51 batch 13 batch-A — Varek, this sprint),
 * apps/forge/src/llm/runtime-model.errors.ts (D51 batch 12 — Aldric).
 */

export class MissingEncryptionKeyError extends Error {
  readonly code = 'MISSING_ENCRYPTION_KEY' as const;
  constructor() {
    super('ENCRYPTION_KEY environment variable is required');
    this.name = 'MissingEncryptionKeyError';
  }
}

export class InvalidEncryptionKeyLengthError extends Error {
  readonly code = 'INVALID_ENCRYPTION_KEY_LENGTH' as const;
  readonly actualLength: number;
  constructor(actualLength: number) {
    super(
      `ENCRYPTION_KEY must be 256-bit (32 bytes). ` +
        `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" (got ${actualLength} bytes)`,
    );
    this.name = 'InvalidEncryptionKeyLengthError';
    this.actualLength = actualLength;
  }
}

export class InvalidEncryptedInputError extends Error {
  readonly code = 'INVALID_ENCRYPTED_INPUT' as const;
  readonly actualLength: number;
  readonly minimumLength: number;
  constructor(actualLength: number, minimumLength: number = 32) {
    super(
      `Invalid encrypted input: combined buffer must contain IV (16) + ciphertext + authTag (16) (got ${actualLength} bytes, minimum ${minimumLength})`,
    );
    this.name = 'InvalidEncryptedInputError';
    this.actualLength = actualLength;
    this.minimumLength = minimumLength;
  }
}
