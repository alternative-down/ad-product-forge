/**
 * Typed Error subclasses for the github/manager module (Pattern L, D51 #6502 batch 10).
 *
 * Replaces 3 raw `throw new Error(...)` calls in manager.ts with 3 typed Error
 * subclasses (1-per-cluster) so consumers can use `err instanceof XError`
 * instead of parsing human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-service.errors.ts (D50 #6502 batch 6),
 * apps/forge/src/email/migadu-manager.errors.ts (D51 #6502 batch 9).
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/github/manager.ts collapse to 3 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class ParseCredentialsNotInitializedError extends Error {
  constructor() {
    super('parseCredentials not initialized');
    this.name = 'ParseCredentialsNotInitializedError';
  }
}

export class CreateGitHubAppNotInitializedError extends Error {
  constructor() {
    super('createGitHubApp not initialized');
    this.name = 'CreateGitHubAppNotInitializedError';
  }
}

export class OpsRoutingNotInitializedError extends Error {
  constructor() {
    super('opsRouting not initialized');
    this.name = 'OpsRoutingNotInitializedError';
  }
}
